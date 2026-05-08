/**
 * Хранилище данных пользователя.
 *
 * Г6: переезд с Telegram CloudStorage на Supabase.
 *
 * - Мускулы 💪 → users.total_muscles + лог в muscle_history
 * - Недельный стрик → users.weekly_streak + weekly_streak_week
 * - Daily Quests → остаются в localStorage (один день, нет смысла синхронизировать)
 * - Закрепы программ и активный день → пока в localStorage (мелкие и редкие)
 */

import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'
import { getLevelFromXP } from './levels'

/* ============================================ */
/* ВНУТРЕННИЙ HELPER */
/* ============================================ */

/**
 * Получить ID текущего юзера в нашей БД.
 * Если авторизация ещё не прошла — вернёт null.
 */
function getUserId() {
  const u = getCurrentUser()
  return u?.id || null
}

/**
 * Локальное хранилище — для daily quests и закрепов программ.
 */
function localGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function localSet(key, value) {
  try { localStorage.setItem(key, String(value)); return true } catch { return false }
}
function localRemove(key) {
  try { localStorage.removeItem(key); return true } catch { return false }
}

/* ============================================ */
/* МУСКУЛЫ 💪 (бывший XP) */
/* ============================================ */

export async function getTotalXP() {
  const user = getCurrentUser()
  if (!user) return 0
  return user.total_muscles || 0
}

/**
 * Начислить мускулы юзеру. Атомарно через RPC.
 *
 * @param {number} amount — сколько начислить
 * @param {string} source — 'workout' / 'quest' / 'streak_bonus' (для статистики)
 * @param {string} sourceId — опционально, доп. ID
 * @returns {number} новый total_muscles
 */
export async function addXP(amount, source = 'quest', sourceId = null) {
  const userId = getUserId()
  if (!userId) {
    console.warn('[storage] addXP вызван без авторизации')
    return 0
  }

  const { data, error } = await supabase.rpc('add_muscles', {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_source_id: sourceId
  })

  if (error) {
    console.error('[storage] addXP error:', error)
    return getCurrentUser()?.total_muscles || 0
  }

  // Обновляем кеш юзера локально (без лишнего запроса)
  const u = getCurrentUser()
  if (u) setCurrentUser({ ...u, total_muscles: data })

  return data
}

/**
 * Установить total_muscles напрямую (только для отладки/сброса).
 */
