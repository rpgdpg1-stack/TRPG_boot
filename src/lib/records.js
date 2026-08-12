/**
 * Лучшие результаты (экран статистики) — по одному рекорду на вид активности.
 *
 * Считает сервер (`api_get_personal_records`), чтобы не тянуть на клиент все веса:
 *   • strength — самый большой рабочий вес среди ВЕСОВЫХ упражнений + его название;
 *   • swim     — самая длинная дистанция за ОДНУ завершённую тренировку.
 * Кардио/растяжка пока без рекордов — добавим, когда появятся сами программы.
 *
 * Результат кешируется в памяти + localStorage: экран статистики открывается
 * мгновенно, свежие данные догоняют.
 */
import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { localGet, localSet } from '../utils/storage'
import { getExerciseById } from '../features/exercises/api'

const KEY = 'personal-records'
let cache = null

/** Синхронно последние известные рекорды (или null, если ещё не грузили). */
export function getRecordsSync() {
  if (cache) return cache
  const raw = localGet(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    cache = parsed
    return parsed
  } catch { return null }
}

/** Свежие рекорды с сервера. `{ strength: {name, weight_kg} | null, swim: {distance_m} | null }`. */
export async function getRecords() {
  if (!getCurrentUser()) return getRecordsSync() || { strength: null, swim: null }
  try {
    const { data, error } = await supabase.rpc('api_get_personal_records')
    if (error) { console.error('[records] error:', error); return getRecordsSync() || { strength: null, swim: null } }
    const value = data || { strength: null, swim: null }
    // Превью упражнения RPC отдаёт сама (см. миграцию). Пока новая версия
    // функции не раскатана на прод, добираем картинку отдельным запросом —
    // иначе у рекорда силовой вместо миниатюры висела бы заглушка.
    // Заодно берём группу/подгруппу — под названием рекорда стоит тег
    // «Ноги — Квадрицепс», как на карточках упражнений. RPC их не отдаёт.
    if (value.strength?.exercise_id && (!value.strength.preview_url || !value.strength.muscle_group)) {
      try {
        const ex = await getExerciseById(value.strength.exercise_id)
        if (ex?.preview_url) value.strength.preview_url = ex.preview_url
        if (ex?.muscle_group) value.strength.muscle_group = ex.muscle_group
        if (ex?.sub_group) value.strength.sub_group = ex.sub_group
      } catch { /* не критично — покажем заглушку */ }
    }
    cache = value
    try { localSet(KEY, JSON.stringify(value)) } catch { /* ignore */ }
    return value
  } catch (e) {
    console.error('[records] exception:', e)
    return getRecordsSync() || { strength: null, swim: null }
  }
}
