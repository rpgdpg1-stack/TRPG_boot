import { loadPrefs, getPrefSync, setPref } from './prefs'
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

/**
 * Набор упражнений короткой версии дня. `null` = не настраивали (тогда короткой
 * версии просто нет — прятать ракету, а не показывать пустой день).
 */
export function getQuickSetSync(slug, place, day) {
  const value = getPrefSync(setKey(slug, place, day), null)
  return Array.isArray(value) && value.length > 0 ? value : null
}

/** То же, но дождавшись настроек аккаунта (первый заход на устройстве). */
export async function getQuickSet(slug, place, day) {
  await loadPrefs()
  return getQuickSetSync(slug, place, day)
}

/**
 * Сохранить набор. Пустой массив и полный набор одинаково означают «короткой
 * версии нет» — храним null, чтобы ракета не появлялась ради ничего.
 */
export function setQuickSet(slug, place, day, ids, totalCount) {
  const list = Array.isArray(ids) ? ids : []
  const meaningful = list.length > 0 && (!totalCount || list.length < totalCount)
  // Бессмысленный набор храним как null, а не как пустой список: в базе не
  // копится мусор, а «короткой версии нет» читается одним значением.
  setPref(setKey(slug, place, day), meaningful ? list : null)
  emit(QUICK_CHANGED, { slug, place, day })
}

/** Горит ли ракета в ЭТОМ дне. */
export function isQuickOn(slug, place, day) {
  return getPrefSync(onKey(slug, place, day), false) === true
}

export function setQuickOn(slug, place, day, on) {
  setPref(onKey(slug, place, day), !!on)
  emit(QUICK_CHANGED, { slug, place, day, on })
}

/** Догнать состояние ракеты после загрузки настроек аккаунта. */
export async function syncQuickOn(slug, place, day) {
  await loadPrefs()
  return isQuickOn(slug, place, day)
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
