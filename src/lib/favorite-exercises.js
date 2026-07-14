/**
 * Любимые упражнения — до 3 штук. Добавляются сердечком в мини-модалке дня
 * тренировки; на странице «Любимые упражнения» показываются те же карточки.
 * Хранятся в БД (user_favorite_exercises), рабочий вес — из user_exercise_weights.
 *
 * Кэш id-множества в памяти модуля: сердечко на карточке дня знает своё состояние
 * синхронно, без запроса. Событие FAVORITES_CHANGED уведомляет UI об изменении.
 */
import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { EVENTS, emit } from './events'
import { localGet, localSet } from '../utils/storage'

export const FAVORITE_LIMIT = 3
const LIST_KEY = 'fav-exercises-list'

let idsCache = null   // Set<exercise_id> | null (ещё не грузили)
let listCache = null  // последний список любимых (в памяти)

function setFromList(list) {
  const arr = list || []
  listCache = arr
  idsCache = new Set(arr.map(f => f.exercise_id))
  try { localSet(LIST_KEY, JSON.stringify(arr)) } catch { /* ignore */ }
}

/**
 * СИНХРОННО последний список любимых — для мгновенного рендера без мигания
 * (память → localStorage). null = ещё ни разу не грузили (показать скелетон).
 */
export function getFavoritesSync() {
  if (listCache !== null) return listCache
  const raw = localGet(LIST_KEY)
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) { listCache = arr; idsCache = new Set(arr.map(f => f.exercise_id)); return arr }
  } catch { /* ignore */ }
  return null
}

/** Синхронно: множество id любимых (или null, если ещё не грузили). */
export function getFavoriteIdsCached() {
  return idsCache
}

export function isFavoriteCached(exerciseId) {
  return idsCache ? idsCache.has(exerciseId) : false
}

export function favoritesCountCached() {
  return idsCache ? idsCache.size : 0
}

/** Полный список любимых с данными упражнения и весом. Обновляет кэш id. */
export async function getFavoriteExercises() {
  const user = getCurrentUser()
  if (!user) return []
  try {
    const { data, error } = await supabase.rpc('api_get_favorite_exercises')
    if (error) { console.error('[fav-ex] get error:', error); return listCache || [] }
    const list = data || []
    setFromList(list)
    return list
  } catch (e) {
    console.error('[fav-ex] get exception:', e)
    return []
  }
}

/**
 * Добавить в любимые. Возвращает { success, error }:
 *   error === 'limit' — уже 3 любимых.
 * Оптимистично обновляет кэш и шлёт FAVORITES_CHANGED.
 */
export async function addFavorite(exerciseId) {
  if (!exerciseId) return { success: false }
  try {
    const { data, error } = await supabase.rpc('api_add_favorite_exercise', { p_exercise_id: exerciseId })
    if (error) { console.error('[fav-ex] add error:', error); return { success: false, error: 'rpc' } }
    if (data?.success) {
      if (idsCache) idsCache.add(exerciseId)
      emit(EVENTS.FAVORITES_CHANGED)
      return { success: true }
    }
    return { success: false, error: data?.error || 'unknown' }
  } catch (e) {
    console.error('[fav-ex] add exception:', e)
    return { success: false, error: 'exception' }
  }
}

/** Убрать из любимых. Оптимистично обновляет кэш и шлёт FAVORITES_CHANGED. */
export async function removeFavorite(exerciseId) {
  if (!exerciseId) return false
  try {
    const { error } = await supabase.rpc('api_remove_favorite_exercise', { p_exercise_id: exerciseId })
    if (error) { console.error('[fav-ex] remove error:', error); return false }
    if (idsCache) idsCache.delete(exerciseId)
    emit(EVENTS.FAVORITES_CHANGED)
    return true
  } catch (e) {
    console.error('[fav-ex] remove exception:', e)
    return false
  }
}

/**
 * Значение рядом с названием: "100 кг" для весовых, просто "10" для упражнений
 * «на разы» (countsReps — без единиц). null если не задано.
 */
export function formatFavoriteValue(weightKg, countsReps = false) {
  if (weightKg == null) return null
  const n = Number(weightKg)
  if (!Number.isFinite(n) || n <= 0) return null
  const num = n % 1 === 0 ? n : n.toFixed(1)
  return countsReps ? `${num}` : `${num} кг`
}
