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
import {
  weeklyDigest, monthlyDigest, yearlyDigest, ownerReport, nudge, nudgeButtons, BTN_STYLE,
  weeklyRich, monthlyRich, yearlyRich, nudgeRich
} from './notify-text.mjs'

const KIND = process.argv[2]
const DRY_RUN = process.env.NOTIFY_DRY_RUN === '1'
const ONLY = process.env.NOTIFY_ONLY ? String(process.env.NOTIFY_ONLY) : null
const BOT_TOKEN = process.env.BOT_TOKEN
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID
const DB_URL = process.env.SUPABASE_DB_URL

if (!['weekly', 'monthly', 'yearly', 'nudge', 'owner', 'test', 'rich-probe'].includes(KIND)) {
  console.error('Укажи вид рассылки: weekly | monthly | yearly | nudge | owner | test | rich-probe')
  process.exit(1)
}
// Образцам база не нужна — данные в них выдуманные.
if (!DB_URL && KIND !== 'test' && KIND !== 'rich-probe') {
  console.error('Нет SUPABASE_DB_URL'); process.exit(1)
}
if (!BOT_TOKEN && !DRY_RUN) { console.error('Нет BOT_TOKEN'); process.exit(1) }

const api = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`

/**
 * Картинки к сообщениям.
 *
 * Лежат в Selectel и должны быть доступны БЕЗ авторизации: Telegram скачивает
 * их сам по ссылке, и закрытый доступ он просто не увидит.
 *
 * Пусто — сообщение уйдёт обычным текстом. Так что незаполненная строчка
 * ничего не ломает, просто картинки не будет.
 */
const BASE = 'https://55ee17b6-d242-49cb-92d3-e97297fb7934.selstorage.ru/TRPG/images/notify'

const IMAGES = {
  weekly: `${BASE}/notify-weekly.jpeg`,    // итоги недели
  monthly: `${BASE}/notify-monthly.jpeg`,  // итоги месяца
  yearly: `${BASE}/notify-yearly.jpeg`,    // итоги года
  owner: `${BASE}/notify-owner.jpeg`,      // отчёт владельцу

  // У пинков картинка привязана к МАСШТАБУ паузы, а не к точному сроку:
  // текста на ней нет, и «неделя / две / три» отличаются только заголовком
  // сообщения. Три файла вместо семи — и ни одного шанса, что картинка
  // разойдётся с текстом.
  nudgeWeek: `${BASE}/notify-nudge-week.jpeg`,   // неделя, две, три
  nudgeMonth: `${BASE}/notify-nudge-month.jpeg`, // месяц, два, три месяца
  nudgeLong: `${BASE}/notify-nudge-long.jpeg`    // давно
}

/** Картинка пинка по масштабу паузы: недели → месяцы → давно. */
function nudgeImage(daysSince) {
  if (daysSince >= 112) return IMAGES.nudgeLong
  if (daysSince >= 28) return IMAGES.nudgeMonth
  return IMAGES.nudgeWeek
}

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
async function send(chatId, text, buttons, photo, blocks) {
  // Каждая кнопка — своей строкой: названия программ бывают длинными, и в один
  // ряд они превращаются в обрезанную кашу.
  const keyboard = buttons.map((b) => [b])

  if (DRY_RUN) {
    const preview = buttons
      .map((b) => `[ ${b.text} ]${b.style ? ` (${b.style})` : ''} → ${b.url}`)
      .join('\n')
    const rich = blocks?.length
      ? '\n· блоки: ' + blocks.map((b) => b.type).join(' → ')
      : ''
    console.log(`\n──────── ${chatId} ────────`
      + (photo ? `\n🖼 ${photo}` : '')
      + rich
      + `\n${text}\n${preview}`)
    return 'dry'
  }

  // С картинкой — sendPhoto, текст уходит подписью. Ограничение подписи
  // 1024 символа против 4096 у обычного сообщения; наши тексты втрое короче,
  // но проверку оставляем: длинный текст лучше отправить без картинки,
  // чем не отправить вовсе.
  const blob = photo && text.length <= 1024 ? await loadPhoto(photo) : null
  const usePhoto = !!blob
  const body = {
    chat_id: chatId,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard }
  }
  if (usePhoto) {
    body.caption = text
  } else {
    body.text = text
    body.disable_web_page_preview = true
  }

  let data = null

  // Сначала пробуем структурное сообщение — ради него всё и затевалось.
  // Не вышло с картинкой — пробуем без неё: блоки ценнее фото. Не вышло
  // вовсе — уходим на обычный путь, он проверен и работает.
  if (blocks?.length) {
    data = await postRich(chatId, blocks, keyboard, blob)
    if (!data.ok && blob) {
      console.warn('  структурное с картинкой не прошло — пробую без неё')
      data = await postRich(chatId, blocks, keyboard, null)
    }
    if (!data.ok) {
      console.warn(`  структурное не прошло (${JSON.stringify(data)}) — обычным сообщением`)
      data = null
    }
  }

  if (!data) {
    data = usePhoto ? await postPhoto(body, blob) : await post('sendMessage', body)
  }

  // Цвет кнопок появился только в Bot API 9.4. Если сервер его не принял —
  // отправляем то же самое без стилей: сообщение важнее оформления.
  if (!data.ok && JSON.stringify(data).includes('style')) {
    console.warn('  цвет кнопок не поддержан — шлю без него')
    body.reply_markup = {
      inline_keyboard: keyboard.map((row) => row.map((b) => {
        const plain = { ...b }
        delete plain.style
        return plain
      }))
    }
    data = usePhoto ? await postPhoto(body, blob) : await post('sendMessage', body)
  }

  // Картинка недоступна (ссылка закрыта, файл удалён) — шлём текстом.
  if (!data.ok && usePhoto) {
    console.warn(`  картинка не принята (${JSON.stringify(data)}) — шлю текстом`)
    data = await post('sendMessage', {
      chat_id: chatId, text, parse_mode: 'HTML',
      disable_web_page_preview: true, reply_markup: body.reply_markup
    })
  }

  if (data.ok) return 'sent'

  const blocked = data.error_code === 403
  console.warn(`  ${chatId}: ${blocked ? 'бот заблокирован' : JSON.stringify(data)}`)
  return blocked ? 'blocked' : 'error'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Скачанные картинки — по одной на адрес за весь прогон.
 *
 * Десять образцов тянут три-четыре разных файла, и качать их по кругу
 * незачем.
 */
const photoCache = new Map()

async function loadPhoto(url) {
  if (photoCache.has(url)) return photoCache.get(url)
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  картинку не скачать: ${url} → ${res.status}`)
    photoCache.set(url, null)
    return null
  }
  const bytes = await res.arrayBuffer()
  const blob = new Blob([bytes], { type: res.headers.get('content-type') || 'image/jpeg' })
  photoCache.set(url, blob)
  return blob
}

