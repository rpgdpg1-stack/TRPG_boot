/**
 * Работа с программами тренировок и их упражнениями.
 *
 * Финальная версия Д1: структура программы из splitProgram.js,
 * упражнения и веса — из Supabase через RPC + фоллбэки.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { getProgramDaySlots } from '../data/splitProgram'

export async function getWorkoutDay(programId, day) {
  console.log('[programs] getWorkoutDay called with', programId, day)
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] no user, returning []')
    return []
  }

  // 1. Слоты программы — из кода
  const slotsRaw = getProgramDaySlots(programId, day)
  console.log('[programs] got', slotsRaw.length, 'slots from code')
  if (!slotsRaw.length) return []

  // 2. Свапы юзера
  let swapsByOrder = {}
  try {
    const { data: swaps, error } = await supabase.rpc('api_get_user_swaps', {
      p_user_id: user.id,
      p_program_id: programId,
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
    // Приоритет: свап юзера > default из кода > первое подходящее по фильтру
    let exerciseId = swapsByOrder[slot.order_num]
    let isSwapped = !!exerciseId

    if (!exerciseId) {
      exerciseId = slot.default_exercise_id || null
    }

    // Если default_exercise_id не задан или такого упражнения нет в БД —
    // фоллбэк на первое подходящее по подгруппе+типу
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

export async function getExercisesForSubgroup(subGroup, type) {
  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data) {
      return data.filter(e => e.sub_group === subGroup && e.type === type)
    }
  } catch (e) {}

  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, meta_info, preview_url, video_url, priority')
    .eq('sub_group', subGroup)
    .eq('type', type)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[programs] getExercisesForSubgroup error:', error)
    return []
  }
  return data || []
}

export async function saveExerciseSwap(programId, day, orderNum, exerciseId) {
  const user = getCurrentUser()
  if (!user) return false

  try {
    const { error } = await supabase.rpc('api_save_user_swap', {
      p_user_id: user.id,
      p_program_id: programId,
      p_day: day,
      p_order_num: orderNum,
      p_exercise_id: exerciseId
    })
    if (!error) return true
  } catch (e) {}

  const { error } = await supabase.from('user_exercise_swaps').upsert({
    user_id: user.id,
    program_id: programId,
    day,
    order_num: orderNum,
    exercise_id: exerciseId,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,program_id,day,order_num' })

  if (error) {
    console.error('[programs] saveExerciseSwap error:', error)
    return false
  }
  return true
}

export async function saveExerciseWeight(exerciseId, weightKg) {
  const user = getCurrentUser()
  if (!user) return false

  try {
    const { error } = await supabase.rpc('api_save_user_weight', {
      p_user_id: user.id,
      p_exercise_id: exerciseId,
      p_weight_kg: weightKg
    })
    if (!error) return true
  } catch (e) {}

  const { error } = await supabase.from('user_exercise_weights').upsert({
    user_id: user.id,
    exercise_id: exerciseId,
    weight_kg: weightKg,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,exercise_id' })

  if (error) {
    console.error('[programs] saveExerciseWeight error:', error)
    return false
  }
  return true
}

export async function getExerciseById(exerciseId) {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .single()

  if (error) {
    console.error('[programs] getExerciseById error:', error)
    return null
  }
  return data
}

export const MUSCLE_GROUP_LABELS = {
  back: 'СПИНА',
  chest: 'ГРУДЬ',
  legs: 'НОГИ',
  glutes: 'ЯГОДИЦЫ',
  shoulders: 'ПЛЕЧИ',
  arms: 'РУКИ',
  abs: 'ПРЕСС',
  forearms: 'ПРЕДПЛЕЧЬЯ',
  neck: 'ШЕЯ',
  warmup: 'РАЗМИНКА'
}
