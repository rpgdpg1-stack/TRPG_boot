/**
 * Хранилище данных пользователя.
 *
 * Архитектура:
 *  - Критичное → Supabase: мускулы, стрик, daily quests, история тренировок
 *  - UI-состояние → CloudStorage Telegram (синк между устройствами): закрепы, активный день
 *  - Локально → localStorage: только как быстрый кеш Cloud
 */

import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'
import { EVENTS, emit } from './events'
import { getLevelFromXP } from './levels'
import { getCurrentWeekKey, getTodayKey } from '../utils/dates'
import { cloudGet, cloudSet, cloudRemove } from './cloud-storage'
import { localRemove } from '../utils/storage'

/* ============================================ */
/* ВНУТРЕННИЕ ХЕЛПЕРЫ */
/* ============================================ */

function getUserId() {
  return getCurrentUser()?.id || null
}

/* ============================================ */
/* МУСКУЛЫ 💪 */
/* ============================================ */

export async function getTotalXP() {
  return getCurrentUser()?.total_muscles || 0
}

export async function addXP(amount, source = 'quest', sourceId = null) {
  const userId = getUserId()
  if (!userId) {
    console.warn('[storage] addXP без авторизации')
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

  const u = getCurrentUser()
  if (u) setCurrentUser({ ...u, total_muscles: data })
  return data
}

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
  return getLevelFromXP(await getTotalXP())
}

/* ============================================ */
/* НЕДЕЛЬНЫЙ СТРИК */
/* ============================================ */

export { getCurrentWeekKey } from '../utils/dates'

export async function getWeeklyStreak() {
  const user = getCurrentUser()
  if (!user) return 0
  if (user.weekly_streak_week !== getCurrentWeekKey()) return 0
  return user.weekly_streak || 0
}

export async function setWeeklyStreak(count) {
  const userId = getUserId()
  if (!userId) return false

  const { data, error } = await supabase
    .from('users')
    .update({
      weekly_streak: count,
      weekly_streak_week: getCurrentWeekKey(),
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) { console.error('[storage] setWeeklyStreak error:', error); return false }

  setCurrentUser(data)
  return true
}

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

export async function getStreak() { return getWeeklyStreak() }
export async function setStreak(value) { return setWeeklyStreak(value) }

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
/* DAILY QUESTS */
/* ============================================ */

export async function getDailyQuests() {
  const userId = getUserId()
  if (!userId) return {}

  const { data, error } = await supabase
    .from('daily_quests')
    .select('quest_id')
    .eq('user_id', userId)
    .eq('day_key', getTodayKey())

  if (error) {
    console.error('[storage] getDailyQuests error:', error)
    return {}
  }

  const result = {}
  for (const row of data || []) result[row.quest_id] = true
  return result
}

export async function completeQuest(questId, reward = 20) {
  const userId = getUserId()
  if (!userId) {
    console.warn('[storage] completeQuest без авторизации')
    return { completed: {}, wasNew: false, newTotalMuscles: 0 }
  }

  const { data, error } = await supabase.rpc('complete_daily_quest', {
    p_user_id: userId,
    p_day_key: getTodayKey(),
    p_quest_id: questId,
    p_reward: reward
  })

  if (error) {
    console.error('[storage] completeQuest error:', error)
    return { completed: await getDailyQuests(), wasNew: false, newTotalMuscles: 0 }
  }

  const result = data?.[0] || data || {}

  if (result.was_new && result.new_total_muscles !== undefined) {
    const u = getCurrentUser()
    if (u) {
      setCurrentUser({ ...u, total_muscles: result.new_total_muscles })
      emit(EVENTS.USER_CHANGED, getCurrentUser())
    }
  }

  const completed = await getDailyQuests()
  return {
    completed,
    wasNew: result.was_new || false,
    newTotalMuscles: result.new_total_muscles || 0
  }
}

/* ============================================ */
/* ЗАКРЕПЫ И АКТИВНЫЙ ДЕНЬ — теперь через Telegram CloudStorage           */
/* Синхронизируются между всеми устройствами одного Telegram-аккаунта.   */
/* ============================================ */

export async function getActiveDay(programId) {
  const lastCompleted = await cloudGet(`program:${programId}:last_day`)
  if (!lastCompleted) return null
  const cycle = { 'A': 'B', 'B': 'C', 'C': 'A' }
  return cycle[lastCompleted] || 'A'
}

export async function setLastCompletedDay(programId, day) {
  return cloudSet(`program:${programId}:last_day`, day)
}

export async function getPinnedPrograms() {
  const raw = await cloudGet('pinned_programs')
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export async function isPinned(programId) {
  return (await getPinnedPrograms()).includes(programId)
}

export async function togglePin(programId) {
  const pinned = await getPinnedPrograms()
  const idx = pinned.indexOf(programId)
  if (idx === -1) pinned.push(programId)
  else pinned.splice(idx, 1)
  await cloudSet('pinned_programs', JSON.stringify(pinned))
  return idx === -1
}

/* ============================================ */
/* СБРОС ВСЕХ ДАННЫХ */
/* ============================================ */

export async function clearAllData() {
  const userId = getUserId()

  // Чистим Cloud-ключи (синкается между устройствами)
  await cloudRemove('pinned_programs')
  await cloudRemove('program:split:last_day')

  // Чистим локальные UI-ключи которые НЕ в Cloud
  ;['daily_quests', 'weekly_streak', 'dev_telegram_id'].forEach(localRemove)

  if (!userId) return

  // Сбрасываем профиль юзера в БД
  await supabase.from('users').update({
    total_muscles: 0,
    weekly_streak: 0,
    weekly_streak_week: null,
    updated_at: new Date().toISOString()
  }).eq('id', userId)

  await supabase.from('muscle_history').delete().eq('user_id', userId)
  await supabase.from('daily_quests').delete().eq('user_id', userId)

  const { data } = await supabase.from('users').select('*').eq('id', userId).single()
  if (data) {
    setCurrentUser(data)
    emit(EVENTS.USER_CHANGED, data)
  }
}