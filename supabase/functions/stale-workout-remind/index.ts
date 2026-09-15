// Edge Function: stale-workout-remind
// Напоминание в Telegram о забытой тренировке.
//
// Кого звать — решает база (srv_stale_session_candidates: 90 мин после последней
// галочки, 3 ч после старта без галочек). Здесь только текст и отправка.
// Кнопки: «Засчитать» и «Не засчитывать» решают всё прямо в переписке (нажатие
// принимает telegram-bot-webhook), третья открывает приложение — там та же
// модалка «Тренировка не завершена».
//
// Вызов: POST {} — разослать; POST {"dry_run": true} — только показать, кому и что
// ушло бы (ничего не шлёт и не отмечает).
//
// verify_jwt=false: функция ничего не берёт от вызывающего, а повторный вызов
// безвреден — отправленное помечается reminded_at и второй раз не уходит.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;
const FALLBACK_BOT = "TrainingRPGbot";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
  "августа", "сентября", "октября", "ноября", "декабря"];

// Названия встроенных программ. Своя программа в сессии лежит под своим
// слагом — её название клиенту известно, а здесь хватит общего слова.
const TITLES: Record<string, string> = { split: "Сплит", fullbody: "Фулбади", swim: "Заплыв 45" };

type Candidate = {
  user_id: number; telegram_id: number; program_id: string; day: string; place: string;
  started_at: string; last_tick_at: string | null; done_count: number;
};

// Москва — UTC+3 круглый год.
function formatWhen(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} в ${d.getUTCHours()}:${mm}`;
}

function messageFor(c: Candidate): string {
  const swim = c.program_id === "swim";
  const title = TITLES[c.program_id] ?? "Твоя программа";
  const emoji = swim ? "🏊🏻" : "🏋🏻";
  const what = swim ? title : `${title} · день ${c.day}`;
  const lines = [
    "<b>Кажется, ты забыл завершить тренировку</b>",
    "",
    `${emoji} ${what} — начата ${formatWhen(c.started_at)}.`,
  ];
  if (swim || c.done_count > 0) {
    lines.push("Засчитать её по времени последней отметки или убрать — кнопки ниже.");
  } else {
    lines.push("Ни одно упражнение не отмечено — засчитывать нечего, её можно только убрать.");
  }
  return lines.join("\n");
}

async function tg(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function botUsername(): Promise<string> {
  try {
    const me = await tg("getMe", {});
    return me?.result?.username || FALLBACK_BOT;
  } catch {
    return FALLBACK_BOT;
  }
}

Deno.serve(async (req) => {
  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch { /* пустое тело — обычный запуск */ }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("srv_stale_session_candidates");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []) as Candidate[];
  const bot = await botUsername();
  const report: Array<Record<string, unknown>> = [];

  for (const c of candidates) {
    const text = messageFor(c);
    // Время старта в кнопке: нажатие на старом сообщении не тронет новую
    // тренировку — сервер сверяет его с сессией.
    const epoch = Math.floor(new Date(c.started_at).getTime() / 1000);
    const decide = [
      { text: "✅ Засчитать", callback_data: `sw:c:${epoch}`, style: "success" },
      { text: "🗑 Не засчитывать", callback_data: `sw:d:${epoch}` },
    ];
    const open = { text: "▶️ Открыть тренировку", url: `https://t.me/${bot}?startapp=open-stale` };
    const keyboard = [decide, [open]];

    if (dryRun) {
      report.push({ user_id: c.user_id, text, buttons: [...decide.map((b) => b.text), open.text] });
      continue;
    }

    const body = {
      chat_id: c.telegram_id, text, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard },
    };
    let res = await tg("sendMessage", body);
    // Цвет кнопок — Bot API 9.4. Не приняли — то же без цвета.
    if (!res.ok && JSON.stringify(res).includes("style")) {
      const plain = keyboard.map((row) => row.map(({ style: _style, ...b }) => b));
      res = await tg("sendMessage", { ...body, reply_markup: { inline_keyboard: plain } });
    }

    // Заблокировал бота / чата нет — отмечаем так же: писать туда повторно
    // каждые 15 минут бессмысленно. Сетевой сбой — не отмечаем, попробуем снова.
    const final = res.ok || res.error_code === 403 || res.error_code === 400;
    if (final) {
      await db.rpc("srv_mark_session_reminded", { p_user_id: c.user_id, p_started_at: c.started_at });
    }
    report.push({ user_id: c.user_id, result: res.ok ? "sent" : `error ${res.error_code}` });
  }

  return Response.json({ dry_run: dryRun, count: candidates.length, report });
});
