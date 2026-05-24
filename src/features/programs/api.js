/**
 * Логика загрузки и завершения тренировки.
 *
 * finishWorkout теперь читает new_badge_rank_index из RPC и эмитит
 * BADGE_EARNED → модалка значка появится сразу после тапа "Завершить".
 *
 * Кеш и prefetch — без изменений.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser, setCurrentUser } from '../../lib/auth'
import { EVENTS, emit } from '../../lib/events'
import { getCurrentWeekKey } from '../../utils/dates'
import { getProgramBySlug, getProgramDaySlots } from './registry'
import { cacheGet, cacheSet, cacheInvalidate, TTL, runWhenIdle } from '../../lib/cache'

async function loadAllExercises() {
  const cacheKey = 'exercises:all'
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  let exercises = []

  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data?.length) {
      exercises = data
    }
  } catch (e) {
    console.warn('[programs] api_get_all_exercises failed:', e?.message)
  }

  if (!exercises.length) {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, sub_group, type, meta_info, preview_url, video_url, priority')
        .order('priority', { ascending: true })
      if (!error && data?.length) {
        exercises = data
      }
    } catch (e) {
      console.warn('[programs] direct select exercises failed:', e?.message)
    }
  }

  if (exercises.length) {
    cacheSet(cacheKey, exercises, TTL.SESSION)
  }

  return exercises
}

async function loadUserSwaps(userId, dbId, day) {
  const cacheKey = `user-swaps:${userId}:${dbId}:${day}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  let swapsByOrder = {}
  try {
    const { data: swaps, error } = await supabase.rpc('api_get_user_swaps', {
      p_user_id: userId,
      p_program_id: dbId,
      p_day: day
    })
    if (!error && swaps) {
      for (const s of swaps) swapsByOrder[s.order_num] = s.exercise_id
    }
  } catch (e) {
    console.warn('[programs] swaps fetch failed:', e?.message)
  }

  cacheSet(cacheKey, swapsByOrder, TTL.LONG)
  return swapsByOrder
}

async function loadUserWeights(userId) {
  const cacheKey = `user-weights:${userId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  let weightsByEx = {}
  try {
    const { data: weights, error } = await supabase.rpc('api_get_user_weights', {
      p_user_id: userId
    })
    if (!error && weights) {
      for (const w of weights) weightsByEx[w.exercise_id] = w.weight_kg
    }
  } catch (e) {
    console.warn('[programs] weights fetch failed:', e?.message)
  }

  cacheSet(cacheKey, weightsByEx, TTL.LONG)
  return weightsByEx
}

export async function getWorkoutDay(programSlug, day) {
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] no user, returning []')
    return []
  }

  const program = getProgramBySlug(programSlug)
  if (!program) {
    console.warn('[programs] unknown program slug:', programSlug)
    return []
  }
  const dbId = program.dbId

  const dayCacheKey = `workout-day:${user.id}:${programSlug}:${day}`
  const cachedDay = cacheGet(dayCacheKey)
  if (cachedDay) {
    schedulePrefetch(programSlug, day, user.id)
    return cachedDay
  }

  const slotsRaw = getProgramDaySlots(programSlug, day)
  if (!slotsRaw.length) return []

  const [swapsByOrder, exercises, weightsByEx] = await Promise.all([
    loadUserSwaps(user.id, dbId, day),
    loadAllExercises(),
    loadUserWeights(user.id)
  ])

  const exById = {}
  for (const e of exercises) exById[e.id] = e

  const result = slotsRaw.map(slot => {
    let exerciseId = swapsByOrder[slot.order_num]
    let isSwapped = !!exerciseId

    if (!exerciseId) {
      exerciseId = slot.default_exercise_id || null
    }

    if (!exerciseId || !exById[exerciseId]) {
      const candidates = exercises.filter(
        e => e.sub_group === slot.sub_group && e.type === slot.type
      )
      exerciseId = candidates[0]?.id || exerciseId
    }

    const ex = exerciseId ? exById[exerciseId] : null
    const fallbackName = `${slot.sub_group} (${slot.type})`

    return {
      order_num: slot.order_num,
      muscle_group: slot.muscle_group,
      sub_group: slot.sub_group,
      type: slot.type,
      exercise_id: exerciseId,
      exercise_name: ex?.name || fallbackName,
      meta_info: ex?.meta_info || '3 × 8-12',
      preview_url: ex?.preview_url || null,
      video_url: ex?.video_url || null,
      is_swapped: isSwapped,
      user_weight_kg: weightsByEx[exerciseId] ?? null
    }
  })

  cacheSet(dayCacheKey, result, TTL.MEDIUM)

  schedulePrefetch(programSlug, day, user.id)

  return result
}

function schedulePrefetch(programSlug, currentDay, userId) {
  const program = getProgramBySlug(programSlug)
  if (!program) return

  const days = Object.keys(program.data.days)
  const idx = days.indexOf(currentDay)
  if (idx === -1) return

  const prev = idx > 0 ? days[idx - 1] : days[days.length - 1]
  const next = idx < days.length - 1 ? days[idx + 1] : days[0]

  const neighbours = [prev, next].filter(d => d !== currentDay)

  for (const d of neighbours) {
    const key = `workout-day:${userId}:${programSlug}:${d}`
    if (cacheGet(key)) continue

    runWhenIdle(() => {
      getWorkoutDay(programSlug, d).catch(e => {
        console.warn('[programs] prefetch failed for day', d, e?.message)
      })
    })
  }
}

export function invalidateWorkoutDayCache(programSlug = null) {
  if (programSlug) {
    cacheInvalidate(`workout-day:`)
  } else {
    cacheInvalidate('workout-day:')
  }
}

/**
 * Завершить тренировку — атомарная RPC.
 *
 * RPC api_finish_workout теперь возвращает дополнительное поле
 * new_badge_rank_index. Если значок выдан — эмитим BADGE_EARNED, и
 * App.jsx покажет модалку сразу (поверх главной куда ведёт навигация).
 */
