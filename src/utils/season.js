/**
 * Сезоны — даты, ключи, названия.
 *
 * Сезон длится 3 месяца, сбрасывается 1-го числа в 03:00 МСК
 * (= 00:00 UTC) марта, июня, сентября, декабря.
 *
 * Распределение:
 *  - 🌸 Весна  = март, апрель, май
 *  - ☀️ Лето   = июнь, июль, август
 *  - 🍂 Осень  = сентябрь, октябрь, ноябрь
 *  - ❄️ Зима   = декабрь, январь, февраль (внимание: декабрь относится к зиме СЛЕДУЮЩЕГО года)
 *
 * Ключи сезонов: 'spring-2026', 'summer-2026', 'autumn-2026', 'winter-2026'.
 * Зима 2025-2026 хранится как 'winter-2026' (год = тот в котором заканчивается зима).
 */

export const SEASONS = {
  spring: { key: 'spring', name: 'Весна', emoji: '🌸', color: '#9ED153' },
  summer: { key: 'summer', name: 'Лето',  emoji: '☀️', color: '#FFD700' },
  autumn: { key: 'autumn', name: 'Осень', emoji: '🍂', color: '#FF8C42' },
  winter: { key: 'winter', name: 'Зима',  emoji: '❄️', color: '#3FA2F7' }
}

/**
 * По месяцу определяем сезон. Месяц 0-11 (как у Date.getMonth()).
 *  - март (2), апрель (3), май (4) → весна
 *  - июнь (5), июль (6), август (7) → лето
 *  - сент (8), окт (9), ноя (10) → осень
 *  - дек (11), янв (0), фев (1) → зима
 */
function seasonFromMonth(month) {
  if (month >= 2 && month <= 4) return SEASONS.spring
  if (month >= 5 && month <= 7) return SEASONS.summer
  if (month >= 8 && month <= 10) return SEASONS.autumn
  return SEASONS.winter
}

/**
 * Текущая дата в МСК. Берём UTC время и прибавляем 3 часа.
 * Возвращает Date который при getUTCMonth/getUTCFullYear даёт москoвские значения.
 */
function nowMsk() {
  const now = new Date()
  return new Date(now.getTime() + 3 * 60 * 60 * 1000)
}

/**
 * Получить текущий сезон. Возвращает объект:
 *   { key: 'spring-2026', name: 'Весна 2026', emoji, color, season: { ... }, year, startsAt, endsAt }
 */
export function getCurrentSeason() {
  const msk = nowMsk()
  const month = msk.getUTCMonth()
  const year = msk.getUTCFullYear()

  const season = seasonFromMonth(month)

  // Год сезона: для зимы декабря — следующий год (т.к. зима 2025/2026 = 'winter-2026')
  let seasonYear = year
  if (season.key === 'winter' && month === 11) {
    seasonYear = year + 1
  }

  return {
    key: `${season.key}-${seasonYear}`,
    name: `${season.name} ${seasonYear}`,
    emoji: season.emoji,
    color: season.color,
    season,
    year: seasonYear,
    startsAt: getSeasonStartDate(season.key, seasonYear),
    endsAt: getSeasonEndDate(season.key, seasonYear)
  }
}

/**
 * Следующий сезон (для подписи "до следующего сезона ... осталось N дней").
 * Возвращает объект из SEASONS: { key, name, emoji, color }.
 */
export function getNextSeason() {
  const order = ['spring', 'summer', 'autumn', 'winter']
  const current = getCurrentSeason()
  const idx = order.indexOf(current.season.key)
  return SEASONS[order[(idx + 1) % order.length]]
}

/**
 * Дата старта сезона. Все даты в UTC, потому что 03:00 МСК = 00:00 UTC.
 */
function getSeasonStartDate(seasonKey, year) {
  switch (seasonKey) {
    case 'spring': return new Date(Date.UTC(year, 2, 1, 0, 0, 0))      // 1 марта
    case 'summer': return new Date(Date.UTC(year, 5, 1, 0, 0, 0))      // 1 июня
    case 'autumn': return new Date(Date.UTC(year, 8, 1, 0, 0, 0))      // 1 сент
    case 'winter': return new Date(Date.UTC(year - 1, 11, 1, 0, 0, 0)) // 1 дек прошлого года
    default: return new Date()
  }
}

/**
 * Дата конца сезона = дата старта следующего.
 */
function getSeasonEndDate(seasonKey, year) {
  switch (seasonKey) {
    case 'spring': return new Date(Date.UTC(year, 5, 1, 0, 0, 0))   // 1 июня = старт лета
    case 'summer': return new Date(Date.UTC(year, 8, 1, 0, 0, 0))   // 1 сент = старт осени
    case 'autumn': return new Date(Date.UTC(year, 11, 1, 0, 0, 0))  // 1 дек = старт зимы
    case 'winter': return new Date(Date.UTC(year, 2, 1, 0, 0, 0))   // 1 марта = старт весны
    default: return new Date()
  }
}

/**
 * Сколько дней осталось до конца текущего сезона.
 * Используется в правилах и попапах ("осталось 47 дней").
 */
export function getDaysUntilSeasonEnd() {
  const { endsAt } = getCurrentSeason()
  const diffMs = endsAt.getTime() - new Date().getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * Человекочитаемая дата окончания: "1 июня"
 */
export function formatSeasonEndDate() {
  const { endsAt } = getCurrentSeason()
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  return `${endsAt.getUTCDate()} ${months[endsAt.getUTCMonth()]}`
}