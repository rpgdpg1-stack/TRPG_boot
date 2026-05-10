/**
 * Работа с программами тренировок и их упражнениями.
 *
 * Д1-fix4: ВСЕ запросы через RPC функции с SECURITY DEFINER.
 * Это работает по той же схеме что и add_muscles/upsert_user — обходит RLS,
 * выполняется от имени postgres. Так же как мускулы у нас уже работают.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'

/**
 * Получить упражнения для дня тренировки через 4 RPC вызова.
 */
export async function getWorkoutDay(programId, day) {
  console.log('[programs] getWorkoutDay called with', programId, day)
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] no user, returning []')
    return []
  }

  // 1. Слоты программы
  const { data: slotsRaw, error: slotsErr } = await supabase.rpc('api_get_program_day', {
    p_program_id: programId,
    p_day: day
  })

  if (slotsErr) {
    console.error('[programs] api_get_program_day error:', slotsErr)
    return []
  }
  console.log('[programs] got', (slotsRaw || []).length, 'slots from program_days')

  if (!slotsRaw || !slotsRaw.length) return []

  // 2. Свапы юзера
  const { data: swaps, error: swapsErr } = await supabase.rpc('api_get_user_swaps', {
    p_user_id: user.id,
    p_program_id: programId,
    p_day: day
  })
  if (swapsErr) console.warn('[programs] swaps error:', swapsErr)

  const swapsByOrder = {}
  for (const s of swaps || []) swapsByOrder[s.order_num] = s.exercise_id

  // 3. Все упражнения
  const { data: exercises, error: exErr } = await supabase.rpc('api_get_all_exercises')

  if (exErr) {
    console.error('[programs] api_get_all_exercises error:', exErr)
    return []
  }
  console.log('[programs] got', (exercises || []).length, 'exercises total')

  const exById = {}
  for (const e of exercises || []) exById[e.id] = e

  // 4. Веса юзера
  const { data: weights, error: wErr } = await supabase.rpc('api_get_user_weights', {
    p_user_id: user.id
  })
  if (wErr) console.warn('[programs] weights error:', wErr)

  const weightsByEx = {}
  for (const w of weights || []) weightsByEx[w.exercise_id] = w.weight_kg

  // 5. Собираем результат
  const result = slotsRaw.map(slot => {
    let exerciseId = swapsByOrder[slot.order_num]
    let isSwapped = !!exerciseId

    if (!exerciseId) {
      const candidates = (exercises || []).filter(
        e => e.sub_group === slot.sub_group && e.type === slot.type
      )
      exerciseId = candidates[0]?.id || null
    }

    const ex = exerciseId ? exById[exerciseId] : null

    return {
      order_num: slot.order_num,
      muscle_group: slot.muscle_group,
      sub_group: slot.sub_group,
      type: slot.type,
      exercise_id: exerciseId,
      exercise_name: ex?.name || '(упражнение не найдено)',
      meta_info: ex?.meta_info || null,
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
 * Получить упражнения по подгруппе+типу — для экрана замены.
 * Используем общий список и фильтруем на клиенте.
 */
export async function getExercisesForSubgroup(subGroup, type) {
  const { data, error } = await supabase.rpc('api_get_all_exercises')

  if (error) {
    console.error('[programs] getExercisesForSubgroup error:', error)
    return []
  }

  return (data || []).filter(e => e.sub_group === subGroup && e.type === type)
}

/**
 * Сохранить замену упражнения.
 */
export async function saveExerciseSwap(programId, day, orderNum, exerciseId) {
  const user = getCurrentUser()
  if (!user) return false

  const { error } = await supabase.rpc('api_save_user_swap', {
    p_user_id: user.id,
    p_program_id: programId,
    p_day: day,
    p_order_num: orderNum,
    p_exercise_id: exerciseId
  })

  if (error) {
    console.error('[programs] saveExerciseSwap error:', error)
    return false
  }
  return true
}

/**
 * Сохранить вес упражнения.
 */
export async function saveExerciseWeight(exerciseId, weightKg) {
  const user = getCurrentUser()
  if (!user) return false

  const { error } = await supabase.rpc('api_save_user_weight', {
    p_user_id: user.id,
    p_exercise_id: exerciseId,
    p_weight_kg: weightKg
  })

  if (error) {
    console.error('[programs] saveExerciseWeight error:', error)
    return false
  }
  return true
}

/**
 * Получить полную информацию об упражнении.
 * Используем общий список (через RPC) и фильтруем.
 */
export async function getExerciseById(exerciseId) {
  const { data, error } = await supabase.rpc('api_get_all_exercises')

  if (error) {
    console.error('[programs] getExerciseById error:', error)
    return null
  }

  return (data || []).find(e => e.id === exerciseId) || null
}

/**
 * Названия групп мышц на русском.
 */
export const MUSCLE_GROUP_LABELS = {
  back: 'СПИНА',
  chest: 'ГРУДЬ',
  legs: 'НОГИ',
  shoulders: 'ПЛЕЧИ',
  arms: 'РУКИ',
  abs: 'ПРЕСС',
  forearms: 'ПРЕДПЛЕЧЬЯ',
  neck: 'ШЕЯ',
  warmup: 'РАЗМИНКА'
}
