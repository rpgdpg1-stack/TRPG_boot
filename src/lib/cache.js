/**
 * In-memory кеш с TTL для запросов к Supabase.
 *
 * Зачем: при свайпе между днями A/B/C страница WorkoutDay делает 3 запроса
 * (свапы, упражнения, веса). Без кеша каждое переключение = 300-800мс ожидания.
 * С кешем второй и далее открытия дня — мгновенные.
 *
 * Архитектура:
 *  - cache: Map<key, { data, expiresAt }>
 *  - get(key) — возвращает данные если не протухли, иначе null
 *  - set(key, data, ttlMs) — сохраняет с TTL
 *  - invalidate(prefix) — удаляет все ключи начинающиеся с prefix
 *
 * Кеш живёт в памяти ВКЛАДКИ — при закрытии Mini App данные пропадают.
 * Это намеренно: при следующем открытии получим свежие данные из БД.
 *
 * Использование:
 *   const cached = cacheGet('exercises:all')
 *   if (cached) return cached
 *   const data = await supabase.rpc(...)
 *   cacheSet('exercises:all', data, TTL_SESSION)
 *   return data
 */

const cache = new Map()

/**
 * TTL пресеты в миллисекундах
 */
export const TTL = {
  SHORT: 30 * 1000,           // 30 сек — для весов/свапов после изменения
  MEDIUM: 5 * 60 * 1000,      // 5 минут — для редко меняющихся данных
  LONG: 60 * 60 * 1000,       // 1 час — почти сессионный
  SESSION: 24 * 60 * 60 * 1000 // 24 часа — фактически вся сессия
}

/**
 * Получить значение из кеша.
 * Если истёк TTL — удаляем и возвращаем null.
 */
export function cacheGet(key) {
  const entry = cache.get(key)
  if (!entry) return null

  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }

  return entry.data
}

/**
 * Положить значение в кеш с TTL.
 */
export function cacheSet(key, data, ttlMs = TTL.MEDIUM) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs
  })
}

/**
 * Удалить конкретный ключ из кеша.
 */
export function cacheDelete(key) {
  cache.delete(key)
}

/**
 * Удалить все ключи начинающиеся с prefix.
 *
 * Пример: после сохранения свапа надо инвалидировать ВСЕ дни программы,
 * потому что свап для дня A влияет только на день A, но мы не хотим
 * угадывать какие дни закешированы.
 *
 *   cacheInvalidate('workout-day:')  → удалит все дни
 *   cacheInvalidate('user-weights:') → удалит все веса
 */
export function cacheInvalidate(prefix) {
  const toDelete = []
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      toDelete.push(key)
    }
  }
  for (const key of toDelete) {
    cache.delete(key)
  }
}

/**
 * Полная очистка кеша. Используется при logout / reset.
 */
export function cacheClear() {
  cache.clear()
}

/**
 * Запустить функцию в момент когда браузер свободен.
 * Используется для предзагрузки соседних дней — не блокирует UI.
 *
 * Fallback на setTimeout если requestIdleCallback не поддерживается
 * (например, Safari < 16.4).
 */
export function runWhenIdle(fn) {
  if (typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 2000 })
  } else {
    setTimeout(fn, 200)
  }
}