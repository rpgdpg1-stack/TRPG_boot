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

/**
 * "1 упражнение", "2 упражнения", "5 упражнений"
 */
export function pluralizeExercises(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'упражнений'
  if (n1 > 1 && n1 < 5) return 'упражнения'
  if (n1 === 1) return 'упражнение'
  return 'упражнений'
}
/**
 * "1 программа", "2 программы", "5 программ" — счётчик в шапке раздела.
 */
export function pluralizePrograms(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'программ'
  if (n1 > 1 && n1 < 5) return 'программы'
  if (n1 === 1) return 'программа'
  return 'программ'
}

/**
 * "1 друг", "2 друга", "5 друзей" — счётчик на вкладке «Друзья».
 */
export function pluralizeFriends(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'друзей'
  if (n1 > 1 && n1 < 5) return 'друга'
  if (n1 === 1) return 'друг'
  return 'друзей'
}
