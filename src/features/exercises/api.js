/**
 * Работа с упражнениями: альтернативы, веса, свапы.
 *
 * ОФФЛАЙН: при отсутствии сети saveExerciseWeight / saveExerciseSwap пишут
 * операцию в offline-queue и возвращают true (сохранено локально). sync-engine
 * отправит в Supabase когда сеть вернётся. Локальный persistent-cache веса
 * обновляем сразу, чтобы при перезапуске без сети показывался свежий вес.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/auth'
import { getProgramBySlug } from '../programs/registry'
import { cacheInvalidate } from '../../lib/cache'
import { isOnline } from '../../lib/network-status'
import {
  enqueue,
  weightDedupKey,
  swapDedupKey
} from '../../lib/offline-queue'

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
 * Сохранить замену упражнения.
 * ОФФЛАЙН → кладём в очередь, возвращаем true (засинкается позже).
 * ОНЛАЙН → шлём в Supabase, при успехе инвалидируем кеши.
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

  // ОФФЛАЙН: в очередь и выходим. Кеши дней инвалидируем чтобы при
  // повторном открытии дня подтянулся новый свап (он уже в очереди,
  // а отображение свапа фронт берёт из своего состояния).
  if (!isOnline()) {
    enqueue('swap', {
      program_id: dbId,
      day,
      order_num: orderNum,
      exercise_id: exerciseId
    }, swapDedupKey(dbId, day, orderNum))

    cacheInvalidate(`workout-day:${user.id}:${programSlug}:`)
    console.log('[exercises] swap сохранён ОФФЛАЙН в очередь')
    return true
  }

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
 * Сохранить вес.
 * ОФФЛАЙН → кладём в очередь, возвращаем true. ОНЛАЙН → в Supabase.
 */
export async function saveExerciseWeight(exerciseId, weightKg) {
  const user = getCurrentUser()
  if (!user) return false

  // ОФФЛАЙН: в очередь и выходим. Инвалидируем кеш весов и дней чтобы
  // при пересборке дня вес взялся из свежих данных (после синка).
  if (!isOnline()) {
    enqueue('weight', {
      exercise_id: exerciseId,
      weight_kg: weightKg
    }, weightDedupKey(exerciseId))

    cacheInvalidate(`user-weights:${user.id}`)
    cacheInvalidate(`workout-day:${user.id}:`)
    console.log('[exercises] вес сохранён ОФФЛАЙН в очередь:', exerciseId, weightKg)
    return true
  }

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