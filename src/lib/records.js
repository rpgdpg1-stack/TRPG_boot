/**
 * **Рекорды** — по одному лучшему достижению на вид активности.
 *
 * Считает сервер (`api_get_personal_records` → общий `srv_user_records`), чтобы
 * не тянуть на клиент все веса и всю историю:
 *   • best_month — месяц с наибольшим числом тренировок (месяц, счёт, минуты);
 *   • strength   — самый большой рабочий вес среди ВЕСОВЫХ упражнений
 *                  (+ название, миниатюра, группа/подгруппа для тега);
 *   • swim       — самая длинная дистанция за ОДНУ завершённую тренировку.
 * Кардио/растяжка пока без рекордов — добавим, когда появятся сами программы.
 *
 * Тем же сборщиком считаются рекорды ДРУГА (внутри `api_get_user_public_profile`),
 * поэтому формат один и рисует их один компонент `PersonalRecords`.
 *
 * Результат кешируется в памяти + localStorage: экран статистики открывается
 * мгновенно, свежие данные догоняют.
 */
import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { localGet, localSet } from '../utils/storage'

const KEY = 'personal-records'
const EMPTY = { best_month: null, strength: null, swim: null }
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

/**
 * Свежие рекорды с сервера:
 * `{ best_month: {month, count, minutes} | null, strength: {...} | null, swim: {...} | null }`.
 * Миниатюру и группу/подгруппу для тега RPC отдаёт сама — добирать упражнение
 * отдельным запросом больше не нужно.
 */
export async function getRecords() {
  if (!getCurrentUser()) return getRecordsSync() || EMPTY
  try {
    const { data, error } = await supabase.rpc('api_get_personal_records')
    if (error) { console.error('[records] error:', error); return getRecordsSync() || EMPTY }
    const value = data || EMPTY
    cache = value
    try { localSet(KEY, JSON.stringify(value)) } catch { /* ignore */ }
    return value
  } catch (e) {
    console.error('[records] exception:', e)
    return getRecordsSync() || EMPTY
  }
}
