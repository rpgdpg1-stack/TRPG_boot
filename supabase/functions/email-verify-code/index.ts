// Edge Function: email-verify-code
//
// Принимает код из письма и завершает начатое: привязывает почту к аккаунту
// или впускает в браузерную версию.
//
// Сессию выдаём тем же способом, что и Telegram-вход: одноразовый token_hash,
// который фронт меняет на сессию через verifyOtp. Один механизм на оба входа —
// значит один набор граблей, а не два.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { verifyTelegramInitData, telegramIdFrom, corsHeaders, json } from "../_shared/telegram.ts";
import { hashCode } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

type Admin = ReturnType<typeof createClient>;

/** Одноразовый ключ входа для конкретного auth-аккаунта. */
async function issueSession(admin: Admin, authEmail: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: authEmail,
  });
  if (error || !data?.properties?.hashed_token) return null;
  return { email: authEmail, token_hash: data.properties.hashed_token };
}

async function authEmailOf(admin: Admin, authId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(authId);
  return data?.user?.email ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, purpose, code, initData, refCode } = await req.json();

    if (purpose !== "login" && purpose !== "link") {
      return json({ ok: false, error: "bad_purpose" }, 400);
    }
    if (typeof email !== "string" || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return json({ ok: false, error: "bad_args" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Сверяем код. Дальше этой точки он уже сгорел — повторно тот же код
    //    не сработает, даже если запрос повторится.
    const codeHash = await hashCode(code, email);
    const { data: checked, error: checkErr } = await admin.rpc("srv_email_verify_code", {
      p_email: email,
      p_purpose: purpose,
      p_code_hash: codeHash,
    });

    if (checkErr) return json({ ok: false, error: "db_error" }, 500);
    if (!checked?.ok) return json(checked, 400);

    const verifiedEmail: string = checked.email;

    // 2а. ПРИВЯЗКА почты к аккаунту, в котором человек сейчас сидит в Telegram.
    if (purpose === "link") {
      const verified = await verifyTelegramInitData(initData);
      if (!verified) return json({ ok: false, error: "invalid_signature" }, 401);

      const tgId = telegramIdFrom(verified);
      if (!tgId) return json({ ok: false, error: "no_telegram_user" }, 400);

      const { data: row } = await admin
        .from("users").select("id").eq("telegram_id", tgId).maybeSingle();
      if (!row) return json({ ok: false, error: "no_user" }, 404);

      const { data: attached, error: attachErr } = await admin.rpc("srv_email_attach", {
        p_user_id: row.id,
        p_email: verifiedEmail,
      });

      if (attachErr) return json({ ok: false, error: "db_error" }, 500);
      // both_have_data — не сбой, а осознанный отказ: решение за человеком.
      if (!attached?.ok) return json(attached, 409);

      // Аккаунт переехал: человек жил в браузерной записи, а телефонный номер
      // Telegram переехал к ней. Прежняя запись входа осталась ничьей — убираем,
      // и выдаём сессию уже на новый аккаунт, иначе приложение осталось бы
      // с ключом от удалённой двери.
      if (attached.freed_auth_id) {
        try { await admin.auth.admin.deleteUser(attached.freed_auth_id); } catch { /* сирота, не критично */ }
      }

      let session = null;
      if (attached.moved) {
        let finalAuthId: string | null = attached.final_auth_id ?? null;
        let finalEmail: string | null = finalAuthId ? await authEmailOf(admin, finalAuthId) : null;

        if (!finalEmail) {
          const { data: created } = await admin.auth.admin.createUser({
            email: verifiedEmail, email_confirm: true,
          });
          finalAuthId = created?.user?.id ?? null;
          finalEmail = verifiedEmail;
          if (finalAuthId) {
            await admin.from("users").update({ auth_id: finalAuthId }).eq("id", attached.final_user_id);
          }
        }
        if (finalEmail) session = await issueSession(admin, finalEmail);
      }

      return json({
        ok: true,
        email: verifiedEmail,
        moved: !!attached.moved,
        user_id: attached.final_user_id,
        ...(session ?? {}),
      });
    }

    // 2б. ВХОД в браузере.
    const { data: logged, error: loginErr } = await admin.rpc("srv_email_login_user", {
      p_email: verifiedEmail,
      p_auth_id: null,
    });
    if (loginErr || !logged?.ok) return json({ ok: false, error: "db_error" }, 500);

    let authId: string | null = logged.auth_id ?? null;
    let authEmail: string | null = authId ? await authEmailOf(admin, authId) : null;

    if (!authEmail) {
      // Записи входа ещё нет (человек здесь впервые) либо она потерялась.
      // Заводим её на реальный адрес — в отличие от Telegram, тут он настоящий.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: verifiedEmail, email_confirm: true,
      });
      authId = created?.user?.id ?? null;

      if (createErr || !authId) {
        // Адрес мог быть занят прежней записью — ищем её.
        const { data: list } = await admin.auth.admin.listUsers();
        authId = list?.users?.find((u) => u.email === verifiedEmail)?.id ?? null;
        if (!authId) return json({ ok: false, error: "auth_create_failed" }, 500);
      }
      authEmail = verifiedEmail;
      await admin.rpc("srv_email_login_user", { p_email: verifiedEmail, p_auth_id: authId });
    }

    // Пришёл по приглашению — заводим дружбу сразу, пока человек не ушёл
    // с экрана. Ошибка тут не должна ломать вход: друг важен, но вход важнее.
    if (typeof refCode === "string" && refCode) {
      try {
        await admin.rpc("api_add_friend_by_ref", {
          p_user_id: logged.user_id,
          p_referral_code: refCode,
        });
      } catch (e) {
        console.warn("[email-verify-code] referral failed:", String(e));
      }
    }

    const session = await issueSession(admin, authEmail);
    if (!session) return json({ ok: false, error: "session_failed" }, 500);

    return json({ ok: true, user_id: logged.user_id, created: !!logged.created, ...session });

  } catch (e) {
    console.error("[email-verify-code] exception:", String(e));
    return json({ ok: false, error: "exception" }, 500);
  }
});
