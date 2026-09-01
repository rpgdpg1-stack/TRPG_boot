/**
 * Склонения русских слов в зависимости от числа.
 */

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

/**
 * Названия видов активности по числу: «1 силовая», «2 силовые», «5 силовых».
 *
 * Раньше подпись была одна на любое число («Силовая 5»), потому что число
 * стояло ОТДЕЛЬНО от слова и в глаза не бросалось. Как только строка стала
 * читаться слитно — «5 Силовая» полезло наружу.
 *
 * Кардио не склоняется: слово несклоняемое, и это не упущение.
 */
const CATEGORY_FORMS = {
  strength: ['силовая', 'силовые', 'силовых'],
  pool: ['плавание', 'плавания', 'плаваний'],
  cardio: ['кардио', 'кардио', 'кардио'],
  stretch: ['растяжка', 'растяжки', 'растяжек']
}

export function pluralizeCategory(key, count) {
  const forms = CATEGORY_FORMS[key]
  if (!forms) return ''
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return forms[2]
  if (n1 > 1 && n1 < 5) return forms[1]
  if (n1 === 1) return forms[0]
  return forms[2]
}

/** То же с заглавной: «5 Силовых» — строка счётчика, а не середина фразы. */
export function pluralizeCategoryCap(key, count) {
  const w = pluralizeCategory(key, count)
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : ''
}

/**
 * "1 год", "2 года", "5 лет" — возраст рядом с датой рождения.
 */
export function pluralizeYears(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'лет'
  if (n1 > 1 && n1 < 5) return 'года'
  if (n1 === 1) return 'год'
  return 'лет'
}
