import { localGet, localSet } from '../utils/storage'
import { mskParts } from '../utils/history'

/**
 * Выбор периода истории (Неделя/Месяц/Год) + открытый месяц/год — общий для
 * экрана `/history` и карточки «История» на главной, чтобы цифры совпадали.
 * Храним в localStorage (мгновенно, вид-предпочтение — не нужен cloud).
 *
 * { period: 'week' | 'month' | 'year', year, month (0–11) }
 */
const KEY = 'history-view'

export function getHistoryView() {
  try {
    const v = JSON.parse(localGet(KEY) || 'null')
    if (v && (v.period === 'week' || v.period === 'month' || v.period === 'year')) return v
  } catch { /* ignore */ }
  const p = mskParts(new Date().toISOString())
  return { period: 'week', year: p.y, month: p.m }
}

export function setHistoryView(v) {
  try { localSet(KEY, JSON.stringify(v)) } catch { /* ignore */ }
}
