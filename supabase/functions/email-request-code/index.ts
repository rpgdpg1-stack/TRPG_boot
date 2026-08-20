// Edge Function: email-request-code
//
// Выпускает одноразовый код и отправляет его письмом.
//
// Две цели, разные требования к доверию:
//   • 'link'  — привязка почты изнутри Telegram. Обязателен подписанный
//               initData: иначе кто угодно привязал бы свою почту к чужому
//               аккаунту и получил вход в него.
//   • 'login' — вход в браузере. Доверять тут нечему по определению, поэтому
//               вся защита — в ограничении частоты и в самом коде.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { verifyTelegramInitData, telegramIdFrom, corsHeaders, json } from "../_shared/telegram.ts";
import { generateCode, hashCode, sendCodeEmail } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, purpose, initData } = await req.json();

    if (purpose !== "login" && purpose !== "link") {
      return json({ ok: false, error: "bad_purpose" }, 400);
    }
    if (typeof email !== "string" || !email.includes("@")) {
      return json({ ok: false, error: "bad_email" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Для привязки — выясняем, ЧЕЙ это аккаунт, по подписи Telegram.
    let userId: number | null = null;
    if (purpose === "link") {
      const verified = await verifyTelegramInitData(initData);
      if (!verified) return json({ ok: false, error: "invalid_signature" }, 401);

      const tgId = telegramIdFrom(verified);
      if (!tgId) return json({ ok: false, error: "no_telegram_user" }, 400);

      const { data: row } = await admin
        .from("users").select("id").eq("telegram_id", tgId).maybeSingle();
      if (!row) return json({ ok: false, error: "no_user" }, 404);
      userId = row.id;
    }

    const code = generateCode();
    const codeHash = await hashCode(code, email);

    // Лимиты частоты проверяет база — там же, где хранятся коды, чтобы их
    // нельзя было обойти вторым экземпляром функции.
    const { data: issued, error: rpcError } = await admin.rpc("srv_email_issue_code", {
      p_email: email,
      p_purpose: purpose,
      p_code_hash: codeHash,
      p_ttl_seconds: 600,
      p_user_id: userId,
    });

    if (rpcError) return json({ ok: false, error: "db_error" }, 500);
    if (!issued?.ok) {
      // too_soon и rate_limited возвращаем честно: человеку нужно понимать,
      // что ждать, а не гадать, почему письмо не идёт.
      return json(issued, issued?.error === "bad_email" ? 400 : 429);
    }

    try {
      await sendCodeEmail(issued.email, code, purpose);
    } catch (e) {
      console.error("[email-request-code] send failed:", String(e));
      return json({ ok: false, error: "send_failed" }, 502);
    }

    // Наружу — только факт отправки. Существует ли такой аккаунт, ответ не
    // выдаёт: иначе через форму входа можно было бы проверять чужие адреса
    // на регистрацию в приложении.
    return json({ ok: true });

  } catch (e) {
    console.error("[email-request-code] exception:", String(e));
    return json({ ok: false, error: "exception" }, 500);
  }
});
