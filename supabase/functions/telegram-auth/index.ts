// Edge Function: telegram-auth
// Проверяет подпись Telegram initData и выдаёт сессию Supabase.
//
// Поток:
//   1. Фронт присылает сырую строку initData (она подписана Telegram).
//   2. Проверяем HMAC-SHA256 подпись секретным токеном бота.
//   3. Если подпись валидна — берём telegram_id из данных.
//   4. Находим/создаём auth-пользователя, связываем с записью в public.users.
//   5. Возвращаем сессию (access_token + refresh_token) фронту.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// SB-001: проверка подписи и свежести initData — ОДНА на все функции входа.
// Здесь лежала её копия: тот же HMAC, тот же порог в 24 часа. Две реализации
// одного и того же означают, что правку (порог, найденный изъян) внесут
// в одну и забудут про вторую.
import { verifyTelegramInitData } from "../_shared/telegram.ts";

// Секреты берутся из окружения функции (зададим их на Шаге 3.3, в код НЕ пишем).
const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// CORS — разрешаем фронту (claude.ai-style домены не нужны; это твой Mini App) звать функцию.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


Deno.serve(async (req) => {
  // Предварительный CORS-запрос браузера
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { initData } = await req.json();
    if (!initData) {
      return new Response(JSON.stringify({ error: "no_init_data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Проверяем подпись
    const verified = await verifyTelegramInitData(initData);
    if (!verified) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Достаём данные пользователя Telegram
    const tgUser = JSON.parse(verified.user || "{}");
    const telegramId = tgUser.id;
    if (!telegramId) {
      return new Response(JSON.stringify({ error: "no_user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Клиент с service_role — может всё (создавать auth-юзеров, читать/писать users)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Ищем существующую запись в public.users по telegram_id
    const { data: existingUser } = await admin
      .from("users")
      .select("id, auth_id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    // Синтетический email для auth-аккаунта (Telegram не даёт email).
    // Формат telegram_<id>@telegram.local — стабильный, привязан к telegram_id.
    const syntheticEmail = `telegram_${telegramId}@telegram.local`;

    let authUserId: string;

    if (existingUser?.auth_id) {
      // Уже связан — используем существующий auth-аккаунт
      authUserId = existingUser.auth_id;
    } else {
      // Создаём auth-пользователя (или находим, если email уже занят)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          first_name: tgUser.first_name || null,
          username: tgUser.username || null,
        },
      });

      if (createErr || !created?.user) {
        // Возможно auth-юзер уже есть — ищем его по email через листинг
        const { data: list } = await admin.auth.admin.listUsers();
        const found = list?.users?.find((u) => u.email === syntheticEmail);
        if (!found) {
          return new Response(JSON.stringify({ error: "auth_create_failed" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUserId = found.id;
      } else {
        authUserId = created.user.id;
      }

      // 4. Связываем запись users с auth-аккаунтом
      if (existingUser) {
        // Существующий юзер (ты и друзья) — проставляем auth_id, прогресс цел
        await admin.from("users").update({ auth_id: authUserId }).eq("id", existingUser.id);
      } else {
        // Новый юзер — создаём запись (id присвоится автоматически через sequence)
        await admin.from("users").insert({
          telegram_id: telegramId,
          first_name: tgUser.first_name || null,
          username: tgUser.username || null,
          photo_url: tgUser.photo_url || null,
          auth_id: authUserId,
        });
      }
    }

    // 5. Генерируем сессию для этого auth-пользователя.
    // generateLink с типом magiclink даёт нам токены без отправки письма.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });

    if (linkErr || !linkData) {
      return new Response(JSON.stringify({ error: "session_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Возвращаем фронту данные для установки сессии
    return new Response(JSON.stringify({
      success: true,
      email: syntheticEmail,
      // Фронт обменяет это на сессию через verifyOtp (см. Шаг 5)
      token_hash: linkData.properties?.hashed_token,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});