/**
 * Утилиты дат по МОСКОВСКОМУ времени.
 *
 * Здесь базовый слой календаря: московские компоненты даты, ключ дня и ключ
 * ISO-недели. `utils/history.js` берёт их отсюда, а не держит свои копии.
 *
 * ПОЧЕМУ НЕ `setHours(getHours() - 3)`. Так было раньше, и это вычитало три
 * часа из времени УСТРОЙСТВА, а не переводило в Москву. У человека с
 * московскими часами неделя и сутки менялись не в 00:00, а в 03:00 МСК: в час
 * ночи понедельника статистика уже показывала новую неделю (она считается
 * честно), а огонёк — ещё старую с прошлыми тренировками. Правильный перевод —
 * прибавить смещение к UTC и читать UTC-компоненты (`mskParts`).
 *
 * ВАЖНО про формат ключа недели:
 * SQL-функция api_finish_workout пишет в users.weekly_streak_week значение
 * вида to_char(NOW() AT TIME ZONE 'Europe/Moscow', 'IYYY-IW') — ISO-неделя
 * в формате '2026-22' (ISO-год + номер недели). Фронт обязан давать РОВНО
 * такой же ключ, иначе сравнение не совпадёт и стрик обнулится на ровном месте.
 */

// Москва — UTC+3 круглый год, перехода на летнее время нет с 2014-го.
const MSK_OFFSET_MS = 3 * 3600 * 1000

/**
 * Компоненты даты по Москве. Сдвигаем момент на +3 и читаем UTC-поля —
 * тогда часовой пояс устройства ни на что не влияет.
 */
export function mskParts(iso) {
  const shifted = new Date(new Date(iso).getTime() + MSK_OFFSET_MS)
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    min: shifted.getUTCMinutes()
  }
}

/** Ключ дня по Москве: "2026-07-06". */
export function mskDayKey(iso) {
  const { y, m, d } = mskParts(iso)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Ключ "сегодня" по МСК. Сутки идут от 00:00 до 00:00 московского времени —
 * так же, как их считает сервер в api_finish_workout. Прежний сдвиг на 3 часа
 * (наследие дневных квестов, которых больше нет) убран.
 */
export function getTodayKey(now = new Date()) {
  return mskDayKey(now.toISOString())
}

/**
 * ISO-ключ недели по МСК — "2026-22". Совпадает с Postgres 'IYYY-IW'.
 *
 * ISO-неделя начинается в понедельник, а её номер и год определяет ЧЕТВЕРГ
 * этой недели: неделя №1 — та, что содержит первый четверг года. Поэтому
 * считаем от четверга нашей недели до четверга недели, содержащей 4 января.
 */
export function getCurrentWeekKey(now = new Date()) {
  const { y, m, d } = mskParts(now.toISOString())
  // Дальше работаем в UTC: компоненты уже московские, пояс устройства не влияет.
  const thursday = new Date(Date.UTC(y, m, d))
  const dayNum = (thursday.getUTCDay() + 6) % 7 // понедельник = 0
  thursday.setUTCDate(thursday.getUTCDate() - dayNum + 3)

  const isoYear = thursday.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const janDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - janDayNum + 3)

  const week = 1 + Math.round((thursday - firstThursday) / (7 * 86400000))
  return `${isoYear}-${String(week).padStart(2, '0')}`
}

/**
 * Актуальный стрик с учётом недели последнего обновления.
 *
 * В БД лежит weekly_streak + weekly_streak_week (ISO-ключ недели, когда стрик
 * последний раз менялся). Если эта неделя не совпадает с текущей — значит
 * на новой неделе ещё не было тренировок, и стрик уже "протух" → 0.
 *
 * Свой стрик пересчитывается при логине, а чужой (в списке друзей) никто не
 * протухает, пока друг сам не зайдёт — поэтому считаем актуальность тут.
 */
export function resolveWeeklyStreak(streak, streakWeek) {
  if (!streak || streak <= 0) return 0
  if (!streakWeek) return streak
  return streakWeek === getCurrentWeekKey() ? streak : 0
}