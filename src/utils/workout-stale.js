/**
 * «Забытая» тренировка — начали и не завершили. Чистые функции, без хранилища:
 * решение принимается только по сессии и числу отмеченных упражнений.
 *
 * Отсчёт идёт от ПОСЛЕДНЕЙ ГАЛОЧКИ, а не от старта: длинная тренировка с
 * регулярными отметками — нормальная, обрывать её нельзя. Три часа от старта
 * тут бы не подошли: отметил последнее через 2 ч, забыл нажать «Завершить» —
 * узнали бы только через 5 ч.
 *  - есть галочки → забыта через 90 мин после последней (самый длинный честный
 *    перерыв — тяжёлое упражнение с долгим отдыхом, ~30–40 мин; 90 — двойной запас);
 *  - ни одной галочки → через 3 ч после старта: так не мешаем тем, кто отмечает
 *    всё в конце одним заходом.
 *
 * `updatedAt` сдвигается и от простого открытия дня, поэтому время галочки —
 * отдельное поле `lastTickAt`. У старых сессий его нет — берём `updatedAt`.
 */
export const STALE_AFTER_TICK_MS = 90 * 60 * 1000
export const STALE_AFTER_START_MS = 3 * 60 * 60 * 1000

/** Время последней галочки. null — галочек нет. */
export function lastTickOf(session, doneCount) {
  if (!session || !doneCount) return null
  return session.lastTickAt || session.updatedAt || null
}

export function isWorkoutStale(session, doneCount, now = Date.now()) {
  if (!session?.startedAt) return false
  const tick = lastTickOf(session, doneCount)
  if (tick) return now - new Date(tick).getTime() >= STALE_AFTER_TICK_MS
  return now - new Date(session.startedAt).getTime() >= STALE_AFTER_START_MS
}
