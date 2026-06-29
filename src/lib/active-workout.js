/**
 * Активная тренировочная сессия — одна на всё приложение.
 *
 * Сессия = { programId, day, place, startedAt }. Появляется по тапу «Начать
 * тренировку» в дне, живёт пока не нажмёшь «Завершить» (или сброс). Хранится в
 * localStorage (живой сеанс привязан к устройству, не нужен кросс-девайс).
 *
 * Пока сессия активна:
 *  - таймер дня тикает (elapsed = now − startedAt), переживает уход/возврат;
 *  - галочки упражнений можно ставить только в этом дне;
 *  - на других днях/программах кнопка «Начать» заблокирована (одна за раз);
 *  - на карточках программы (главная/раздел/избранное) — «Идёт тренировка · N мин».
 *
 * Смена статуса шлёт CustomEvent — компоненты подписываются через
 * onActiveWorkoutChange и перерисовываются.
 */

import { localGet, localSet, localRemove } from '../utils/storage'

const KEY = 'active-workout'
const EVT = 'active-workout-changed'

export function getActiveWorkout() {
  const raw = localGet(KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return v && v.programId && v.startedAt ? v : null
  } catch {
    return null
  }
}

export function startActiveWorkout(programId, day, place = 'gym') {
  const data = { programId, day, place: place || 'gym', startedAt: new Date().toISOString() }
  localSet(KEY, JSON.stringify(data))
  emitChange()
  return data
}

export function clearActiveWorkout() {
  localRemove(KEY)
  emitChange()
}

/**
 * Активна ли сессия для программы (и, опционально, дня). Место намеренно НЕ
 * учитываем: сессия привязана к (program, day), смена места внутри дня её не рвёт.
 */
export function isActiveWorkout(programId, day = null) {
  const a = getActiveWorkout()
  if (!a || a.programId !== programId) return false
  if (day != null && a.day !== day) return false
  return true
}

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVT))
}

export function onActiveWorkoutChange(handler) {
  window.addEventListener(EVT, handler)
  return () => window.removeEventListener(EVT, handler)
}

/** Секунды с момента старта сессии. */
export function elapsedSecFrom(startedAt) {
  if (!startedAt) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
}

/**
 * Длительность без секунд: «0 мин», «20 мин», «1 ч 20 мин». Единый формат для
 * таймера дня и индикатора на карточках.
 */
export function formatWorkoutMin(totalSec) {
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin < 60) return `${totalMin} мин`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
}

// Пороги цвета таймера тренировки (сек): до 1 ч — зелёный, 1ч–1ч30 — оранжевый,
// с 1ч30 — красный. Единый источник для таймера дня (WorkoutDay) и индикатора
// «Продолжить · N» на карточках (главная/избранное/раздел).
export const TIMER_ORANGE_SEC = 3600
export const TIMER_RED_SEC = 5400
export const WORKOUT_TIMER_COLORS = {
  green: 'var(--color-primary)',
  orange: '#F0883E',
  red: '#E84545'
}

/** Цвет таймера по прошедшим секундам (зелёный → оранжевый → красный). */
export function workoutTimerColor(sec) {
  if (sec >= TIMER_RED_SEC) return WORKOUT_TIMER_COLORS.red
  if (sec >= TIMER_ORANGE_SEC) return WORKOUT_TIMER_COLORS.orange
  return WORKOUT_TIMER_COLORS.green
}
