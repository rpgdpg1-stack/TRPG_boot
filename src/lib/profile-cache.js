/**
 * Кеш публичных профилей игроков (для модалки PlayerProfileModal).
 *
 * Зачем: при тапе на друга модалка тянет getUserPublicProfile с сервера —
 * total_workouts, weekly_streak, last_workout приходят с задержкой, из-за чего
 * мелькает «—» → цифра. Кешируем ответ, чтобы при повторном открытии показать
 * сразу из кеша, а свежие данные подтянуть в фоне (stale-while-revalidate).
 *
 * Только для друзей есть смысл — их профили открываются часто. Случайных
 * тоже кешируем (лишним не будет), просто у них чаще первое открытие пустое.
 *
 * Кешируем только «визуальную» часть профиля: имя, аватар, стрик, последняя
 * тренировка. Переживает перезапуск Telegram (persistent-cache).
 */

import { pcacheGet, pcacheSet } from './persistent-cache'

const TTL_MS = 6 * 60 * 60 * 1000 // 6 часов — переживает обычные перезаходы за день

function keyFor(userId) {
  return `pubprofile:${userId}`
}

/**
 * Достать кешированный профиль (или null).
 */
export function getCachedProfile(userId) {
  if (!userId) return null
  return pcacheGet(keyFor(userId))
}

/**
 * Сохранить визуальную часть профиля в кеш.
 * Принимает полный ответ сервера, кладёт только нужные поля.
 */
export function setCachedProfile(userId, data) {
  if (!userId || !data) return
  pcacheSet(keyFor(userId), {
    weekly_streak: data.weekly_streak ?? null,
    weekly_streak_week: data.weekly_streak_week ?? null,
    total_workouts: data.total_workouts ?? null,
    last_workout: data.last_workout ?? null
  }, TTL_MS)
}