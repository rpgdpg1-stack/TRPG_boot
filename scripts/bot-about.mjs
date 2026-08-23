/**
 * Описание бота: шапка профиля и текст на пустом экране чата.
 *
 * Счётчика людей здесь намеренно НЕТ. Telegram сам показывает под именем бота
 * число пользователей за месяц — считает его он, и подставить туда своё
 * значение нельзя. Наша цифра (все заведённые аккаунты) с телеграмовской
 * не совпала бы никогда, и два разных числа рядом читались бы как ошибка.
 * Поэтому число оставлено Telegram, а нам — текст.
 *
 * Тексты лежат в репозитории, а не только в BotFather: так видно в истории,
 * когда и почему они менялись.
 *
 *   node scripts/bot-about.mjs
 *
 * Переменные окружения:
 *   BOT_TOKEN        — токен бота
 *   ABOUT_DRY_RUN=1  — показать текущее и новое описание, ничего не менять
 */

const DRY_RUN = process.env.ABOUT_DRY_RUN === '1'
const BOT_TOKEN = process.env.BOT_TOKEN

if (!BOT_TOKEN) { console.error('Нет BOT_TOKEN'); process.exit(1) }

const api = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`

/** Шапка профиля бота. Лимит Telegram — 120 символов. */
const SHORT = 'Тренировки, прогресс и статистика прямо в Telegram.'

/** Текст на пустом экране чата. Лимит Telegram — 512 символов. */
const LONG = [
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
  if (SHORT.length > 120) {
    console.error(`Шапка длиннее 120 символов (${SHORT.length}) — Telegram откажет`)
    process.exit(1)
  }
  if (LONG.length > 512) {
    console.error(`Описание длиннее 512 символов (${LONG.length}) — Telegram откажет`)
    process.exit(1)
  }

  const [curShort, curLong] = await Promise.all([
    call('getMyShortDescription'),
    call('getMyDescription')
  ])

  console.log(`Было (шапка):\n${curShort.short_description || '(пусто)'}\n`)
  console.log(`Станет (шапка):\n${SHORT}\n`)
  console.log(`Было (описание):\n${curLong.description || '(пусто)'}\n`)
  console.log(`Станет (описание):\n${LONG}\n`)

  if (DRY_RUN) {
    console.log('Холостой прогон — ничего не изменено')
    return
  }

  // Не трогаем, если текст тот же: у Telegram есть ограничения на частоту
  // правок, и переписывать одно тем же — только тратить лимит.
  if (curShort.short_description !== SHORT) {
    await call('setMyShortDescription', { short_description: SHORT })
    console.log('Шапка обновлена')
  }
  if (curLong.description !== LONG) {
    await call('setMyDescription', { description: LONG })
    console.log('Описание обновлено')
  }
  console.log('Готово')
}

main().catch((e) => { console.error(e); process.exit(1) })
