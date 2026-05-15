/**
 * Работа с упражнениями: альтернативы, веса, свапы.
 *
 * ОБНОВЛЕНИЕ: при сохранении свапа или веса инвалидируем соответствующие
 * куски кеша, чтобы следующее открытие дня показало актуальные данные.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/auth'
import { getProgramBySlug } from '../programs/registry'
import { cacheInvalidate } from '../../lib/cache'

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
    console.error('[exercises] getExercisesForSubgroup error:', error)
    return []
  }
  return data || []
}

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
 * Сохранить замену упражнения. После успеха инвалидирует кеши свапов и дней.
 */
export async function saveExerciseSwap(programSlug, day, orderNum, exerciseId) {
  const user = getCurrentUser()
  if (!user) {
    console.warn('[exercises] saveExerciseSwap: no user')
    return false
  }

  const program = getProgramBySlug(programSlug)
  if (!program) {
    console.error('[exercises] saveExerciseSwap: unknown program slug:', programSlug)
    return false
  }
  const dbId = program.dbId

  console.log('[exercises] saveExerciseSwap:', { dbId, day, orderNum, exerciseId, userId: user.id })

  let success = false

  try {
    const { error } = await supabase.rpc('api_save_user_swap', {
      p_user_id: user.id,
      p_program_id: dbId,
      p_day: day,
      p_order_num: orderNum,
      p_exercise_id: exerciseId
    })
    if (!error) {
      success = true
    } else {
      console.warn('[exercises] saveExerciseSwap RPC error:', error)
    }
  } catch (e) {
    console.warn('[exercises] saveExerciseSwap RPC exception:', e)
  }

  if (!success) {
    const { error } = await supabase.from('user_exercise_swaps').upsert({
      user_id: user.id,
      program_id: dbId,
      day,
      order_num: orderNum,
      exercise_id: exerciseId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,program_id,day,order_num' })

    if (error) {
      console.error('[exercises] saveExerciseSwap upsert error:', error)
      return false
    }
    success = true
  }

  // Инвалидируем кеши: и свапы, и собранные дни
  if (success) {
    cacheInvalidate(`user-swaps:${user.id}:${dbId}:`)
    cacheInvalidate(`workout-day:${user.id}:${programSlug}:`)
  }

  return success
}

/**
 * Сохранить вес. Инвалидируем кеш весов и кеш всех дней (вес влияет на отображение).
 */
export async function saveExerciseWeight(exerciseId, weightKg) {
  const user = getCurrentUser()
  if (!user) return false

  let success = false

  try {
    const { error } = await supabase.rpc('api_save_user_weight', {
      p_user_id: user.id,
      p_exercise_id: exerciseId,
      p_weight_kg: weightKg
    })
    if (!error) success = true
  } catch (e) {}

  if (!success) {
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
    success = true
  }

  if (success) {
    cacheInvalidate(`user-weights:${user.id}`)
    cacheInvalidate(`workout-day:${user.id}:`)
  }

  return success
}