export async function setTotalXP(value) {
  const userId = getUserId()
  if (!userId) return false

  const { error } = await supabase
    .from('users')
    .update({ total_muscles: value, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) { console.error('[storage] setTotalXP error:', error); return false }

  const u = getCurrentUser()
  if (u) setCurrentUser({ ...u, total_muscles: value })
  return true
}

export async function getUserLevel() {
  const xp = await getTotalXP()
  return getLevelFromXP(xp)
}

/* ============================================ */
/* НЕДЕЛЬНЫЙ СТРИК (огоньки) */
/* ============================================ */

/**
 * Ключ текущей недели — понедельник 03:00 МСК как начало.
 */
export function getCurrentWeekKey() {
  const now = new Date()
  now.setHours(now.getHours() - 3) // -3 ч = до 03:00 МСК неделя считается прошлой
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

/**
 * Получить количество тренировок на текущей неделе.
 * Если в БД сохранена другая неделя — считается что 0 (сброс).
 */
export async function getWeeklyStreak() {
  const user = getCurrentUser()
  if (!user) return 0

  const currentWeek = getCurrentWeekKey()
  if (user.weekly_streak_week !== currentWeek) {
    // Неделя сменилась — стрик уже неактуален
    return 0
  }
  return user.weekly_streak || 0
}

/**
 * Установить значение стрика напрямую (для отладки).
 */
export async function setWeeklyStreak(count) {
  const userId = getUserId()
  if (!userId) return false

  const week = getCurrentWeekKey()

  const { data, error } = await supabase
    .from('users')
    .update({
      weekly_streak: count,
      weekly_streak_week: week,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) { console.error('[storage] setWeeklyStreak error:', error); return false }

  setCurrentUser(data)
  return true
}

/**
 * Добавить +1 тренировку к недельному стрику.
 * Если неделя сменилась — начинаем с 1.
 * Лимит 4.
 */
export async function addWorkoutToWeek() {
  const userId = getUserId()
  if (!userId) return 0

  const currentWeek = getCurrentWeekKey()
  const user = getCurrentUser()
  const isCurrentWeek = user?.weekly_streak_week === currentWeek
  const newCount = Math.min(isCurrentWeek ? (user.weekly_streak + 1) : 1, 4)

  await setWeeklyStreak(newCount)
  return newCount
}

/* ============================================ */
/* СОВМЕСТИМОСТЬ — старые экраны */
/* ============================================ */

/**
 * Старый "дневной стрик" в Progress.jsx — пока возвращаем недельный.
 */
export async function getStreak() {
  return getWeeklyStreak()
}

export async function setStreak(value) {
  return setWeeklyStreak(value)
}

/**
 * Всего тренировок — считаем из таблицы workouts.
 */
export async function getTotalWorkouts() {
  const userId = getUserId()
  if (!userId) return 0

  const { count, error } = await supabase
    .from('workouts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('finished_at', 'is', null)

  if (error) { console.error('[storage] getTotalWorkouts error:', error); return 0 }
  return count || 0
}

/* ============================================ */
/* DAILY QUESTS — остаются в localStorage */
/* ============================================ */

export async function getDailyQuests() {
  const raw = localGet('daily_quests')
  if (!raw) return {}
  try {
    const data = JSON.parse(raw)
    if (data.date !== getTodayKey()) return {}
    return data.completed || {}
  } catch {
    return {}
  }
}

export async function completeQuest(questId) {
  const today = getTodayKey()
  const completed = await getDailyQuests()
  completed[questId] = true
  localSet('daily_quests', JSON.stringify({ date: today, completed }))
  return completed
}

function getTodayKey() {
  const now = new Date()
  now.setHours(now.getHours() - 3)
  return now.toISOString().split('T')[0]
}

/* ============================================ */
/* ЗАКРЕПЫ И АКТИВНЫЙ ДЕНЬ — в localStorage */
/* ============================================ */

export async function getActiveDay(programId) {
  const lastCompleted = localGet(`program:${programId}:last_day`)
  if (!lastCompleted) return null
  const cycle = { 'A': 'B', 'B': 'C', 'C': 'A' }
  return cycle[lastCompleted] || 'A'
}

export async function setLastCompletedDay(programId, day) {
  return localSet(`program:${programId}:last_day`, day)
}

export async function getPinnedPrograms() {
  const raw = localGet('pinned_programs')
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export async function isPinned(programId) {
  const pinned = await getPinnedPrograms()
  return pinned.includes(programId)
}

export async function togglePin(programId) {
  const pinned = await getPinnedPrograms()
  const idx = pinned.indexOf(programId)
  if (idx === -1) pinned.push(programId)
  else pinned.splice(idx, 1)
  localSet('pinned_programs', JSON.stringify(pinned))
  return idx === -1
}

/* ============================================ */
/* НАЗВАНИЕ УРОВНЯ — для Progress.jsx (legacy) */
/* ============================================ */

export function getLevelName(level) {
  if (level >= 31) return 'БЕССМЕРТНЫЙ'
  if (level >= 28) return 'АХИЛЛ'
  if (level >= 25) return 'ЛЕГЕНДА'
  if (level >= 22) return 'ТИТАН'
  if (level >= 19) return 'ГЕРАКЛ'
  if (level >= 16) return 'ЦЕНТУРИОН'
  if (level >= 13) return 'ВИТЯЗЬ'
  if (level >= 10) return 'БОЕЦ'
  if (level >= 7)  return 'АТЛЕТ'
  if (level >= 4)  return 'СПОРТСМЕН'
  return 'НОВОБРАНЕЦ'
}

/* ============================================ */
/* ОТЛАДКА — сброс данных юзера */
/* ============================================ */

export async function clearAllData() {
  const userId = getUserId()

  // Локальные данные
  ['pinned_programs', 'daily_quests', 'program:split:last_day'].forEach(localRemove)

  // Серверные — обнуляем мускулы и стрик
  if (userId) {
    await supabase.from('users').update({
      total_muscles: 0,
      weekly_streak: 0,
      weekly_streak_week: null
    }).eq('id', userId)

    // Опционально: удаляем историю
    await supabase.from('muscle_history').delete().eq('user_id', userId)

    // Перечитываем юзера
    const { data } = await supabase.from('users').select('*').eq('id', userId).single()
    if (data) setCurrentUser(data)
  }
}
