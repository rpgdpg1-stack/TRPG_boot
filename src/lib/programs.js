/**
 * Работа с программами тренировок и их упражнениями.
 *
 * Тут крутится логика чтения из Supabase:
 * - getWorkoutDay — получить упражнения для конкретного дня программы у юзера
 * - getExercisesForSubgroup — список упражнений для замены (по подгруппе+типу)
 * - saveExerciseSwap — сохранить замену упражнения в слоте
 * - saveExerciseWeight — сохранить вес юзера для упражнения
 * - getExerciseById — получить детали упражнения (для экрана "инфо")
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'

/**
 * Получить упражнения для дня тренировки.
 * @param {string} programId - например 'prog_001'
 * @param {string} day - 'A' / 'B' / 'C'
 * @returns массив объектов { order_num, muscle_group, sub_group, type, exercise_id, exercise_name, meta_info, preview_url, video_url, is_swapped, user_weight_kg }
 */
export async function getWorkoutDay(programId, day) {
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] getWorkoutDay без авторизации')
    return []
  }

  const { data, error } = await supabase.rpc('get_workout_day', {
    p_user_id: user.id,
    p_program_id: programId,
    p_day: day
  })

  if (error) {
    console.error('[programs] getWorkoutDay error:', error)
    return []
  }

  return data || []
}

/**
 * Получить все упражнения по подгруппе+типу — для экрана замены.
 * Возвращает в порядке priority (дефолтное упражнение будет первым).
 */
export async function getExercisesForSubgroup(subGroup, type) {
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
 * Сохранить замену упражнения в слоте программы.
 * Если запись уже есть — обновляется (upsert).
 */
export async function saveExerciseSwap(programId, day, orderNum, exerciseId) {
  const user = getCurrentUser()
  if (!user) return false

  const { error } = await supabase
    .from('user_exercise_swaps')
    .upsert({
      user_id: user.id,
      program_id: programId,
      day,
      order_num: orderNum,
      exercise_id: exerciseId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,program_id,day,order_num'
    })

  if (error) {
    console.error('[programs] saveExerciseSwap error:', error)
    return false
  }
  return true
}

/**
 * Сохранить рабочий вес юзера для упражнения.
 * Используется в Д3, добавляю заранее.
 */
export async function saveExerciseWeight(exerciseId, weightKg) {
  const user = getCurrentUser()
  if (!user) return false

  const { error } = await supabase
    .from('user_exercise_weights')
    .upsert({
      user_id: user.id,
      exercise_id: exerciseId,
      weight_kg: weightKg,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,exercise_id'
    })

  if (error) {
    console.error('[programs] saveExerciseWeight error:', error)
    return false
  }
  return true
}

/**
 * Получить полную информацию об упражнении — для экрана "Инфо".
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
 * Названия групп мышц на русском — для sticky-заголовков.
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
