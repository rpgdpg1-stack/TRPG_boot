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
 * Запросы, которые сейчас в полёте: ключ → промис (FE-001 / PERF-003).
 *
 * Кеш выше отвечает на вопрос «данные уже пришли?», но не на вопрос «за ними
 * уже пошли?». Пока ответа нет, `cacheGet` отдаёт null — и два компонента,
 * смонтированные в одном кадре, оба уходят в сеть за одним и тем же.
 * Так на `/history` история тренировок грузилась дважды: сам экран и
 * вложенный календарь спрашивали её независимо.
 */
const inflight = new Map()

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
 * Один запрос на всех, кто спросил одновременно (FE-001 / PERF-003).
 *
 * Порядок: готовые данные → уже летящий запрос → новый запрос.
 * Второй и последующие вызывающие получают ТОТ ЖЕ промис, а не свой запрос.
 *
 * Кеширование намеренно оставлено загрузчику: только он знает, можно ли
 * доверять ответу (`canTrust` — пустой ответ без ошибки не должен затирать
 * настоящие данные). Здесь мы объединяем вызовы, но не решаем за него.
 *
 *   const data = await cacheDedupe(key, async () => {
 *     const { data, error } = await supabase.rpc(...)
 *     if (canTrust(error)) cacheSet(key, data, TTL.LONG)
 *     return data
 *   })
 */
export function cacheDedupe(key, loader) {
  const cached = cacheGet(key)
  if (cached) return Promise.resolve(cached)

  const flying = inflight.get(key)
  if (flying) return flying

  // Ошибку тоже снимаем с полёта: иначе следующий вызывающий получил бы
  // навсегда упавший промис и экран залип бы на пустоте.
  const promise = Promise.resolve()
    .then(loader)
    .finally(() => { inflight.delete(key) })

  inflight.set(key, promise)
  return promise
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
  // Летящие запросы с тем же префиксом тоже сбрасываем: они несут данные,
  // снятые ДО изменения, и класть их в кеш после инвалидации нельзя.
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key)
  }
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