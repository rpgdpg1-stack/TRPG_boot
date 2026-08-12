import { cloudGet, cloudSet } from './cloud-storage'
import { localGet, localSet } from '../utils/storage'
import { emit } from './events'

/**
 * «Быстрая тренировка» — короткая версия дня: только те упражнения, которые
 * человек заранее отметил как важные.
 *
 * ДВЕ РАЗНЫЕ ВЕЩИ, не путать:
 *   • НАБОР (`quick-set:<slug>:<place>:<day>`) — какие упражнения входят
 *     в короткую версию. Настраивается в конструкторе, вкладка «Быстрая».
 *   • ВКЛЮЧЕНО (`quick-on:<slug>`) — горит ли сейчас ракета в дне тренировки.
 *     Это состояние «сегодня я спешу», а не настройка программы.
 *
 * Где храним: CloudStorage + localStorage-кеш (как место тренировки и активные
 * дни). В Supabase такому не место — это пользовательская настройка интерфейса,
 * а не данные (см. trpg-supabase «Кросс-девайс настройки»). Плюс так набор
 * работает и для встроенных программ, у которых своих строк в БД нет.
 *
 * Старт всегда мгновенный из localStorage, облако догоняет — иначе при открытии
 * дня список моргал бы полным составом, а потом схлопывался.
 */

export const QUICK_CHANGED = 'quick-workout-changed'

const setKey = (slug, place, day) => `quick-set:${slug}:${place || 'gym'}:${day}`
// Включённость — НА КАЖДЫЙ ДЕНЬ отдельно, не на программу: «сегодня спешу» —
// это про конкретную тренировку. Включил в дне A — в дне B ракета серая, пока
// не нажмёшь там сам.
const onKey = (slug, place, day) => `quick-on:${slug}:${place || 'gym'}:${day}`

const parse = (raw) => {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : null
  } catch { return null }
}

/**
 * Набор упражнений короткой версии дня. `null` = не настраивали (тогда короткой
 * версии просто нет — прятать ракету, а не показывать пустой день).
 */
export function getQuickSetSync(slug, place, day) {
  return parse(localGet(setKey(slug, place, day)))
}

/** То же, но с догоном из облака (другое устройство). */
export async function getQuickSet(slug, place, day) {
  const local = getQuickSetSync(slug, place, day)
  try {
    const remote = parse(await cloudGet(setKey(slug, place, day)))
    if (remote) {
      localSet(setKey(slug, place, day), JSON.stringify(remote))
      return remote
    }
  } catch { /* оффлайн — остаёмся на локальном */ }
  return local
}

/**
 * Сохранить набор. Пустой массив и полный набор одинаково означают «короткой
 * версии нет» — храним null, чтобы ракета не появлялась ради ничего.
 */
export function setQuickSet(slug, place, day, ids, totalCount) {
  const key = setKey(slug, place, day)
  const list = Array.isArray(ids) ? ids : []
  const meaningful = list.length > 0 && (!totalCount || list.length < totalCount)
  const value = meaningful ? JSON.stringify(list) : ''
  localSet(key, value)
  cloudSet(key, value)
  emit(QUICK_CHANGED, { slug, place, day })
}

/** Горит ли ракета в ЭТОМ дне. */
export function isQuickOn(slug, place, day) {
  return localGet(onKey(slug, place, day)) === '1'
}

export function setQuickOn(slug, place, day, on) {
  const key = onKey(slug, place, day)
  localSet(key, on ? '1' : '')
  cloudSet(key, on ? '1' : '')
  emit(QUICK_CHANGED, { slug, place, day, on })
}

/** Догнать состояние ракеты из облака (зашли с другого устройства). */
export async function syncQuickOn(slug, place, day) {
  try {
    const v = await cloudGet(onKey(slug, place, day))
    if (v === '1' || v === '') localSet(onKey(slug, place, day), v)
    return v === '1'
  } catch { return isQuickOn(slug, place, day) }
}

/**
 * Отфильтровать слоты дня под короткую версию. Набора нет или он покрывает
 * весь день — возвращаем как есть: «быстрая» без сокращения смысла не имеет.
 */
export function applyQuickSet(slots, quickIds) {
  if (!quickIds || quickIds.length === 0) return slots
  const keep = new Set(quickIds)
  const filtered = slots.filter(s => keep.has(s.exercise_id || s.default_exercise_id))
  return filtered.length > 0 ? filtered : slots
}
