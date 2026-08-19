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
 * Сохранить профиль в кеш.
 *
 * Кладём ВСЁ, что рисует карточка, включая флаги приватности и любимые.
 * Раньше сохранялись только стрик и последняя тренировка — и при повторном
 * открытии друга карточка стартовала из кеша без `show_stats`/`favorites`,
 * то есть без плиток «Статистика» и «Любимые». Пока не долетал свежий ответ
 * сервера, тапать было не по чему, а на медленной сети окно затягивалось и
 * читалось как «не работает».
 */
export function setCachedProfile(userId, data) {
  if (!userId || !data) return
  pcacheSet(keyFor(userId), {
    weekly_streak: data.weekly_streak ?? null,
    weekly_streak_week: data.weekly_streak_week ?? null,
    total_workouts: data.total_workouts ?? null,
    total_minutes: data.total_minutes ?? null,
    last_workout: data.last_workout ?? null,
    stats_month: data.stats_month ?? null,
    stats_year: data.stats_year ?? null,
    favorites: data.favorites ?? null,
    show_last_workout: data.show_last_workout ?? true,
    show_stats: data.show_stats ?? false,
    show_favorites: data.show_favorites ?? false
  }, TTL_MS)
}