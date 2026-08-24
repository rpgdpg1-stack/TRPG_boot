/**
 * Примечательное в только что завершённой тренировке: возвращение после долгой
 * паузы и выросшие результаты.
 *
 * Считает база (`api_workout_highlights`) — отдельным запросом ПОСЛЕ сохранения,
 * а не внутри него. Сохранение тренировки критично, а украшения нет: не
 * ответили — человек увидит обычную модалку и ничего не потеряет.
 */

import { supabase } from './supabase'
import { formatMeters } from '../utils/history'

/**
 * С какой паузы отмечаем возвращение.
 *
 * Месяц — потому что неделя-другая это обычный перерыв (отпуск, болезнь,
 * завал), и поздравлять с ним значит обесценить поздравление. А месяц
 * человек уже переживает как «я забросил».
 */
export const COMEBACK_MIN_DAYS = 30

/** «50 кг» / «112,5 кг» — как в карточке упражнения. */
function formatWeight(kg) {
  const n = Number(kg)
  if (!n) return null
  return `${Number.isInteger(n) ? n : String(n).replace('.', ',')} кг`
}

/**
 * Забрать украшения тренировки. Возвращает `{ comebackDays, records }`;
 * при любой заминке — пустой результат, а не ошибку.
 */
export async function getWorkoutHighlights(workoutId) {
  const empty = { comebackDays: null, records: [] }
  if (!workoutId) return empty

  try {
    const { data, error } = await supabase.rpc('api_workout_highlights', { p_workout_id: workoutId })
    if (error) { console.warn('[highlights] не посчитались:', error.message); return empty }

    const raw = data || {}
    const days = Number(raw.comebackDays) || 0

    const records = (raw.records || []).map((r) => ({
      name: r.name,
      value: r.kind === 'swim' ? formatMeters(r.value) : formatWeight(r.value),
      delta: r.kind === 'swim' ? formatMeters(r.delta) : formatWeight(r.delta)
    })).filter((r) => r.value)

    return {
      // Порог решается здесь, а не в базе: это правило продукта, и менять его
      // проще там, где оно видно рядом с текстом модалки.
      comebackDays: days >= COMEBACK_MIN_DAYS ? days : null,
      records
    }
  } catch (e) {
    console.warn('[highlights] исключение:', e?.message)
    return empty
  }
}
