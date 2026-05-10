/**
 * Работа с программами тренировок и их упражнениями.
 *
 * Д1-final: Структура программы — из захардкоженного файла splitProgram.js.
 * Упражнения и веса — из Supabase через RPC (которые точно работают,
 * как мускулы).
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { getProgramDaySlots } from '../data/splitProgram'

/**
 * Получить упражнения для дня тренировки.
 */
export async function getWorkoutDay(programId, day) {
  console.log('[programs] getWorkoutDay called with', programId, day)
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] no user, returning []')
    return []
  }

  // 1. Слоты программы — БЕРЁМ ИЗ КОДА, не из БД
  const slotsRaw = getProgramDaySlots(programId, day)
  console.log('[programs] got', slotsRaw.length, 'slots from code')
  if (!slotsRaw.length) return []

  // 2. Свапы юзера — пробуем из Supabase, если не получится — пусто
  let swapsByOrder = {}
  try {
    const { data: swaps, error: swapsErr } = await supabase.rpc('api_get_user_swaps', {
      p_user_id: user.id,
      p_program_id: programId,
      p_day: day
    })
    if (!swapsErr && swaps) {
      for (const s of swaps) swapsByOrder[s.order_num] = s.exercise_id
    } else if (swapsErr) {
      console.warn('[programs] swaps error (continuing):', swapsErr.message)
    }
  } catch (e) {
    console.warn('[programs] swaps fetch failed (continuing):', e?.message)
  }

  // 3. Все упражнения — пробуем разными способами
  let exercises = []

  // Способ А: через RPC api_get_all_exercises (если функция создана)
  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data && data.length) {
      exercises = data
      console.log('[programs] got', exercises.length, 'exercises via RPC')
    } else if (error) {
      console.warn('[programs] api_get_all_exercises failed:', error.message)
    }
  } catch (e) {
    console.warn('[programs] api_get_all_exercises threw:', e?.message)
  }

  // Способ Б: прямой SELECT (на случай если RPC не создан)
  if (!exercises.length) {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, sub_group, type, meta_info, preview_url, video_url, priority')
        .order('priority', { ascending: true })
      if (!error && data && data.length) {
        exercises = data
        console.log('[programs] got', exercises.length, 'exercises via direct SELECT')
      }
    } catch (e) {
      console.warn('[programs] direct SELECT threw:', e?.message)
    }
  }

  if (!exercises.length) {
    console.warn('[programs] WARNING: could not load exercises from DB, using placeholders')
  }

  const exById = {}
  for (const e of exercises) exById[e.id] = e

  // 4. Веса юзера — пробуем из Supabase, если не получится — пусто
  let weightsByEx = {}
  try {
    const { data: weights, error: wErr } = await supabase.rpc('api_get_user_weights', {
      p_user_id: user.id
    })
    if (!wErr && weights) {
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
      // Дефолтное упражнение для подгруппы+типа
      const candidates = exercises.filter(
        e => e.sub_group === slot.sub_group && e.type === slot.type
      )
      exerciseId = candidates[0]?.id || null
    }

    const ex = exerciseId ? exById[exerciseId] : null

    // Если упражнение не нашли в БД — показываем имя подгруппы как заглушку
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
 * Получить упражнения по подгруппе+типу — для экрана замены.
 */
export async function getExercisesForSubgroup(subGroup, type) {
  // Пробуем через RPC
  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data) {
      return data.filter(e => e.sub_group === subGroup && e.type === type)
    }
  } catch (e) {}

  // Фоллбэк: прямой SELECT
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

/**
 * Сохранить замену упражнения. Пробуем RPC, потом upsert.
 */
export async function saveExerciseSwap(programId, day, orderNum, exerciseId) {
  const user = getCurrentUser()
  if (!user) return false

  // Пробуем через RPC
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

  // Фоллбэк: прямой upsert
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

/**
 * Сохранить вес упражнения.
 */
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

/**
 * Получить полную информацию об упражнении.
 */
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

/**
 * Названия групп мышц на русском.
 */
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
