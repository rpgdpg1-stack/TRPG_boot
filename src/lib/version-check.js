/**
 * Вахтёр версии сборки. Закрывает «старую итерацию» после долгого простоя:
 * Telegram (особенно iOS) замораживает свёрнутый WebView и при разблокировке
 * восстанавливает страницу СО СТАРЫМ БАНДЛОМ — без единого сетевого запроса,
 * так что cache-заголовки и загрузочный сторож в index.html не срабатывают.
 *
 * Решение: в бандл вшит __BUILD_ID__ (vite.config.js), рядом с ним на сервере
 * лежит version.json с тем же id. Когда приложение просыпается после ≥60с
 * скрытости (visibilitychange → visible; Telegram-событие activated ведёт себя
 * так же через видимость) — фетчим version.json с no-store и сравниваем. Не
 * совпало → на сервере уже другая сборка, а мы живём старой → жёсткая
 * перезагрузка (сброс caches + cache-busting URL), как в ErrorBoundary/стороже.
 *
 * Пробуждение — безопасный момент для перезагрузки: юзер ещё не начал
 * взаимодействовать, а весь рабочий прогресс (активная сессия, галочки,
 * позиция скролла активного дня) живёт в localStorage и восстановится.
 *
 * Защита от зацикливания: метка последней авто-перезагрузки в sessionStorage;
 * если перезагружались < 2 мин назад — не дёргаем снова (например, CDN ещё
 * отдаёт старый version.json).
 */

const HIDDEN_MIN_MS = 60 * 1000        // проверяем только после ≥60с в фоне
const RELOAD_COOLDOWN_MS = 2 * 60 * 1000
const RELOAD_MARK = 'version-reload-at'

// ID текущей сборки (define в vite.config.js). В dev define подставляется тоже,
// но version.json существует только в build — фетч в dev просто провалится и
// молча выйдет (never реилоадим по ошибке сети).
const MY_BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null

function hardReload() {
  try {
    sessionStorage.setItem(RELOAD_MARK, String(Date.now()))
  } catch (e) { /* ignore */ }
  try {
    if (window.caches && window.caches.keys) {
      window.caches.keys().then(ks => ks.forEach(k => window.caches.delete(k)))
    }
  } catch (e) { /* ignore */ }
  window.location.replace(window.location.pathname + '?r=' + Date.now())
}

function recentlyReloaded() {
  try {
    const at = parseInt(sessionStorage.getItem(RELOAD_MARK) || '0', 10)
    return at && Date.now() - at < RELOAD_COOLDOWN_MS
  } catch (e) { return false }
}

async function checkVersion() {
  if (!MY_BUILD_ID || recentlyReloaded()) return
  try {
    const res = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    if (data?.id && data.id !== MY_BUILD_ID) {
      console.warn('[version-check] устаревшая сборка', MY_BUILD_ID, '→', data.id, '— перезагружаю')
      hardReload()
    }
  } catch (e) { /* сети нет / dev — молча, оффлайн работе не мешаем */ }
}

/** Запустить вахтёра (один раз, из App). */
export function startVersionWatch() {
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
    } else if (hiddenAt && Date.now() - hiddenAt >= HIDDEN_MIN_MS) {
      hiddenAt = 0
      checkVersion()
    }
  })
}
