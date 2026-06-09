/**
 * Заметки к упражнениям. Одна короткая заметка на упражнение (user + exercise_id).
 *
 * Хранятся в Supabase (таблица user_exercise_notes).
 * Работают ТОЛЬКО онлайн — заметку редактируют редко, офлайн-очередь тут лишняя.
 * Без сети saveExerciseNote вернёт false → UI покажет "не сохранилось".
 *
 * Лёгкий кеш в памяти (cache.js), чтобы при повторном открытии меню заметка
 * появлялась мгновенно без мигания.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { cacheGet, cacheSet, TTL } from './cache'
import { isOnline } from './network-status'

export const NOTE_MAX_LENGTH = 280

function noteCacheKey(userId, exerciseId) {
  return `note:${userId}:${exerciseId}`
}

/**
 * Получить заметку упражнения. Возвращает строку или '' если нет.
 */
export async function getExerciseNote(exerciseId) {
  const user = getCurrentUser()
  if (!user || !exerciseId) return ''

  const key = noteCacheKey(user.id, exerciseId)
  const cached = cacheGet(key)
  if (cached !== null && cached !== undefined) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_user_note', {
      p_user_id: user.id,
      p_exercise_id: exerciseId
    })
    if (error) {
      console.warn('[notes] getExerciseNote error:', error)
      return ''
    }
    const note = data || ''
    cacheSet(key, note, TTL.MEDIUM)
    return note
  } catch (e) {
    console.warn('[notes] getExerciseNote exception:', e?.message)
    return ''
  }
}

/**
 * Сохранить заметку. Пустой текст → удаление.
 * Возвращает true при успехе. Без сети — false (UI покажет ошибку).
 */
export async function saveExerciseNote(exerciseId, note) {
  const user = getCurrentUser()
  if (!user || !exerciseId) return false

  if (!isOnline()) {
    console.warn('[notes] saveExerciseNote: нет сети')
    return false
  }

  const trimmed = (note || '').trim().slice(0, NOTE_MAX_LENGTH)

  try {
    const { error } = await supabase.rpc('api_save_user_note', {
      p_user_id: user.id,
      p_exercise_id: exerciseId,
      p_note: trimmed
    })
    if (error) {
      console.error('[notes] saveExerciseNote error:', error)
      return false
    }
    // Обновляем кеш сразу — при следующем открытии меню заметка свежая
    cacheSet(noteCacheKey(user.id, exerciseId), trimmed, TTL.MEDIUM)
    return true
  } catch (e) {
    console.error('[notes] saveExerciseNote exception:', e?.message)
    return false
  }
}