/**
 * Склонения русских слов в зависимости от числа.
 */

/**
 * "1 ДЕНЬ", "2 ДНЯ", "5 ДНЕЙ"
 */
export function pluralizeDays(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'ДНЕЙ'
  if (n1 > 1 && n1 < 5) return 'ДНЯ'
  if (n1 === 1) return 'ДЕНЬ'
  return 'ДНЕЙ'
}

/**
 * "1 тренировка", "2 тренировки", "5 тренировок"
 */
export function pluralizeWorkouts(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'тренировок'
  if (n1 > 1 && n1 < 5) return 'тренировки'
  if (n1 === 1) return 'тренировка'
  return 'тренировок'
}