/**
 * Отправка фото ФАЙЛОМ, а не ссылкой.
 *
 * По ссылке Telegram идёт за картинкой сам, со своих серверов, и если
 * не достучался или не уложился в свой таймаут — просто отказывает, ничего
 * не объясняя. Так девять из десяти образцов и приходили без картинок,
 * хотя ссылки открывались откуда угодно.
 *
 * Скачиваем сами и передаём байтами: тогда Telegram ни за чем не ходит,
 * и остаётся только его собственная проверка формата.
 */
/**
 * Отправка структурным сообщением (Bot API 10.1+).
 *
 * Заголовок, разделитель, сворачиваемое «Подробнее», спойлер — всё то, чего
 * не выразить обычным текстом. Картинка прикладывается тем же способом, что
 * и в остальных методах Telegram: файлом в форме, а в теле — ссылка на него.
 *
 * Возвращает ответ Telegram как есть. Решение откатываться принимает
 * вызывающий: сообщение важнее оформления, и терять его из-за нового
 * формата нельзя.
 */
async function postRich(chatId, blocks, keyboard, blob) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('reply_markup', JSON.stringify({ inline_keyboard: keyboard }))

  const richMessage = { blocks }
  if (blob) {
    richMessage.media = { type: 'photo', media: 'attach://photo' }
    form.append('photo', blob, 'photo.jpg')
  }
  form.append('rich_message', JSON.stringify(richMessage))

  const res = await fetch(api('sendRichMessage'), { method: 'POST', body: form })
  return res.json()
}

async function postPhoto(body, blob) {
  const form = new FormData()
  form.append('chat_id', String(body.chat_id))
  form.append('caption', body.caption)
  form.append('parse_mode', 'HTML')
  form.append('reply_markup', JSON.stringify(body.reply_markup))
  form.append('photo', blob, 'photo.jpg')

  const res = await fetch(api('sendPhoto'), { method: 'POST', body: form })
  const data = await res.json()

  if (!data.ok && data.error_code === 429) {
    const wait = (data.parameters?.retry_after || 2) + 1
    console.warn(`  лимит частоты, жду ${wait} с`)
    await sleep(wait * 1000)
    const retry = await fetch(api('sendPhoto'), { method: 'POST', body: form })
    return retry.json()
  }
  return data
}

