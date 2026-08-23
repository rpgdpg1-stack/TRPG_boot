/**
 * Рассылка напоминаний в Telegram.
 *
 * Запускается из GitHub Actions по расписанию. Кого оповещать — решает база
 * (функции srv_weekly_digest / srv_monthly_digest / srv_nudge_candidates),
 * здесь только сборка сообщения и отправка.
 *
 *   node scripts/notify.mjs weekly|monthly|yearly|nudge|owner|test
 *
 * owner — отчёт по всему проекту, уходит одному владельцу (OWNER_CHAT_ID).
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
import { weeklyDigest, monthlyDigest, yearlyDigest, ownerReport, nudge, nudgeButtons } from './notify-text.mjs'

const KIND = process.argv[2]
const DRY_RUN = process.env.NOTIFY_DRY_RUN === '1'
const ONLY = process.env.NOTIFY_ONLY ? String(process.env.NOTIFY_ONLY) : null
const BOT_TOKEN = process.env.BOT_TOKEN
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID
const DB_URL = process.env.SUPABASE_DB_URL

if (!['weekly', 'monthly', 'yearly', 'nudge', 'owner', 'test'].includes(KIND)) {
  console.error('Укажи вид рассылки: weekly | monthly | yearly | nudge | owner | test')
  process.exit(1)
}
// Образцам база не нужна — данные в них выдуманные.
if (!DB_URL && KIND !== 'test') { console.error('Нет SUPABASE_DB_URL'); process.exit(1) }
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
async function send(chatId, text, buttons) {
  // Каждая кнопка — своей строкой: названия программ бывают длинными, и в один
  // ряд они превращаются в обрезанную кашу.
  const keyboard = buttons.map((b) => [b])

  if (DRY_RUN) {
    const preview = buttons.map((b) => `[ ${b.text} ] → ${b.url}`).join('\n')
    console.log(`\n──────── ${chatId} ────────\n${text}\n${preview}`)
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
      reply_markup: { inline_keyboard: keyboard }
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

/**
 * Показательная рассылка на один адрес: по одному сообщению каждого вида,
 * на выдуманных данных.
 *
 * Нужна потому, что боевые выборки показывают только то, что подходит СЕЙЧАС:
 * человек, тренировавшийся вчера, в пинки не попадает по определению — и
 * проверить на себе, как выглядит пинок и работает ли его кнопка, иначе
 * невозможно.
 */
async function sendSamples(bot) {
  if (!ONLY) {
    console.error('Для test обязателен NOTIFY_ONLY — иначе некому слать')
    process.exit(1)
  }

  // Программы для образцов взяты как у настоящего закрепа: своя силовая
  // с днём и встроенное плавание. На выдуманном «Сплите» из каталога
  // не видно главного — что в сообщение попадает ИМЕННО твоя программа.
  const gym = { slug: 'my', name: 'Сплит 2', category: 'gym', lastDay: 'A', estMinutes: 70 }
  const pool = { slug: 'swim', name: 'Заплыв', category: 'pool', lastDay: null, estMinutes: null }

  const nudgeSample = (label, payload) =>
    [label, nudge(payload), nudgeButtons(payload).map((b) => ({
      text: b.label, url: appLink(bot, b.param)
    }))]

  const samples = [
    ['итоги недели',
     weeklyDigest({ totalCount: 3, totalMinutes: 135,
       breakdown: { strength: { count: 2, meters: 0 }, pool: { count: 1, meters: 2250 } } }),
     [{ text: 'Открыть статистику', url: appLink(bot, 'stats-week') }]],

    ['итоги месяца',
     monthlyDigest({ monthIndex: 6, totalCount: 12, totalMinutes: 580,
       breakdown: { strength: { count: 8, meters: 0 }, pool: { count: 4, meters: 9000 } },
       prevCount: 9, daysInMonth: 31 }),
     [{ text: 'Открыть статистику', url: appLink(bot, 'stats-month') }]],

    nudgeSample('пинок: неделя, два закрепа', { daysSince: 8, programs: [gym, pool] }),
    nudgeSample('пинок: неделя, только силовая', { daysSince: 8, programs: [gym] }),
    nudgeSample('пинок: неделя, только плавание', { daysSince: 8, programs: [pool] }),
    nudgeSample('пинок: неделя, закрепов нет', { daysSince: 8, programs: [] }),
    nudgeSample('пинок: две недели', { daysSince: 15, programs: [gym, pool] }),
    nudgeSample('пинок: месяц', { daysSince: 40, programs: [gym, pool] }),

    ['итоги года',
     yearlyDigest({ year: 2026, totalCount: 30, totalMinutes: 375,
       breakdown: { strength: { count: 21, meters: 0 }, pool: { count: 9, meters: 3000 } },
       bestMonth: 5, bestMonthCount: 14,
       recExercise: 'Тяга верхнего блока нейтральным хватом',
       recWeight: '105.00', recSwimM: 750 }),
     [{ text: 'Открыть статистику', url: appLink(bot, 'stats-year') }]]
  ]

  for (const [label, text, buttons] of samples) {
    console.log(`→ ${label}`)
    await send(ONLY, text, buttons)
  }
  console.log(`\nОтправлено образцов: ${samples.length}`)
}

