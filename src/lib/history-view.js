import { localGet, localSet } from '../utils/storage'
import { mskParts } from '../utils/history'

/**
 * Выбор периода истории (Неделя/Месяц/Год/Всё время) + открытый месяц/год — общий
 * для экрана `/history` и карточки «Статистика» на главной, чтобы цифры совпадали.
 * Храним в localStorage (мгновенно, вид-предпочтение — не нужен cloud).
 *
 * { period: 'week' | 'month' | 'year' | 'all', year, month (0–11) }
 */
const KEY = 'history-view'
const PERIODS = ['week', 'month', 'year', 'all']

export function getHistoryView() {
  try {
    const v = JSON.parse(localGet(KEY) || 'null')
    if (v && PERIODS.includes(v.period)) return v
  } catch { /* ignore */ }
  const p = mskParts(new Date().toISOString())
  return { period: 'week', year: p.y, month: p.m }
}

export function setHistoryView(v) {
  try { localSet(KEY, JSON.stringify(v)) } catch { /* ignore */ }
}
