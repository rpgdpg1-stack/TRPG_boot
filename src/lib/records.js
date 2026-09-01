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
 * мгновенно, свежие данные догоняют. В кеше — СЫРОЙ ответ (обе миниатюры,
 * мужская и женская); нужную выбираем на выходе, чтобы смена пола в настройках
 * меняла картинку рекорда сразу.
 */
import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { localGet, localSet } from '../utils/storage'
import { canReadServer, canTrust } from './session'
import { applyGender } from './gender-media'

const KEY = 'personal-records'
const EMPTY = { best_month: null, strength: null, swim: null }
let cache = null

/**
 * Миниатюра силового рекорда — под пол. Пол по умолчанию свой; для рекорда
 * ДРУГА зовём с его полом (профиль отдаёт его тем же ответом).
 */
export function applyRecordsGender(records, gender) {
  if (!records?.strength) return records
  return { ...records, strength: applyGender(records.strength, gender) }
}

/** Синхронно последние известные рекорды (или null, если ещё не грузили). */
export function getRecordsSync() {
  if (cache) return applyRecordsGender(cache)
  const raw = localGet(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    cache = parsed
    return applyRecordsGender(parsed)
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
  // Без сети или без сессии на сервер не идём: рекорды считаются по подписи
  // сессии, и пустой ответ затёр бы сохранённые (см. lib/session.js).
  if (!canReadServer()) return getRecordsSync() || EMPTY
  try {
    const { data, error } = await supabase.rpc('api_get_personal_records')
    if (!canTrust(error)) {
      if (error) console.error('[records] error:', error)
      return getRecordsSync() || EMPTY
    }
    const value = data || EMPTY
    cache = value
    try { localSet(KEY, JSON.stringify(value)) } catch { /* ignore */ }
    return applyRecordsGender(value)
  } catch (e) {
    console.error('[records] exception:', e)
    return getRecordsSync() || EMPTY
  }
}
