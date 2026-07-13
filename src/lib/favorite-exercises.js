/**
 * Любимые упражнения — до 3 слотов. Хранятся в БД (user_favorite_exercises),
 * рабочий вес подтягивается из user_exercise_weights. Всё через RPC.
 */
import { supabase } from './supabase'
import { getCurrentUser } from './auth'

export const FAVORITE_SLOTS = 3

/** Свои слоты: [{ slot, exercise_id, name, muscle_icon, weight_kg }]. */
export async function getFavoriteExercises() {
  const user = getCurrentUser()
  if (!user) return []
  try {
    const { data, error } = await supabase.rpc('api_get_favorite_exercises')
    if (error) { console.error('[fav-ex] get error:', error); return [] }
    return data || []
  } catch (e) {
    console.error('[fav-ex] get exception:', e)
    return []
  }
}

/** Поставить упражнение в слот (1..3). */
export async function setFavoriteExercise(slot, exerciseId) {
  try {
    const { error } = await supabase.rpc('api_set_favorite_exercise', { p_slot: slot, p_exercise_id: exerciseId })
    if (error) { console.error('[fav-ex] set error:', error); return false }
    return true
  } catch (e) {
    console.error('[fav-ex] set exception:', e)
    return false
  }
}

/** Очистить слот. */
export async function clearFavoriteExercise(slot) {
  try {
    const { error } = await supabase.rpc('api_clear_favorite_exercise', { p_slot: slot })
    if (error) { console.error('[fav-ex] clear error:', error); return false }
    return true
  } catch (e) {
    console.error('[fav-ex] clear exception:', e)
    return false
  }
}

/** "100 кг" / null — компактный вес для показа рядом с названием. */
export function formatFavoriteValue(weightKg) {
  if (weightKg == null) return null
  const n = Number(weightKg)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${n % 1 === 0 ? n : n.toFixed(1)} кг`
}
