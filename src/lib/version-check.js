/**
 * Вахтёр версии сборки. Закрывает «старую итерацию» после долгого простоя:
 * Telegram (особенно iOS) замораживает свёрнутый WebView и при разблокировке
 * восстанавливает страницу СО СТАРЫМ БАНДЛОМ — без единого сетевого запроса,
 * так что cache-заголовки и загрузочный сторож в index.html не срабатывают.
 *
 * Решение: в бандл вшит __BUILD_ID__ (vite.config.js), рядом с ним на сервере
 * лежит version.json с тем же id. Фетчим его с no-store и сравниваем в двух
 * точках:
 *   • на СТАРТЕ приложения — WebView может поднять index.html из своего кеша
 *     при полном перезапуске мини-аппа (хостинг заголовков кеширования не
 *     отдаёт), и тогда человек открывает заведомо старую сборку;
 *   • при пробуждении после ≥60с скрытости (visibilitychange → visible;
 *     Telegram-событие activated ведёт себя так же через видимость).
 * Сервер новее → жёсткая перезагрузка (сброс caches + cache-busting URL),
 * как в ErrorBoundary/стороже.
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
      // Кеш гифок (trpg-media) щадим: он про упражнения, а не про сборку, и
      // выбрасывать его при каждой перезагрузке — заново качать мегабайты.
      window.caches.keys().then(ks => ks.forEach(k => {
        if (!String(k).startsWith('trpg-media')) window.caches.delete(k)
      }))
    }
  } catch (e) { /* ignore */ }
  // Адрес пересобираем ЦЕЛИКОМ, сохраняя query и hash. Раньше оставался голый
  // pathname — а Telegram передаёт initData и start_param именно в hash, и
  // после такой перезагрузки приложение могло проснуться без подписи входа
  // (экран «Откройте через Telegram») или потерять ссылку-приглашение.
  // Метка ?r= остаётся: она обходит кеш WebView на самом index.html.
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('r', Date.now().toString(36))
    window.location.replace(url.toString())
  } catch (e) {
    window.location.reload()
  }
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
    if (data?.id && data.id !== MY_BUILD_ID && isNewer(data.id, MY_BUILD_ID)) {
      console.warn('[version-check] устаревшая сборка', MY_BUILD_ID, '→', data.id, '— перезагружаю')
      hardReload()
    }
  } catch (e) { /* сети нет / dev — молча, оффлайн работе не мешаем */ }
}

/**
 * Серверная сборка новее нашей? id — это время сборки в base36, поэтому
 * сравниваем как числа, а не как строки.
 *
 * Зачем: «не совпало» само по себе не значит «мы устарели». Промежуточный кеш
 * вполне может отдать version.json СТАРЕЕ того бандла, который у нас уже
 * загружен, — и тогда перезагрузка ничего не исправит, а просто мигнёт экраном.
 * Реагируем только на движение вперёд; всё непонятное (id не разбирается)
 * трактуем как «обновление есть», иначе сторож замолчит на первой же неудаче.
 */
function isNewer(serverId, myId) {
  const a = parseInt(serverId, 36)
  const b = parseInt(myId, 36)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true
  return a > b
}

/** Запустить вахтёра (один раз, из App). */
export function startVersionWatch() {
  // Проверка на СТАРТЕ — главный случай, а не запасной. Заголовков кеширования
  // хостинг не отдаёт, поэтому WebView Telegram спокойно достаёт index.html из
  // своего кеша при полном перезапуске мини-аппа: человек «закрыл и открыл
  // заново», получил старый бандл, а перехода фон→экран не было — и сторож,
  // слушающий только видимость, молчал. Именно так и живут по нескольку дней
  // на версии, которую давно починили.
  //
  // Запускаем сразу, не выжидая: ответ приходит за доли секунды и обычно
  // успевает попасть в загрузочный экран, так что перезагрузка проходит
  // незаметно. Прогресс тренировки лежит в localStorage и её переживает.
  checkVersion()

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
