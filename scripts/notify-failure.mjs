/**
 * Сообщение владельцу в Telegram, когда задача в GitHub Actions упала.
 *
 * Зачем: три задачи (бэкап базы, напоминания, проверка сборки) работают по
 * расписанию и без присмотра. Красный крестик на сайте GitHub надо ходить и
 * высматривать — а узнать про сломанный бэкап хочется не в тот день, когда он
 * понадобился. Поэтому падение приходит туда же, куда приходят напоминания.
 *
 * Шлётся ТОЛЬКО при падении (шаг с `if: failure()`), поэтому тишина в чате —
 * это и есть «всё хорошо». Успешные прогоны не пишут ничего: иначе сообщения
 * перестанут читать через неделю.
 *
 * Запуск: node scripts/notify-failure.mjs "Название задачи"
 * Переменные: BOT_TOKEN, OWNER_CHAT_ID (те же, что у рассылки),
 * остальное GitHub подставляет сам.
 */

const BOT_TOKEN = process.env.BOT_TOKEN
const CHAT_ID = process.env.OWNER_CHAT_ID
const title = process.argv[2] || process.env.GITHUB_WORKFLOW || 'Задача'

// Ссылка прямо на упавший прогон — с логами, без поиска по интерфейсу.
const server = process.env.GITHUB_SERVER_URL || 'https://github.com'
const repo = process.env.GITHUB_REPOSITORY || ''
const runId = process.env.GITHUB_RUN_ID || ''
const runUrl = repo && runId ? `${server}/${repo}/actions/runs/${runId}` : null

if (!BOT_TOKEN || !CHAT_ID) {
  // Не роняем и без того упавший прогон: сообщить не вышло — и ладно,
  // причина падения от этого не изменится.
  console.warn('[notify-failure] нет BOT_TOKEN или OWNER_CHAT_ID — пропускаю')
  process.exit(0)
}

const lines = [
  `⚠️ <b>${title}</b> — упало`,
  '',
  repo ? `Репозиторий: ${repo}` : null,
  runUrl ? `<a href="${runUrl}">Открыть лог прогона</a>` : null
].filter(Boolean)

try {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  })
  const data = await res.json()
  if (!data.ok) console.warn('[notify-failure] Telegram отказал:', JSON.stringify(data))
  else console.log('[notify-failure] сообщение отправлено')
} catch (e) {
  console.warn('[notify-failure] не отправилось:', e?.message)
}
