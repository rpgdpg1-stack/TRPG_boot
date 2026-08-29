/**
 * Кеш медиа упражнений (mp4-ролики и превью) — чтобы они игрались и БЕЗ СЕТИ.
 *
 * Зачем свой кеш, если файлы отдаются с `max-age=31536000, immutable`. Обычный
 * HTTP-кеш браузера здесь ненадёжен: WebView Telegram чистит его когда хочет,
 * и на слабой связи ролик просто не доезжает — человек видит застывший постер
 * (превью) вместо движения. При этом никакой ошибки не происходит: тег
 * `<video>` молча стоит на первом кадре, потому что данные не пришли.
 *
 * Как устроено. Ролик забираем один раз через `fetch` целиком и кладём в
 * Cache API — хранилище, которое живёт до явной очистки. Дальше он играется
 * из блоба: сеть больше не нужна, диапазонных до-запросов (Range) нет, а
 * значит нечему и обрываться в зале с мёртвым Wi-Fi.
 *
 * Почему blob, а не Service Worker: `<video>` тянет файл кусками (Range), и
 * частичные ответы (206) в Cache API не кладутся. Полный файл + blob — тот же
 * результат без этой ямы. Ролики маленькие (100–600 КБ), грузить целиком дёшево.
 *
 * Ограничения: не больше MAX_ENTRIES файлов на диске (старые вытесняются) и
 * MEM_LIMIT в памяти. `caches` может быть недоступен (приватный режим, старый
 * WebView) — тогда модуль честно возвращает null, и картинка/видео грузятся
 * как раньше, напрямую по ссылке.
 */

import { isOnline } from './network-status'
import { debug } from './debug'

// Имя кеша начинается с trpg-media — по этому префиксу его ЩАДЯТ при жёсткой
// перезагрузке (index.html, ErrorBoundary, version-check чистят `caches`, чтобы
// выбросить старый бандл). Гифки к битой сборке отношения не имеют, а качать
// их заново из-за каждого перезапуска — потерянные мегабайты.
const CACHE_NAME = 'trpg-media-v1'

// Каталог — 158 роликов плюс превью. Держим с запасом, но не бесконечно.
const MAX_ENTRIES = 300

// Сколько блобов держим в памяти, чтобы повторное открытие карточки было
// мгновенным и не читало диск.
const MEM_LIMIT = 24

const memory = new Map()   // url → Blob (порядок вставки = давность)

let cachePromise = null

/** Доступен ли Cache API. */
function supported() {
  return typeof caches !== 'undefined' && typeof fetch === 'function'
}

function openCache() {
  if (!cachePromise) cachePromise = caches.open(CACHE_NAME).catch(() => null)
  return cachePromise
}

/** Положить в память с вытеснением самого давнего. */
function remember(url, blob) {
  memory.set(url, blob)
  while (memory.size > MEM_LIMIT) {
    const oldest = memory.keys().next().value
    memory.delete(oldest)
  }
}

/**
 * Подрезать кеш до MAX_ENTRIES — удаляем самые давние записи.
 * Зовём после записи, ошибки глушим: кеш — вещь необязательная.
 */
async function trim(cache) {
  try {
    const keys = await cache.keys()
    const extra = keys.length - MAX_ENTRIES
    for (let i = 0; i < extra; i++) await cache.delete(keys[i])
  } catch { /* не подрезали — не беда */ }
}

/**
 * Достать медиафайл: сперва память, потом диск, потом сеть.
 *
 * Возвращает Blob либо null, если файла нет ни в кеше, ни в сети (или кеш
 * недоступен). Вызывающий сам решает, что показать вместо — обычно превью.
 */
export async function getMediaBlob(url) {
  if (!url || !supported()) return null

  const mem = memory.get(url)
  if (mem) return mem

  const cache = await openCache()

  if (cache) {
    try {
      const hit = await cache.match(url)
      if (hit) {
        const blob = await hit.blob()
        remember(url, blob)
        return blob
      }
    } catch { /* битая запись — просто перекачаем */ }
  }

  // В кеше нет, и сети тоже нет — честно говорим «нечем показать».
  if (!isOnline()) return null

  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!response.ok) throw new Error('HTTP ' + response.status)

    // Копию кладём в кеш, оригинал разворачиваем в блоб.
    if (cache) {
      try {
        await cache.put(url, response.clone())
        trim(cache)
      } catch (e) { debug('[media] не смогли закешировать:', e?.message) }
    }

    const blob = await response.blob()
    remember(url, blob)
    return blob
  } catch (e) {
    debug('[media] не смогли загрузить:', url, e?.message)
    return null
  }
}

/**
 * Лежит ли файл уже в кеше (память или диск). Нужно, чтобы не мигать
 * загрузкой там, где показать можно сразу.
 */
export async function isMediaCached(url) {
  if (!url || !supported()) return false
  if (memory.has(url)) return true
  const cache = await openCache()
  if (!cache) return false
  try { return !!(await cache.match(url)) } catch { return false }
}

/**
 * Заранее сложить медиа в кеш — вызывается для упражнений открытого дня,
 * пока человек ещё смотрит на список. Тихо и по одному, чтобы не занимать
 * связь: к моменту, когда он зажмёт карточку, ролик уже лежит на диске.
 */
export async function prefetchMedia(urls) {
  if (!supported() || !isOnline()) return
  for (const url of urls) {
    if (!url) continue
    if (await isMediaCached(url)) continue
    await getMediaBlob(url)
    if (!isOnline()) return
  }
}
