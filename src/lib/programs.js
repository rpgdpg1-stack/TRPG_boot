import { supabase } from './supabase'
import { getCurrentUser } from './auth'

export async function getWorkoutDay(programId, day) {
  console.log('[programs] getWorkoutDay called with', programId, day)
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] no user!')
    return []
  }
  console.log('[programs] calling RPC with user.id =', user.id)

  const { data, error } = await supabase.rpc('get_workout_day', {
    p_user_id: user.id,
    p_program_id: programId,
    p_day: day
  })

  if (error) {
    console.error('[programs] RPC ERROR:', error)
    console.error('[programs] error details:', JSON.stringify(error))
    return []
  }

  console.log('[programs] RPC success, got', (data || []).length, 'rows. Sample:', data?.[0])
  return data || []
}

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

  const { error } = await supabase
    .from('user_exercise_weights')
    .upsert({
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
  shoulders: 'ПЛЕЧИ',
  arms: 'РУКИ',
  abs: 'ПРЕСС',
  forearms: 'ПРЕДПЛЕЧЬЯ',
  neck: 'ШЕЯ',
  warmup: 'РАЗМИНКА'
}