/**
 * Запрос к Telegram с уважением к ограничению частоты.
 *
 * В один чат Telegram пропускает примерно одно сообщение в секунду. Десять
 * образцов подряд превышали лимит: сервер отвечал 429, отправка фото падала,
 * и срабатывал запасной путь — сообщение приходило текстом, без картинки.
 * Выглядело так, будто картинки «не работают».
 *
 * На 429 Telegram сам говорит, сколько ждать (retry_after) — ждём и повторяем.
 */
async function post(method, body, retry = true) {
  const res = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()

  if (!data.ok && data.error_code === 429 && retry) {
    const wait = (data.parameters?.retry_after || 2) + 1
    console.warn(`  лимит частоты, жду ${wait} с`)
    await sleep(wait * 1000)
    return post(method, body, false)
  }
  return data
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
      text: b.label, url: appLink(bot, b.param), style: b.style
    })), nudgeImage(payload.daysSince), nudgeRich(payload)]

  const samples = [
    (() => {
      const d = { totalCount: 3, totalMinutes: 135,
        breakdown: { strength: { count: 2, meters: 0 }, pool: { count: 1, meters: 2250 } } }
      return ['итоги недели', weeklyDigest(d),
        [{ text: '📈 Открыть статистику', url: appLink(bot, 'stats-week'), style: BTN_STYLE.ACCENT }],
        IMAGES.weekly, weeklyRich(d)]
    })(),

    (() => {
      const d = { monthIndex: 6, totalCount: 12, totalMinutes: 580,
        breakdown: { strength: { count: 8, meters: 0 }, pool: { count: 4, meters: 9000 } },
        prevCount: 9, daysInMonth: 31, isRecord: true }
      return ['итоги месяца', monthlyDigest(d),
        [{ text: '📈 Открыть статистику', url: appLink(bot, 'stats-month'), style: BTN_STYLE.ACCENT }],
        IMAGES.monthly, monthlyRich(d)]
    })(),

    nudgeSample('пинок: неделя, два закрепа', { daysSince: 8, programs: [gym, pool] }),
    nudgeSample('пинок: неделя, только силовая', { daysSince: 8, programs: [gym] }),
    nudgeSample('пинок: неделя, только плавание', { daysSince: 8, programs: [pool] }),
    nudgeSample('пинок: неделя, закрепов нет', { daysSince: 8, programs: [] }),
    nudgeSample('пинок: две недели', { daysSince: 15, programs: [gym, pool] }),
    nudgeSample('пинок: месяц', { daysSince: 40, programs: [gym, pool], bestCount: 14, bestMinutes: 810 }),
    nudgeSample('пинок: давно', { daysSince: 200, programs: [], bestCount: 14, bestMinutes: 810 }),

    (() => {
      const d = { year: 2026, totalCount: 30, totalMinutes: 375,
        breakdown: { strength: { count: 21, meters: 0 }, pool: { count: 9, meters: 3000 } },
        bestMonth: 5, bestMonthCount: 14, bestMonthMinutes: 810,
        recExercise: 'Тяга верхнего блока нейтральным хватом',
        recWeight: '105.00', recSwimM: 750 }
      return ['итоги года', yearlyDigest(d),
        [{ text: '📈 Открыть статистику', url: appLink(bot, 'stats-year'), style: BTN_STYLE.ACCENT }],
        IMAGES.yearly, yearlyRich(d)]
    })()
  ]

  for (const [label, text, buttons, photo, blocks] of samples) {
    console.log(`→ ${label}`)
    await send(ONLY, text, buttons, photo, blocks)
    // Секунда с запасом: всё это летит в ОДИН чат, а туда Telegram пропускает
    // примерно одно сообщение в секунду.
    await sleep(1300)
  }
  console.log(`\nОтправлено образцов: ${samples.length}`)
}

/**
 * Пробник структурных сообщений.
 *
 * Документация не описывает, как выглядит простой текст внутри блока, и
 * гадать вслепую — терять по прогону на догадку. Пробник шлёт несколько
 * правдоподобных форм подряд и показывает, что Telegram ответил на каждую.
 * Одного запуска хватает, чтобы узнать правду и больше не угадывать.
 */
