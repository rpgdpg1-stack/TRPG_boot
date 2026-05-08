/**
 * Система рангов и уровней RPG.
 * Здесь живут все формулы прокачки, ранги, цвета редкости.
 *
 * Пока используется как справочник + заглушки для XP.
 * Когда будет реальная логика тренировок — формулы XP можно будет легко изменить.
 */

/* ============================================ */
/* РАНГИ — 50 уровней, 11 званий */
/* ============================================ */

export const RANKS = [
  { from: 1,  to: 4,  name: 'НОВОБРАНЕЦ',   color: '#9ED153', rarity: 'common',     emoji: '🟢' },
  { from: 5,  to: 9,  name: 'СПОРТСМЕН',    color: '#9ED153', rarity: 'common',     emoji: '🟢' },
  { from: 10, to: 14, name: 'АТЛЕТ',        color: '#3FA2F7', rarity: 'rare',       emoji: '🔵' },
  { from: 15, to: 19, name: 'БОЕЦ',         color: '#3FA2F7', rarity: 'rare',       emoji: '🔵' },
  { from: 20, to: 24, name: 'ВИТЯЗЬ',       color: '#B47BFF', rarity: 'epic',       emoji: '🟣' },
  { from: 25, to: 29, name: 'ЦЕНТУРИОН',    color: '#B47BFF', rarity: 'epic',       emoji: '🟣' },
  { from: 30, to: 34, name: 'ГЕРАКЛ',       color: '#FF8C42', rarity: 'legendary',  emoji: '🟠' },
  { from: 35, to: 39, name: 'ТИТАН',        color: '#FF8C42', rarity: 'legendary',  emoji: '🟠' },
  { from: 40, to: 44, name: 'ЛЕГЕНДА',      color: '#E84545', rarity: 'mythic',     emoji: '🔴' },
  { from: 45, to: 49, name: 'АХИЛЛ',        color: '#E84545', rarity: 'mythic',     emoji: '🔴' },
  { from: 50, to: 999,name: 'БЕССМЕРТНЫЙ',  color: '#FFD700', rarity: 'godlike',    emoji: '🏆' }
]

/**
 * Получить ранг по числу уровня
 */
export function getRankByLevel(level) {
  return RANKS.find(r => level >= r.from && level <= r.to) || RANKS[0]
}

/* ============================================ */
/* XP ФОРМУЛЫ */
/* ============================================ */

/**
 * Сколько XP нужно чтобы достичь уровня N (накопительно).
 * Формула экспоненциальная: каждый следующий уровень требует больше.
 *
 * Уровень 1 → 0 XP (старт)
 * Уровень 2 → 1000 XP
 * Уровень 3 → 2200 XP
 * Уровень 4 → 3600 XP
 * И так далее...
 */
export function xpRequiredForLevel(level) {
  if (level <= 1) return 0
  return Math.floor(1000 * (level - 1) + 100 * Math.pow(level - 1, 2))
}

/**
 * Сколько XP осталось до следующего уровня
 */
export function xpToNextLevel(currentXP) {
  const level = getLevelFromXP(currentXP)
  return xpRequiredForLevel(level + 1) - currentXP
}

/**
 * Получить текущий уровень по общему количеству XP
 */
export function getLevelFromXP(totalXP) {
  let level = 1
  while (xpRequiredForLevel(level + 1) <= totalXP) {
    level++
    if (level > 999) break
  }
  return level
}

/**
 * Прогресс до следующего уровня в процентах (0-100)
 */
export function getLevelProgress(totalXP) {
  const level = getLevelFromXP(totalXP)
  const currentLevelXP = xpRequiredForLevel(level)
  const nextLevelXP = xpRequiredForLevel(level + 1)
  const progressInLevel = totalXP - currentLevelXP
  const totalForLevel = nextLevelXP - currentLevelXP
  return Math.min(100, Math.max(0, (progressInLevel / totalForLevel) * 100))
}

/**
 * XP в текущем уровне (для отображения "700/1000")
 */
export function getXPInCurrentLevel(totalXP) {
  const level = getLevelFromXP(totalXP)
  const currentLevelXP = xpRequiredForLevel(level)
  const nextLevelXP = xpRequiredForLevel(level + 1)
  return {
    current: totalXP - currentLevelXP,
    needed: nextLevelXP - currentLevelXP
  }
}

/* ============================================ */
/* НАГРАДЫ XP — пока константы, потом подключим */
/* ============================================ */

export const XP_REWARDS = {
  WORKOUT_COMPLETE: 150,
  STREAK_BONUS_3DAYS: 50,
  STREAK_BONUS_7DAYS: 150,
  QUEST_SMALL: 20,        // вода, простые задания
  QUEST_MEDIUM: 30,       // растяжка, отжимания
  QUEST_LARGE: 50         // длинные тренировки
}

/* ============================================ */
/* СКЛОНЕНИЕ слов "день/дня/дней" */
/* ============================================ */

export function pluralizeDays(count) {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return 'ДНЕЙ'
  if (n1 > 1 && n1 < 5) return 'ДНЯ'
  if (n1 === 1) return 'ДЕНЬ'
  return 'ДНЕЙ'
}
