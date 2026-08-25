/**
 * Примечательное в только что завершённой тренировке: возвращение после долгой
 * паузы и выросшие результаты.
 *
 * Считает база (`api_workout_highlights`). Обычный путь — ВНУТРИ сохранения:
 * `api_finish_workout` зовёт её сама и отдаёт результат тем же ответом, поэтому
 * блок «Новые результаты» встаёт в модалку вместе с остальными показателями, а
 * не через второй круг к серверу. Сохранение от этого не рискует: вызов в базе
 * обёрнут в EXCEPTION-блок, украшения не смогут уронить запись тренировки.
 *
 * Отдельный запрос (`getWorkoutHighlights`) остаётся запасным путём — на случай
 * старой версии функции на сервере.
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

export const EMPTY_HIGHLIGHTS = { comebackDays: null, records: [] }

/**
 * Сырой ответ базы (`{comebackDays, records:[{kind,name,value,delta}]}`) → то,
 * что рисует модалка. Формат чисел и порог возвращения решаются ЗДЕСЬ, а не в
 * базе: это правила продукта, и менять их проще там, где они видны рядом с
 * текстом модалки.
 *
 * Общая для обоих путей: украшения приходят и вместе с сохранением
 * (`api_finish_workout`), и отдельным запросом — разбирать их надо одинаково.
 */
export function normalizeHighlights(raw) {
  if (!raw) return EMPTY_HIGHLIGHTS
  const days = Number(raw.comebackDays) || 0

  const records = (raw.records || []).map((r) => ({
    name: r.name,
    value: r.kind === 'swim' ? formatMeters(r.value) : formatWeight(r.value),
    delta: r.kind === 'swim' ? formatMeters(r.delta) : formatWeight(r.delta)
  })).filter((r) => r.value)

  return { comebackDays: days >= COMEBACK_MIN_DAYS ? days : null, records }
}

/**
 * Забрать украшения тренировки ОТДЕЛЬНЫМ запросом. Запасной путь: обычно они
 * приезжают вместе с сохранением (`finishWorkout().highlights`), и лишний
 * поход к серверу не нужен. Нужна для старой версии функции на сервере и
 * для повторного запроса.
 *
 * Возвращает `{ comebackDays, records }`; при любой заминке — пустой
 * результат, а не ошибку.
 */
export async function getWorkoutHighlights(workoutId) {
  if (!workoutId) return EMPTY_HIGHLIGHTS

  try {
    const { data, error } = await supabase.rpc('api_workout_highlights', { p_workout_id: workoutId })
    if (error) { console.warn('[highlights] не посчитались:', error.message); return EMPTY_HIGHLIGHTS }
    return normalizeHighlights(data)
  } catch (e) {
    console.warn('[highlights] исключение:', e?.message)
    return EMPTY_HIGHLIGHTS
  }
}
