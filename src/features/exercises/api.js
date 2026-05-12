/**
 * Работа с упражнениями: альтернативы, веса, свапы.
 *
 * Раньше всё это лежало в lib/programs.js вперемешку с программами.
 * Теперь упражнения — отдельный домен.
 *
 * RPC функции в Supabase:
 *   - api_get_all_exercises      → все упражнения
 *   - api_get_user_weights       → веса пользователя
 *   - api_save_user_weight       → сохранить вес
 *   - api_get_user_swaps         → свапы пользователя
 *   - api_save_user_swap         → сохранить свап
 * У каждой есть фоллбэк на прямой SELECT/UPSERT — если RPC недоступна.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/auth'

/**
 * Получить все упражнения для конкретной подгруппы и типа.
 * Используется на экране замены упражнения.
 */
export async function getExercisesForSubgroup(subGroup, type) {
  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data) {
      return data.filter(e => e.sub_group === subGroup && e.type === type)
    }
  } catch (e) {}

  // Фоллбэк: прямой SELECT если RPC не отработала
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, meta_info, preview_url, video_url, priority')
    .eq('sub_group', subGroup)
    .eq('type', type)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[exercises] getExercisesForSubgroup error:', error)
    return []
  }
  return data || []
}

/**
 * Получить полную инфу об упражнении по его id.
 * Используется на экране замены чтобы показать текущее упражнение сверху.
 */
export async function getExerciseById(exerciseId) {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .single()

  if (error) {
    console.error('[exercises] getExerciseById error:', error)
    return null
  }
  return data
}

/**
 * Сохранить замену упражнения для конкретного слота программы.
 * Если RPC не отработала — фоллбэк через upsert.
 */
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
    console.error('[exercises] saveExerciseSwap error:', error)
    return false
  }
  return true
}

/**
 * Сохранить рабочий вес пользователя для упражнения.
 * Вес общий для всех программ — это вес именно для exercise_id.
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
    console.error('[exercises] saveExerciseWeight error:', error)
    return false
  }
  return true
}