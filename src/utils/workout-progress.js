/**
 * Сохранение и восстановление прогресса активной тренировки.
 *
 * Если юзер начал тренировку, отжал часть упражнений и закрыл приложение/
 * нажал назад — при возврате прогресс восстанавливается. Сбрасывается только
 * при явном завершении тренировки (кнопка "Завершить тренировку").
 *
 * Хранится в localStorage по ключу 'workout-progress:{slug}:{place}:{day}',
 * значение — JSON-массив order_num отжатых упражнений: [1, 3, 5].
 * Место (Зал/Дом/Улица) в ключе — у каждого места свой набор упражнений, значит
 * и свой прогресс/полоса заполнения.
 */

import { localGet, localSet, localRemove } from './storage'

/**
 * Внутренний хелпер — собирает ключ из slug программы, места и дня.
 */
function getKey(programSlug, day, place = 'gym') {
  return `workout-progress:${programSlug}:${place}:${day}`
}

/**
 * Загрузить сохранённый прогресс. Возвращает массив order_num.
 * Если ничего не сохранено или данные битые — пустой массив.
 */
export function loadWorkoutProgress(programSlug, day, place) {
  const raw = localGet(getKey(programSlug, day, place))
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Фильтр на всякий случай — оставляем только числа
    return parsed.filter(n => typeof n === 'number')
  } catch {
    return []
  }
}

/**
 * Сохранить текущий прогресс. activeOrderNums — массив order_num.
 * Если массив пустой — удаляем ключ, чтобы не засорять localStorage.
 */
export function saveWorkoutProgress(programSlug, day, place, activeOrderNums) {
  const key = getKey(programSlug, day, place)

  if (!activeOrderNums || activeOrderNums.length === 0) {
    localRemove(key)
    return
  }

  localSet(key, JSON.stringify(activeOrderNums))
}

/**
 * Очистить прогресс — вызывается при успешном завершении тренировки.
 */
export function clearWorkoutProgress(programSlug, day, place) {
  localRemove(getKey(programSlug, day, place))
}