async function richProbe() {
  if (!ONLY) {
    console.error('Для rich-probe обязателен NOTIFY_ONLY')
    process.exit(1)
  }

  // Первый пробник выяснил главное: текст внутри блока — ПРОСТАЯ СТРОКА,
  // а не объект. И что имена типов блоков у меня были выдуманные:
  // «section_heading» Telegram не знает. Теперь щупаем сами имена.
  const P = (t) => ({ type: 'paragraph', text: t })

  const variants = [
    ['heading',        { blocks: [{ type: 'heading', text: 'Заголовок' }] }],
    ['header',         { blocks: [{ type: 'header', text: 'Заголовок' }] }],
    ['title',          { blocks: [{ type: 'title', text: 'Заголовок' }] }],
    ['divider',        { blocks: [P('до'), { type: 'divider' }, P('после')] }],
    ['separator',      { blocks: [P('до'), { type: 'separator' }, P('после')] }],
    ['details',        { blocks: [{ type: 'details', title: 'Подробнее', blocks: [P('внутри')] }] }],
    ['collapsible',    { blocks: [{ type: 'collapsible', title: 'Подробнее', blocks: [P('внутри')] }] }],
    ['list',           { blocks: [{ type: 'list', items: [{ text: 'раз' }, { text: 'два' }] }] }],
    ['blockquote',     { blocks: [{ type: 'blockquote', text: 'цитата' }] }],
    ['preformatted',   { blocks: [{ type: 'preformatted', text: 'моно' }] }],
    ['footer',         { blocks: [{ type: 'footer', text: 'подпись' }] }],
    ['текст: bold',    { blocks: [P({ type: 'bold', text: 'жирный' })] }],
    ['текст: spoiler', { blocks: [P({ type: 'spoiler', text: 'секрет' })] }],
    ['текст: массив',  { blocks: [P(['обычный ', { type: 'bold', text: 'жирный' }])] }]
  ]

  for (const [label, richMessage] of variants) {
    const res = await fetch(api('sendRichMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ONLY, rich_message: richMessage })
    })
    const data = await res.json()
    console.log(`${data.ok ? '✅' : '❌'} ${label}`)
    if (!data.ok) console.log(`   ${data.description || JSON.stringify(data)}`)
    await sleep(1300)
  }
}

async function main() {
  if (KIND === 'rich-probe') {
    await richProbe()
    return
  }

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
        const blob = IMAGES.owner ? await loadPhoto(IMAGES.owner) : null
        const data = blob
          ? await postPhoto({
            chat_id: OWNER_CHAT_ID, caption: text, reply_markup: { inline_keyboard: [] }
          }, blob)
          : await post('sendMessage', {
            chat_id: OWNER_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true
          })
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
        let blocks
        if (KIND === 'weekly') {
          const data = {
            totalCount: r.total_count,
            totalMinutes: r.total_minutes,
            breakdown: r.breakdown
          }
          text = weeklyDigest(data)
          blocks = weeklyRich(data)
        } else if (KIND === 'yearly') {
          const yearData = {
            year: r.year,
            totalCount: r.total_count,
            totalMinutes: r.total_minutes,
            breakdown: r.breakdown,
            bestMonth: r.best_month,
            bestMonthCount: r.best_month_count,
            bestMonthMinutes: r.best_month_minutes,
            recExercise: r.rec_exercise,
            recWeight: r.rec_weight,
            recSwimM: r.rec_swim_m
          }
          text = yearlyDigest(yearData)
          blocks = yearlyRich(yearData)
        } else {
          const start = new Date(r.month_start)
          const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
          const monthData = {
            monthIndex: start.getMonth(),
            totalCount: r.total_count,
            totalMinutes: r.total_minutes,
            breakdown: r.breakdown,
            prevCount: r.prev_count,
            isRecord: r.is_record,
            daysInMonth
          }
          text = monthlyDigest(monthData)
          blocks = monthlyRich(monthData)
        }

        // Период в ссылке: сводка за неделю обязана открыть неделю, иначе
        // человек увидит на экране не те цифры, что были в сообщении.
        // Разным людям можно чаще, но не безлимитно: общий потолок около
        // тридцати сообщений в секунду на бота.
        await sleep(120)
        const result = await send(r.telegram_id, text, [{
          text: '📈 Открыть статистику',
          url: appLink(bot, KIND === 'weekly' ? 'stats-week'
            : KIND === 'yearly' ? 'stats-year' : 'stats-month'),
          style: BTN_STYLE.ACCENT
        }], IMAGES[KIND], blocks)
        stats[result]++
      }
    }

    if (KIND === 'nudge') {
      const { rows } = await client.query('SELECT * FROM public.srv_nudge_candidates()')
      console.log(`Кандидатов: ${rows.length}`)

      for (const r of rows) {
        if (ONLY && String(r.telegram_id) !== ONLY) { stats.skipped++; continue }

        const payload = {
          daysSince: r.days_since,
          programs: r.programs || [],
          bestCount: r.best_count,
          bestMinutes: r.best_minutes
        }
        const text = nudge(payload)
        const blocks = nudgeRich(payload)
        const buttons = nudgeButtons(payload).map((b) => ({
          text: b.label,
          url: appLink(bot, b.param),
          style: b.style
        }))

        await sleep(120)
        const result = await send(r.telegram_id, text, buttons, nudgeImage(r.days_since), blocks)
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
