/**
 * Заметки к упражнениям. Одна короткая заметка на упражнение (user + exercise_id).
 *
 * Хранятся в Supabase (таблица user_exercise_notes) и работают ОФФЛАЙН — по тому
 * же принципу, что рабочий вес: без сети правка уходит в offline-queue и сразу
 * же ложится в локальный кеш, поэтому UI показывает её как сохранённую. Когда
 * сеть вернётся, sync-engine отправит операцию 'note'.
 *
 * Кеш — ПЕРСИСТЕНТНЫЙ (localStorage): заметки переживают перезапуск приложения
 * и показываются мгновенно, без повторной загрузки с нуля. В памяти держим тот
 * же слепок, чтобы синхронное чтение не дёргало localStorage на каждый рендер.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { cacheGet, cacheSet, cacheDelete, TTL } from './cache'
import { pcacheGet, pcacheSet } from './persistent-cache'
import { isOnline } from './network-status'
import { enqueue } from './offline-queue'

export const NOTE_MAX_LENGTH = 280

// Заметки живут долго и меняются редко — храним неделю.
const NOTE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function noteCacheKey(userId, exerciseId) {
  return `note:${userId}:${exerciseId}`
}

/** Ключ дедупликации: повторная правка той же заметки схлопывает операцию в очереди. */
function noteDedupKey(exerciseId) {
  return `note:${exerciseId}`
}

/** Записать заметку в оба кеша разом (память — скорость, диск — переживание перезапуска). */
function putCache(key, note) {
  cacheSet(key, note, TTL.MEDIUM)
  pcacheSet(key, note, NOTE_TTL_MS)
}

/**
 * Синхронно прочитать заметку из кэша. Возвращает строку (включая '') если в
 * кэше есть, либо null если ещё не загружали (неизвестно).
 *
 * Сначала память, затем localStorage — поэтому после перезапуска приложения
 * заметка появляется сразу, а не после ответа сервера.
 */
export function getExerciseNoteCached(exerciseId) {
  const user = getCurrentUser()
  if (!user || !exerciseId) return null
  const key = noteCacheKey(user.id, exerciseId)

  const mem = cacheGet(key)
  if (mem !== null && mem !== undefined) return mem

  const disk = pcacheGet(key)
  if (disk !== null && disk !== undefined) {
    cacheSet(key, disk, TTL.MEDIUM)   // поднимаем в память
    return disk
  }
  return null
}

/**
 * Получить заметку упражнения. Возвращает строку или '' если нет.
 * Без сети отдаём то, что в кеше — запрос не делаем.
 */
export async function getExerciseNote(exerciseId) {
  const user = getCurrentUser()
  if (!user || !exerciseId) return ''

  const key = noteCacheKey(user.id, exerciseId)
  const cached = getExerciseNoteCached(exerciseId)
  if (cached !== null) return cached

  if (!isOnline()) return ''

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
    putCache(key, note)
    return note
  } catch (e) {
    console.warn('[notes] getExerciseNote exception:', e?.message)
    return ''
  }
}

/**
 * Сохранить заметку. Пустой текст → удаление.
 *
 * ОФФЛАЙН → в очередь + в кеш, возвращаем true (правка не теряется).
 * ОНЛАЙН → в Supabase; если запрос упал (сеть отвалилась в процессе) —
 * тоже уходит в очередь, а не пропадает.
 */
export async function saveExerciseNote(exerciseId, note) {
  const user = getCurrentUser()
  if (!user || !exerciseId) return false

  const trimmed = (note || '').trim().slice(0, NOTE_MAX_LENGTH)
  const key = noteCacheKey(user.id, exerciseId)

  const queueIt = () => {
    enqueue('note', { exercise_id: exerciseId, note: trimmed }, noteDedupKey(exerciseId))
    putCache(key, trimmed)
    return true
  }

  if (!isOnline()) return queueIt()

  try {
    const { error } = await supabase.rpc('api_save_user_note', {
      p_user_id: user.id,
      p_exercise_id: exerciseId,
      p_note: trimmed
    })
    if (error) {
      console.error('[notes] saveExerciseNote error:', error)
      return queueIt()
    }
    putCache(key, trimmed)
    return true
  } catch (e) {
    console.error('[notes] saveExerciseNote exception:', e?.message)
    return queueIt()
  }
}

/** Сбросить кеш заметки в памяти — например после синка, чтобы перечитать серверную версию. */
export function invalidateNoteCache(userId, exerciseId) {
  cacheDelete(noteCacheKey(userId, exerciseId))
}
