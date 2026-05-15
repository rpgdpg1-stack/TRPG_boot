/**
 * Хранилище данных пользователя.
 *
 * setLastCompletedDay идемпотентна по дате: повторное завершение в тот же
 * день не сдвигает цикл. Дату читаем синхронно из localStorage чтобы
 * избежать гонок с Cloud.
 *
 * resetProgramDayCycle — отдельный сброс ТОЛЬКО порядка дней A/B/C.
 * Не трогает мускулы, стрик, историю — полезно когда юзер хочет сменить
 * стартовую точку цикла без потери прогресса.
 */

import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'
import { EVENTS, emit } from './events'
import { getLevelFromXP } from './levels'
import { getCurrentWeekKey, getTodayKey } from '../utils/dates'
import { cloudGet, cloudSet, cloudRemove } from './cloud-storage'
import { localGet, localSet, localRemove } from '../utils/storage'
import { cacheGet, cacheSet, cacheInvalidate, TTL } from './cache'

function getUserId() {
  return getCurrentUser()?.id || null
}

/* ============================================ */
/* МУСКУЛЫ */
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

  cacheInvalidate(`muscle-history:${userId}`)

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

export async function getRecentMuscleHistory(limit = 5) {
  const userId = getUserId()
  if (!userId) return []

  const cacheKey = `muscle-history:${userId}:${limit}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_recent_muscle_history', {
      p_user_id: userId,
      p_limit: limit
    })

    if (error) {
      console.warn('[storage] getRecentMuscleHistory RPC error:', error)
      const { data: fb, error: fbErr } = await supabase
        .from('muscle_history')
        .select('amount, source, recorded_at')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(limit)

      if (fbErr) {
        console.error('[storage] getRecentMuscleHistory fallback error:', fbErr)
        return []
      }
      const result = (fb || []).map(r => ({ amount: r.amount, source: r.source, created_at: r.recorded_at }))
      cacheSet(cacheKey, result, TTL.MEDIUM)
      return result
    }

    const result = data || []
    cacheSet(cacheKey, result, TTL.MEDIUM)
    return result
  } catch (e) {
    console.error('[storage] getRecentMuscleHistory exception:', e)
    return []
  }
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
/* СОВМЕСТИМОСТЬ */
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

function getDailyQuestsCacheKey() {
  const userId = getUserId()
  return userId ? `daily-quests-cache:${userId}:${getTodayKey()}` : null
}

export function getDailyQuestsSync() {
  const key = getDailyQuestsCacheKey()
  if (!key) return {}

  const raw = localGet(key)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

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
    return getDailyQuestsSync()
  }

  const result = {}
  for (const row of data || []) result[row.quest_id] = true

  const key = getDailyQuestsCacheKey()
  if (key) localSet(key, JSON.stringify(result))

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
    cacheInvalidate(`muscle-history:${userId}`)
  }

  const completed = await getDailyQuests()
  return {
    completed,
    wasNew: result.was_new || false,
    newTotalMuscles: result.new_total_muscles || 0
  }
}

/* ============================================ */
/* ЗАКРЕПЫ И АКТИВНЫЙ ДЕНЬ */
/* ============================================ */

/**
 * Какой день рекомендовать сейчас. Сдвиг last_day → следующий по циклу.
 * Если last_day отсутствует (юзер ничего не отжимал или только что сбросил
 * порядок) — возвращаем null. UI с этим null правильно покажет "все буквы серые".
 */
export async function getActiveDay(programId) {
  const lastCompleted = await cloudGet(`program:${programId}:last_day`)
  if (!lastCompleted) return null
  const cycle = { 'A': 'B', 'B': 'C', 'C': 'A' }
  return cycle[lastCompleted] || 'A'
}

/**
 * Записать какой день был завершён последним. Идемпотентно по дате:
 *  - Если сегодня уже записано → ничего не делаем.
 *  - Иначе → пишем новый day и сегодняшнюю дату.
 *
 * Дату читаем СИНХРОННО через localGet — никаких гонок с Cloud.
 */
export async function setLastCompletedDay(programId, day) {
  const today = getTodayKey()

  const lastDayDateKey = `program:${programId}:last_day_date`
  const lastDayKey = `program:${programId}:last_day`

  const previousDateRaw = localGet(lastDayDateKey)
  const previousDate = previousDateRaw ? String(previousDateRaw).trim() : null

  console.log('[setLastCompletedDay] called:', {
    programId,
    day,
    today,
    previousDate,
    willSkip: previousDate === today
  })

  if (previousDate === today) {
    return
  }

  await cloudSet(lastDayKey, day)
  await cloudSet(lastDayDateKey, today)

  console.log('[setLastCompletedDay] saved:', { lastDayKey: day, lastDayDateKey: today })
}

/**
 * Сбросить ТОЛЬКО порядок дней программы — мускулы, стрик и история остаются.
 *
 * После этого:
 *  - getActiveDay вернёт null → ProgramCard покажет все буквы серыми
 *  - первое же завершение тренировки задаст новую точку отсчёта
 *
 * Использование: кнопка "Сбросить порядок дней" в настройках для случая когда
 * юзер хочет начать новую неделю с другого дня (например, не с A, а с B).
 */
export async function resetProgramDayCycle(programId) {
  await cloudRemove(`program:${programId}:last_day`)
  await cloudRemove(`program:${programId}:last_day_date`)
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

  await cloudRemove('pinned_programs')
  await cloudRemove('program:split:last_day')
  await cloudRemove('program:split:last_day_date')

  ;['daily_quests', 'weekly_streak', 'dev_telegram_id'].forEach(localRemove)

  const questsKey = getDailyQuestsCacheKey()
  if (questsKey) localRemove(questsKey)

  cacheInvalidate('')

  if (!userId) return

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