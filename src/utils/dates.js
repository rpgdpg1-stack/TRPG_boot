/**
 * Утилиты для работы с датами по московскому времени.
 *
 * Используются в двух местах:
 * - getTodayKey: для ключа дневных квестов (сброс в 03:00 МСК)
 * - getCurrentWeekKey: для ключа недельного стрика (понедельник = новая неделя)
 */

/**
 * Ключ "сегодня" по МСК со сдвигом дня в 03:00.
 * Используется для daily_quests (сброс квестов в 3 утра).
 *
 * Пример возврата: "2026-05-12"
 */
export function getTodayKey() {
  const now = new Date()
  // Сдвиг на -3 часа: если сейчас 02:30 МСК, считаем что ещё "вчера"
  now.setHours(now.getHours() - 3)
  return now.toISOString().split('T')[0]
}

/**
 * Ключ "текущая неделя" по МСК. Неделя начинается с понедельника.
 * Используется для weekly_streak (стрик сбрасывается каждый понедельник).
 *
 * Пример возврата: "2026-05-11" (понедельник этой недели)
 */
export function getCurrentWeekKey() {
  const now = new Date()
  now.setHours(now.getHours() - 3)
  const day = now.getDay()         // 0 = воскресенье, 1 = понедельник...
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}