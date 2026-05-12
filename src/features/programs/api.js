/**
 * Логика загрузки и завершения тренировки.
 *
 * Правка #3: API наружу принимает slug ("split"), внутри сама конвертирует
 * в dbId ("prog_001") для запросов к БД. URL и компоненты работают со slug.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser, setCurrentUser } from '../../lib/auth'
import { EVENTS, emit } from '../../lib/events'
import { getCurrentWeekKey } from '../../utils/dates'
import { getProgramBySlug, getProgramDaySlots } from './registry'

/**
 * Получить полный день тренировки: 10 слотов с упражнениями, весами, заменами.
 *
 * @param {string} programSlug - slug программы из URL, например 'split'
 * @param {string} day - 'A' | 'B' | 'C'
 * @returns массив слотов с обогащёнными данными для рендера ExerciseCard
 */
export async function getWorkoutDay(programSlug, day) {
  console.log('[programs] getWorkoutDay called with', programSlug, day)
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

  // 1. Слоты программы — из кода (registry)
  const slotsRaw = getProgramDaySlots(programSlug, day)
  console.log('[programs] got', slotsRaw.length, 'slots from code')
  if (!slotsRaw.length) return []

  // 2. Свапы юзера — запрашиваем по dbId
  let swapsByOrder = {}
  try {
    const { data: swaps, error } = await supabase.rpc('api_get_user_swaps', {
      p_user_id: user.id,
      p_program_id: dbId,
      p_day: day
    })
    if (!error && swaps) {
      for (const s of swaps) swapsByOrder[s.order_num] = s.exercise_id
    }
  } catch (e) {
    console.warn('[programs] swaps fetch failed (continuing):', e?.message)
  }

  // 3. Все упражнения — RPC, фоллбэк на прямой SELECT
  let exercises = []
  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data?.length) {
      exercises = data
      console.log('[programs] got', exercises.length, 'exercises via RPC')
    }
  } catch (e) {}

  if (!exercises.length) {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, sub_group, type, meta_info, preview_url, video_url, priority')
        .order('priority', { ascending: true })
      if (!error && data?.length) {
        exercises = data
        console.log('[programs] got', exercises.length, 'exercises via direct SELECT')
      }
    } catch (e) {}
  }

  const exById = {}
  for (const e of exercises) exById[e.id] = e

  // 4. Веса юзера
  let weightsByEx = {}
  try {
    const { data: weights, error } = await supabase.rpc('api_get_user_weights', {
      p_user_id: user.id
    })
    if (!error && weights) {
      for (const w of weights) weightsByEx[w.exercise_id] = w.weight_kg
    }
  } catch (e) {
    console.warn('[programs] weights fetch failed (continuing):', e?.message)
  }

  // 5. Собираем результат
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

  console.log('[programs] returning', result.length, 'enriched slots')
  return result
}

/**
 * Завершить тренировку — атомарная RPC функция.
 * Создаёт workouts, exercise_sets, начисляет мускулы и обновляет стрик.
 * Защита от повторного начисления в один день — на стороне БД.
 *
 * @param {string} programSlug - slug программы из URL
 * @param {string} day
 * @param {string[]} exerciseIds
 * @param {number} reward
 */
export async function finishWorkout(programSlug, day, exerciseIds, reward = 150) {
  console.log('[programs] finishWorkout called:', { programSlug, day, exerciseIds, reward })

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

  console.log('[programs] calling api_finish_workout RPC for user', user.id, 'dbId:', dbId)

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

  console.log('[programs] api_finish_workout SUCCESS, raw data:', data)

  const result = data?.[0]
  if (!result) {
    console.warn('[programs] no result from api_finish_workout')
    return null
  }

  console.log('[programs] workout finished:', result)

  // Обновляем кеш юзера локально (БД уже обновлена)
  setCurrentUser({
    ...user,
    total_muscles: result.new_total_muscles,
    weekly_streak: result.new_weekly_streak,
    weekly_streak_week: getCurrentWeekKey()
  })

  // Одно событие вместо двух (правка #5)
  emit(EVENTS.USER_CHANGED, getCurrentUser())

  return {
    workoutId: result.workout_id,
    newTotalMuscles: result.new_total_muscles,
    newWeeklyStreak: result.new_weekly_streak,
    alreadyCompletedToday: result.already_completed_today || false
  }
}