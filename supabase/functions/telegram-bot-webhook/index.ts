// Edge Function: telegram-bot-webhook
//
// Принимает нажатия кнопок под сообщениями бота. Сейчас это «Засчитать» и
// «Не засчитывать» под напоминанием о забытой тренировке: человек решает прямо
// в переписке, приложение открывать не нужно.
//
// БЕЗОПАСНОСТЬ. Адрес функции публичный, а в callback-е лежит telegram_id —
// без проверки кто угодно мог бы завершить чужую тренировку. Telegram шлёт
// вместе с обновлением секрет в заголовке `X-Telegram-Bot-Api-Secret-Token`
// (задаётся при setWebhook). Секрет функция выпускает себе сама и хранит в
// таблице bot_config — ни в репозитории, ни в переменных окружения его нет.
//
// Настройка (разово, и повторно безвредна):
//   POST {"action": "setup"} → выпустить секрет и прописать вебхук боту.
//   POST {"action": "status"} → что сейчас у бота (getWebhookInfo).
//
// Данные в callback: `sw:c:<epoch>` — засчитать, `sw:d:<epoch>` — не засчитывать,
// где epoch — время старта тренировки в секундах. Время в кнопке значит, что
// нажатие на старом сообщении не тронет новую тренировку.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;
const SECRET_KEY = "webhook_secret";
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/telegram-bot-webhook`;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function tg(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function setup() {
  let secret = (await db.rpc("srv_bot_config_get", { p_key: SECRET_KEY })).data as string | null;
  if (!secret) {
    // 32 байта случайности в hex — длиннее ограничения Telegram (256 символов) не станет.
    secret = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.rpc("srv_bot_config_set", { p_key: SECRET_KEY, p_value: secret });
  }
  const res = await tg("setWebhook", {
    url: WEBHOOK_URL,
    secret_token: secret,
    allowed_updates: ["callback_query"], // сообщения боту не нужны — он их не читает
    drop_pending_updates: true,
  });
  return { setWebhook: res };
}

// Длительность заплыва меряется метрами, галочек там нет: считаем по времени
// последней отметки, а её нет — берём старт плюс типичные 45 минут.
const SWIM_FALLBACK_MIN = 45;

type Session = {
  user_id: number;
  program_id: string;     // слаг, как в приложении ('split')
  program_db_id: string;  // id справочника, как в таблице тренировок ('prog_001')
  day: string; place: string;
  started_at: string; last_tick_at: string | null;
  done_count: number; done_exercise_ids: string[];
};

async function handleCallback(cb: Record<string, any>) {
  const data = String(cb.data || "");
  const from = cb.from?.id;
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: cb.id, text });

  const m = data.match(/^sw:([cd]):(\d+)$/);
  if (!m || !from) return answer("Не понял кнопку");

  const [, action, epoch] = m;
  const startedAt = new Date(Number(epoch) * 1000).toISOString();

  const { data: rows, error } = await db.rpc("srv_session_for_callback", {
    p_telegram_id: from, p_started_at: startedAt,
  });
  if (error) {
    console.error("[webhook] session lookup:", error.message);
    return answer("Что-то пошло не так, попробуй ещё раз");
  }
  const session = (rows ?? [])[0] as Session | undefined;
  if (!session) {
    await editMessage(cb, "Эта тренировка уже закрыта.");
    return answer("Уже закрыта");
  }

  if (action === "d") {
    await db.rpc("srv_clear_active_session", { p_user_id: session.user_id });
    await editMessage(cb, "Тренировка не засчитана — убрал её.");
    return answer("Убрал");
  }

  const swim = session.program_id === "swim";
  const finishedAt = session.last_tick_at
    ?? new Date(new Date(session.started_at).getTime() + SWIM_FALLBACK_MIN * 60000).toISOString();

  if (!swim && session.done_count === 0) {
    await db.rpc("srv_clear_active_session", { p_user_id: session.user_id });
    await editMessage(cb, "В тренировке не отмечено ни одного упражнения — засчитывать нечего, убрал её.");
    return answer("Убрал");
  }

  // В таблицу тренировок идёт id справочника, а не слаг: на слаге вставка
  // падала по внешнему ключу workouts_program_id_fkey.
  if (!session.program_db_id) {
    console.error("[webhook] программа не найдена в справочнике:", session.program_id);
    return answer("Не получилось сохранить, открой приложение");
  }

  const { data: fin, error: finErr } = await db.rpc("srv_finish_workout", {
    p_user_id: session.user_id,
    p_program_id: session.program_db_id,
    p_day: session.day,
    p_exercise_ids: session.done_exercise_ids ?? [],
    p_finished_at: finishedAt,
    p_started_at: session.started_at,
    p_distance_m: null,
  });
  if (finErr) {
    console.error("[webhook] finish:", finErr.message);
    return answer("Не получилось сохранить, открой приложение");
  }

  await db.rpc("srv_clear_active_session", { p_user_id: session.user_id });

  const already = (fin ?? [])[0]?.already_completed_today;
  const text = already
    ? "За тот день тренировка этого раздела уже записана — вторую не засчитал."
    : "Готово, тренировка засчитана по времени последней отметки.";
  await editMessage(cb, text);
  return answer(already ? "Уже была" : "Засчитал");
}

// Ответ дописываем в само сообщение и убираем кнопки: иначе человек вернётся
// к переписке и не поймёт, чем кончилось.
async function editMessage(cb: Record<string, any>, result: string) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) return;
  const original = cb.message?.text ?? "";
  await tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: `${original}\n\n✅ ${result}`,
    reply_markup: { inline_keyboard: [] },
  });
}

Deno.serve(async (req) => {
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch { /* пустое тело */ }

  if (body.action === "setup") return Response.json(await setup());
  if (body.action === "status") return Response.json(await tg("getWebhookInfo", {}));

  const secret = (await db.rpc("srv_bot_config_get", { p_key: SECRET_KEY })).data as string | null;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || got !== secret) {
    // Молча и с 200: Telegram на ошибку начал бы повторять доставку, а чужому
    // запросу знать, что он не угадал секрет, незачем.
    return new Response("ok");
  }

  if (body.callback_query) {
    try {
      await handleCallback(body.callback_query);
    } catch (e) {
      console.error("[webhook] callback:", (e as Error).message);
    }
  }
  return new Response("ok");
});
