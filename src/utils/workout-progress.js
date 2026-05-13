/**
 * Сохранение и восстановление прогресса активной тренировки.
 *
 * Если юзер начал тренировку, отжал часть упражнений и закрыл приложение/
 * нажал назад — при возврате прогресс восстанавливается. Сбрасывается только
 * при явном завершении тренировки (кнопка "Завершить тренировку").
 *
 * Хранится в localStorage по ключу 'workout-progress:{slug}:{day}',
 * значение — JSON-массив order_num отжатых упражнений: [1, 3, 5]
 */

import { localGet, localSet, localRemove } from './storage'

/**
 * Внутренний хелпер — собирает ключ из slug программы и дня.
 */
function getKey(programSlug, day) {
  return `workout-progress:${programSlug}:${day}`
}

/**
 * Загрузить сохранённый прогресс. Возвращает массив order_num.
 * Если ничего не сохранено или данные битые — пустой массив.
 */
export function loadWorkoutProgress(programSlug, day) {
  const raw = localGet(getKey(programSlug, day))
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
export function saveWorkoutProgress(programSlug, day, activeOrderNums) {
  const key = getKey(programSlug, day)

  if (!activeOrderNums || activeOrderNums.length === 0) {
    localRemove(key)
    return
  }

  localSet(key, JSON.stringify(activeOrderNums))
}

/**
 * Очистить прогресс — вызывается при успешном завершении тренировки.
 */
export function clearWorkoutProgress(programSlug, day) {
  localRemove(getKey(programSlug, day))
}