export async function finishWorkout(programSlug, day, exerciseIds, reward = 150) {
  console.log('[programs] finishWorkout:', { programSlug, day, exerciseIds, reward })

  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] finishWorkout без авторизации')
    return null
  }

  const program = getProgramBySlug(programSlug)
  if (!program) {
    console.warn('[programs] finishWorkout: unknown slug', programSlug)
    return null
  }
  const dbId = program.dbId

  const { data, error } = await supabase.rpc('api_finish_workout', {
    p_user_id: user.id,
    p_program_id: dbId,
    p_day: day,
    p_exercise_ids: exerciseIds,
    p_reward: reward
  })

  if (error) {
    console.error('[programs] api_finish_workout ERROR:', error)
    return null
  }

  const result = data?.[0]
  if (!result) {
    console.warn('[programs] no result from api_finish_workout')
    return null
  }

  console.log('[programs] workout finished:', result)

  setCurrentUser({
    ...user,
    total_muscles: result.new_total_muscles,
    weekly_streak: result.new_weekly_streak,
    weekly_streak_week: getCurrentWeekKey()
  })

  cacheInvalidate('workout-day:')
  cacheInvalidate(`muscle-history:${user.id}`)
  cacheInvalidate(`leaderboard-friends:${user.id}`)
  cacheInvalidate(`leaderboard-league:${user.id}`)
  cacheInvalidate(`my-friend-place:${user.id}`)

  emit(EVENTS.USER_CHANGED, getCurrentUser())

  // Новый значок лиги выдан прямо сейчас → шлём событие.
  // App.jsx подхватит и покажет модалку поверх главной (куда уже
  // ведёт навигация после успешного завершения).
  if (result.new_badge_rank_index !== null && result.new_badge_rank_index !== undefined) {
    console.log('[programs] new badge earned via workout, rank_index =', result.new_badge_rank_index)
    emit(EVENTS.BADGE_EARNED, { rank_index: result.new_badge_rank_index })
  }

  return {
    workoutId: result.workout_id,
    newTotalMuscles: result.new_total_muscles,
    newWeeklyStreak: result.new_weekly_streak,
    alreadyCompletedToday: result.already_completed_today || false
  }
}