async function main() {
  // Образцы базу не трогают: данные в них выдуманные.
  if (KIND === 'test') {
    await sendSamples(await getBotUsername())
    return
  }

  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  const bot = await getBotUsername()
  const stats = { sent: 0, blocked: 0, error: 0, dry: 0, skipped: 0 }

  try {
    // Владельческий отчёт: один получатель, кнопок нет — вести из него некуда,
    // цифры и есть содержание.
    if (KIND === 'owner') {
      if (!OWNER_CHAT_ID) {
        console.error('Нет OWNER_CHAT_ID — некому слать отчёт')
        process.exit(1)
      }
      const { rows } = await client.query('SELECT public.srv_owner_report() AS r')
      const text = ownerReport(rows[0].r)

      if (DRY_RUN) {
        console.log(`\n──────── ${OWNER_CHAT_ID} ────────\n${text}`)
      } else {
        const res = await fetch(api('sendMessage'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: OWNER_CHAT_ID, text, parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        })
        const data = await res.json()
        if (!data.ok) throw new Error(`Отчёт не ушёл: ${JSON.stringify(data)}`)
        console.log('Отчёт отправлен')
      }
      return
    }

    if (KIND === 'weekly' || KIND === 'monthly' || KIND === 'yearly') {
      const fn = KIND === 'weekly' ? 'srv_weekly_digest'
        : KIND === 'monthly' ? 'srv_monthly_digest'
          : 'srv_yearly_digest'
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
        } else if (KIND === 'yearly') {
          text = yearlyDigest({
            year: r.year,
            totalCount: r.total_count,
            totalMinutes: r.total_minutes,
            breakdown: r.breakdown,
            bestMonth: r.best_month,
            bestMonthCount: r.best_month_count,
            recExercise: r.rec_exercise,
            recWeight: r.rec_weight,
            recSwimM: r.rec_swim_m
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

        // Период в ссылке: сводка за неделю обязана открыть неделю, иначе
        // человек увидит на экране не те цифры, что были в сообщении.
        const result = await send(r.telegram_id, text, [{
          text: 'Открыть статистику',
          url: appLink(bot, KIND === 'weekly' ? 'stats-week'
            : KIND === 'yearly' ? 'stats-year' : 'stats-month')
        }])
        stats[result]++
      }
    }

    if (KIND === 'nudge') {
      const { rows } = await client.query('SELECT * FROM public.srv_nudge_candidates()')
      console.log(`Кандидатов: ${rows.length}`)

      for (const r of rows) {
        if (ONLY && String(r.telegram_id) !== ONLY) { stats.skipped++; continue }

        const payload = { daysSince: r.days_since, programs: r.programs || [] }
        const text = nudge(payload)
        const buttons = nudgeButtons(payload).map((b) => ({
          text: b.label,
          url: appLink(bot, b.param)
        }))

        const result = await send(r.telegram_id, text, buttons)
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
