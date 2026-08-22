/**
 * Рассылка напоминаний в Telegram.
 *
 * Запускается из GitHub Actions по расписанию. Кого оповещать — решает база
 * (функции srv_weekly_digest / srv_monthly_digest / srv_nudge_candidates),
 * здесь только сборка сообщения и отправка.
 *
 *   node scripts/notify.mjs weekly|monthly|nudge
 *
 * Переменные окружения:
 *   SUPABASE_DB_URL  — строка подключения (та же, что у бэкапа)
 *   BOT_TOKEN        — токен бота из BotFather
 *   NOTIFY_DRY_RUN=1 — ничего не отправлять, только показать в логе
 *   NOTIFY_ONLY=<id> — отправить ТОЛЬКО этому telegram_id (обкатка на себе)
 *
 * Про NOTIFY_ONLY: у приложения уже есть живые пользователи, и первая же
 * ошибка в расписании ушла бы им всем. Поэтому боевой прогон начинается
 * с рассылки самому себе, а не с полного списка.
 */

import pg from 'pg'
import { weeklyDigest, monthlyDigest, nudge, nudgeButtonLabel } from './notify-text.mjs'

const KIND = process.argv[2]
const DRY_RUN = process.env.NOTIFY_DRY_RUN === '1'
const ONLY = process.env.NOTIFY_ONLY ? String(process.env.NOTIFY_ONLY) : null
const BOT_TOKEN = process.env.BOT_TOKEN
const DB_URL = process.env.SUPABASE_DB_URL

if (!['weekly', 'monthly', 'nudge'].includes(KIND)) {
  console.error('Укажи вид рассылки: weekly | monthly | nudge')
  process.exit(1)
}
if (!DB_URL) { console.error('Нет SUPABASE_DB_URL'); process.exit(1) }
if (!BOT_TOKEN && !DRY_RUN) { console.error('Нет BOT_TOKEN'); process.exit(1) }

const api = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`

/** Имя бота нужно для ссылок вида t.me/<bot>?startapp=... Берём у самого
 *  Telegram, чтобы не заводить ради него ещё один секрет. */
async function getBotUsername() {
  if (DRY_RUN && !BOT_TOKEN) return 'bot'
  const res = await fetch(api('getMe'))
  const data = await res.json()
  if (!data.ok) throw new Error(`getMe: ${JSON.stringify(data)}`)
  return data.result.username
}

/**
 * Отправка. Блокировку бота пользователем считаем нормальным исходом, а не
 * сбоем: человек имеет право закрыть дверь, и падать из-за этого вся рассылка
 * не должна.
 */
async function send(chatId, text, button) {
  if (DRY_RUN) {
    console.log(`\n──────── ${chatId} ────────\n${text}\n[ ${button.text} ] → ${button.url}`)
    return 'dry'
  }
  const res = await fetch(api('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[button]] }
    })
  })
  const data = await res.json()
  if (data.ok) return 'sent'

  const blocked = data.error_code === 403
  console.warn(`  ${chatId}: ${blocked ? 'бот заблокирован' : JSON.stringify(data)}`)
  return blocked ? 'blocked' : 'error'
}

/** Ссылка на конкретный экран приложения (разбирается в lib/deep-link.js). */
const appLink = (bot, param) => `https://t.me/${bot}?startapp=${param}`

async function main() {
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  const bot = await getBotUsername()
  const stats = { sent: 0, blocked: 0, error: 0, dry: 0, skipped: 0 }

  try {
    if (KIND === 'weekly' || KIND === 'monthly') {
      const fn = KIND === 'weekly' ? 'srv_weekly_digest' : 'srv_monthly_digest'
      const { rows } = await client.query(`SELECT * FROM public.${fn}()`)
      console.log(`Получателей: ${rows.length}`)

      for (const r of rows) {
        if (ONLY && String(r.telegram_id) !== ONLY) { stats.skipped++; continue }

        let text
        if (KIND === 'weekly') {
          text = weeklyDigest({
            totalCount: r.total_count,
            totalMinutes: r.total_minutes,
            breakdown: r.breakdown
          })
        } else {
          const start = new Date(r.month_start)
          const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
          text = monthlyDigest({
            monthIndex: start.getMonth(),
            totalCount: r.total_count,
            totalMinutes: r.total_minutes,
            breakdown: r.breakdown,
            prevCount: r.prev_count,
            daysInMonth
          })
        }

        const result = await send(r.telegram_id, text, {
          text: 'Открыть статистику',
          url: appLink(bot, 'stats')
        })
        stats[result]++
      }
    }

    if (KIND === 'nudge') {
      const { rows } = await client.query('SELECT * FROM public.srv_nudge_candidates()')
      console.log(`Кандидатов: ${rows.length}`)

      for (const r of rows) {
        if (ONLY && String(r.telegram_id) !== ONLY) { stats.skipped++; continue }

        const text = nudge({
          daysSince: r.days_since,
          programName: r.program_name,
          category: r.category,
          lastDay: r.last_day,
          estMinutes: r.est_minutes
        })

        // Куда ведёт кнопка: плавание — на свою страницу, силовая — на день,
        // а после месяца тишины и без закрепа — просто в приложение.
        let param = 'stats'
        if (r.days_since < 28 && r.program_id) {
          param = r.category === 'pool'
            ? `s-${r.program_id}`
            : `w-${r.program_id}-${r.last_day || 'A'}`
        } else if (r.days_since >= 28 || !r.program_id) {
          param = 'open'
        }

        const result = await send(r.telegram_id, text, {
          text: nudgeButtonLabel(r.days_since),
          url: appLink(bot, param)
        })
        stats[result]++

        // Счётчик тишины растёт только у реально отправленных: пропущенные
        // из-за NOTIFY_ONLY или блокировки к молчанию человека отношения
        // не имеют, и записывать их в «проигнорировал» нечестно.
        if (result === 'sent') {
          await client.query('SELECT public.srv_mark_nudge_sent($1)', [r.user_id])
        }
      }
    }
  } finally {
    await client.end()
  }

  console.log(`\nИтог: отправлено ${stats.sent}, заблокировали ${stats.blocked}, ` +
              `ошибок ${stats.error}, пропущено ${stats.skipped}` +
              (DRY_RUN ? `, показано вхолостую ${stats.dry}` : ''))

  if (stats.error > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
