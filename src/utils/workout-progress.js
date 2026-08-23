/**
 * Сохранение и восстановление прогресса активной тренировки.
 *
 * Если юзер начал тренировку, отжал часть упражнений и закрыл приложение/
 * нажал назад — при возврате прогресс восстанавливается. Сбрасывается только
 * при явном завершении тренировки (кнопка "Завершить тренировку").
 *
 * Локально хранится по ключу 'workout-progress:{slug}:{place}:{day}', и тот же
 * набор уезжает в базу вместе с активной сессией — чтобы отмеченное в Telegram
 * было видно в браузере и наоборот.
 *
 * Локальный ключ включает место, а серверная запись — нет: на сервере сессия
 * одна, и место лежит в ней самой.
 * значение — JSON-массив order_num отжатых упражнений: [1, 3, 5].
 * Место (Зал/Дом/Улица) в ключе — у каждого места свой набор упражнений, значит
 * и свой прогресс/полоса заполнения.
 */

import { localGet, localSet, localRemove } from './storage'
import { pushSession } from '../lib/session-sync'
import { getActiveWorkout, touchActiveWorkout } from '../lib/active-workout'

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
  } else {
    localSet(key, JSON.stringify(activeOrderNums))
  }

  // На сервер уходит прогресс ТОЛЬКО активной тренировки: галочки на других
  // днях — это черновик, который человек оставил на потом, и подменять им
  // общую сессию нельзя. Отправка придержана внутри pushSession.
  const active = getActiveWorkout()
  if (active && active.programId === programSlug && active.day === day) {
    touchActiveWorkout()
    pushSession({
      programId: programSlug,
      day,
      place: place || 'gym',
      startedAt: active.startedAt,
      done: activeOrderNums || []
    })
  }
}

/**
 * Очистить прогресс — вызывается при успешном завершении тренировки.
 */
export function clearWorkoutProgress(programSlug, day, place) {
  localRemove(getKey(programSlug, day, place))
}