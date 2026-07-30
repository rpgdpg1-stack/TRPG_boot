/**
 * Личные рекорды (экран статистики).
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
    cache = value
    try { localSet(KEY, JSON.stringify(value)) } catch { /* ignore */ }
    return value
  } catch (e) {
    console.error('[records] exception:', e)
    return getRecordsSync() || { strength: null, swim: null }
  }
}
