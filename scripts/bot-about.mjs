/**
 * Счётчик людей в описании бота.
 *
 * Telegram НЕ отдаёт «сколько человек запустили бота» — у ботов, в отличие от
 * каналов, такого показателя в API просто нет. Поэтому число берётся из нашей
 * базы: сколько аккаунтов пришло через Telegram. Это честнее любой оценки —
 * мы считаем тех, кто реально завёл аккаунт, а не тех, кто нажал «Старт»
 * и ушёл.
 *
 * Описание — обычный текст, сам он не обновляется. Раз в сутки его
 * перезаписывает GitHub Actions.
 *
 *   node scripts/bot-about.mjs
 *
 * Переменные окружения:
 *   SUPABASE_DB_URL  — та же строка, что у бэкапа и рассылки
 *   BOT_TOKEN        — токен бота
 *   ABOUT_DRY_RUN=1  — показать текущее и новое описание, ничего не менять
 */

import pg from 'pg'

const DRY_RUN = process.env.ABOUT_DRY_RUN === '1'
const BOT_TOKEN = process.env.BOT_TOKEN
const DB_URL = process.env.SUPABASE_DB_URL

if (!DB_URL) { console.error('Нет SUPABASE_DB_URL'); process.exit(1) }
if (!BOT_TOKEN) { console.error('Нет BOT_TOKEN'); process.exit(1) }

const api = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`

/**
 * Ниже этого порога число не показываем.
 *
 * «Нас уже 4» работает против нас: пустой зал отпугивает сильнее, чем
 * отсутствие вывески. Пока людей мало, описание остаётся без счётчика.
 */
const MIN_TO_SHOW = 10

/** «37 человек» / «21 человек» / «22 человека». */
function pluralPeople(n) {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return `${n} человек`
  if (mod10 === 1) return `${n} человек`
  if (mod10 >= 2 && mod10 <= 4) return `${n} человека`
  return `${n} человек`
}

// Базовые тексты без счётчика — они же остаются, пока людей меньше порога.
const SHORT_BASE = 'Тренировки, прогресс и статистика прямо в Telegram.'
const LONG_BASE = [
  'TRPG — трекер тренировок в Telegram.',
  '',
  'Готовые программы и свои, рабочие веса, история и статистика.',
  'Напоминания и итоги недели приходят сюда же.'
].join('\n')

async function call(method, body) {
  const res = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`${method}: ${JSON.stringify(data)}`)
  return data.result
}

async function main() {
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  let count
  try {
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM public.users WHERE telegram_id IS NOT NULL'
    )
    count = rows[0].n
  } finally {
    await client.end()
  }

  console.log(`Людей с аккаунтом через Telegram: ${count}`)

  const showCount = count >= MIN_TO_SHOW
  if (!showCount) {
    console.log(`Меньше ${MIN_TO_SHOW} — счётчик в описании не показываем`)
  }

  // «About» — короткая строка в шапке профиля бота, лимит 120 символов.
  const short = showCount
    ? `${SHORT_BASE} Нас уже ${pluralPeople(count)}.`
    : SHORT_BASE

  // Описание на пустом экране чата, лимит 512 символов.
  const long = showCount
    ? `${LONG_BASE}\n\nСейчас в приложении ${pluralPeople(count)}.`
    : LONG_BASE

  if (short.length > 120) {
    console.error(`Короткое описание длиннее 120 символов (${short.length}) — Telegram откажет`)
    process.exit(1)
  }
  if (long.length > 512) {
    console.error(`Описание длиннее 512 символов (${long.length}) — Telegram откажет`)
    process.exit(1)
  }

  const [curShort, curLong] = await Promise.all([
    call('getMyShortDescription'),
    call('getMyDescription')
  ])

  console.log(`\nБыло (шапка):\n${curShort.short_description || '(пусто)'}`)
  console.log(`\nСтанет (шапка):\n${short}`)
  console.log(`\nБыло (описание):\n${curLong.description || '(пусто)'}`)
  console.log(`\nСтанет (описание):\n${long}`)

  if (DRY_RUN) {
    console.log('\nХолостой прогон — ничего не изменено')
    return
  }

  // Ничего не трогаем, если текст тот же: у Telegram есть ограничения на
  // частоту правок, и переписывать одно и тем же — только тратить лимит.
  if (curShort.short_description !== short) {
    await call('setMyShortDescription', { short_description: short })
    console.log('\nШапка обновлена')
  }
  if (curLong.description !== long) {
    await call('setMyDescription', { description: long })
    console.log('Описание обновлено')
  }
  console.log('Готово')
}

main().catch((e) => { console.error(e); process.exit(1) })
