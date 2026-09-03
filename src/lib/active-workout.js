/**
 * Активная тренировочная сессия — одна на всё приложение.
 *
 * Сессия = { programId, day, place, startedAt }. Появляется по тапу «Начать
 * тренировку» в дне, живёт пока не нажмёшь «Завершить» (или сброс).
 *
 * Рабочая копия — в localStorage: так быстро и работает без сети. Общая копия —
 * в базе (lib/session-sync.js): один аккаунт открывают и из Telegram, и из
 * браузера по почте, и начатая там тренировка обязана быть видна тут.
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
import { ACTIVE_WORKOUT, ACTIVE_WORKOUT_CHANGED } from './storage-keys'
import { setTrainingState } from './training-state'
import { pushSession, clearSession } from './session-sync'
import { goal, GOALS } from './metrika'

const KEY = ACTIVE_WORKOUT
const EVT = ACTIVE_WORKOUT_CHANGED

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
  const data = {
    programId, day, place: place || 'gym',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  localSet(KEY, JSON.stringify(data))
  // Цель ставится здесь, а не на кнопке: точек входа в тренировку несколько
  // (экран дня, заплыв, быстрая тренировка), а сессия заводится одна.
  goal(GOALS.WORKOUT_START, { program: programId, place: data.place })
  // Сессия живёт на устройстве, поэтому о старте отдельно сообщаем серверу —
  // иначе друзья не увидят «сейчас тренируется». Ошибка сети не критична:
  // статус протухает сам через 3 часа.
  setTrainingState(true)
  pushSession({ ...data, done: [] })
  emitChange()
  return data
}

/**
 * Обновить отметку времени локальной сессии.
 *
 * Нужна для сведения: сервер сравнивает «когда тронули здесь» с «когда
 * отменили там». Без обновления на каждой галочке отметка застывала в момент
 * старта, и свежая работа проигрывала старому надгробию.
 */
export function touchActiveWorkout() {
  const cur = getActiveWorkout()
  if (!cur) return
  localSet(KEY, JSON.stringify({ ...cur, updatedAt: new Date().toISOString() }))
}

/**
 * Заменить активную сессию целиком — используется при сведении с сервером,
 * когда тренировка была начата на другом устройстве.
 */
export function adoptActiveWorkout(session) {
  if (!session?.programId) return
  localSet(KEY, JSON.stringify({ ...session, updatedAt: new Date().toISOString() }))
  emitChange()
}

export function clearActiveWorkout() {
  localRemove(KEY)
  setTrainingState(false)
  clearSession()
  emitChange()
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

// Пороги цвета таймера тренировки (сек): до 1 ч — зелёный (наш акцент), 1ч–1ч30 —
// оранжевый, с 1ч30 — красный. Единый источник для таймера дня (WorkoutDay) и
// времени на карточках (главная/избранное/раздел).
export const TIMER_ORANGE_SEC = 3600
export const TIMER_RED_SEC = 5400
export const WORKOUT_TIMER_COLORS = {
  // НЕ --color-primary: им теперь красится буква дня, и в одной шапке два
  // одинаковых зелёных сливались бы. Свой мятный оттенок — см. --color-timer.
  green: 'var(--color-timer)',
  orange: '#F0883E',
  red: 'var(--color-error)'
}

/** Цвет таймера по прошедшим секундам (зелёный → оранжевый → красный). */
export function workoutTimerColor(sec) {
  if (sec >= TIMER_RED_SEC) return WORKOUT_TIMER_COLORS.red
  if (sec >= TIMER_ORANGE_SEC) return WORKOUT_TIMER_COLORS.orange
  return WORKOUT_TIMER_COLORS.green
}
