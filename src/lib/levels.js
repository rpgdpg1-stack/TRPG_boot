/**
 * Система рангов и уровней RPG.
 *
 * Логика:
 * - 10 обычных рангов × 3 уровня внутри каждого = 30 уровней
 * - С уровня 31 — БЕССМЕРТНЫЙ (бесконечный ранг)
 * - Каждый уровень требует +300 мускулов от предыдущего
 *
 * Уровень 1 (НОВОБРАНЕЦ 1)  → 0 мускулов (старт)
 * Уровень 2 (НОВОБРАНЕЦ 2)  → 300
 * Уровень 3 (НОВОБРАНЕЦ 3)  → 600
 * Уровень 4 (СПОРТСМЕН 1)   → 900
 * ...
 * Уровень 30 (АХИЛЛ 3)      → 8700
 * Уровень 31 (БЕССМЕРТНЫЙ 1) → 9000
 * И дальше каждые +300 = новый уровень бессмертного.
 */

/* ============================================ */
/* РАНГИ */
/* ============================================ */

export const RANK_NAMES = [
  { name: 'НОВОБРАНЕЦ',  color: '#9ED153', rarity: 'common',     emoji: '🟢' },  // ур. 1-3
  { name: 'СПОРТСМЕН',   color: '#9ED153', rarity: 'common',     emoji: '🟢' },  // ур. 4-6
  { name: 'АТЛЕТ',       color: '#3FA2F7', rarity: 'rare',       emoji: '🔵' },  // ур. 7-9
  { name: 'БОЕЦ',        color: '#3FA2F7', rarity: 'rare',       emoji: '🔵' },  // ур. 10-12
  { name: 'ВИТЯЗЬ',      color: '#B47BFF', rarity: 'epic',       emoji: '🟣' },  // ур. 13-15
  { name: 'ЦЕНТУРИОН',   color: '#B47BFF', rarity: 'epic',       emoji: '🟣' },  // ур. 16-18
  { name: 'ГЕРАКЛ',      color: '#FF8C42', rarity: 'legendary',  emoji: '🟠' },  // ур. 19-21
  { name: 'ТИТАН',       color: '#FF8C42', rarity: 'legendary',  emoji: '🟠' },  // ур. 22-24
  { name: 'ЛЕГЕНДА',     color: '#E84545', rarity: 'mythic',     emoji: '🔴' },  // ур. 25-27
  { name: 'АХИЛЛ',       color: '#E84545', rarity: 'mythic',     emoji: '🔴' }   // ур. 28-30
]

// БЕССМЕРТНЫЙ — особый, от уровня 31 и далее
export const IMMORTAL = { name: 'БЕССМЕРТНЫЙ', color: '#FFD700', rarity: 'godlike', emoji: '🏆' }

/**
 * Уровней внутри одного ранга (для не-бессмертных)
 */
export const LEVELS_PER_RANK = 3

/**
 * Сколько мускулов нужно для перехода с уровня (N-1) на уровень N.
 */
export const XP_PER_LEVEL = 300

/**
 * Уровень, с которого начинается БЕССМЕРТНЫЙ.
 * 10 рангов × 3 уровня + 1 = 31
 */
export const IMMORTAL_START_LEVEL = RANK_NAMES.length * LEVELS_PER_RANK + 1 // = 31

/* ============================================ */
/* ФУНКЦИИ ПОЛУЧЕНИЯ РАНГА И УРОВНЯ */
/* ============================================ */

/**
 * Получить ранг и подуровень внутри ранга по числу глобального уровня.
 * Возвращает: { name, color, emoji, rarity, subLevel }
 *
 * subLevel — это "1", "2", "3" внутри ранга (или 1+ для бессмертного).
 * Используется для отображения "НОВОБРАНЕЦ 2".
 */
export function getRankByLevel(level) {
  if (level >= IMMORTAL_START_LEVEL) {
    return {
      ...IMMORTAL,
      subLevel: level - IMMORTAL_START_LEVEL + 1
    }
  }

  const rankIndex = Math.floor((level - 1) / LEVELS_PER_RANK) // 0,1,2...
  const subLevel = ((level - 1) % LEVELS_PER_RANK) + 1        // 1,2,3
  const rank = RANK_NAMES[rankIndex] || RANK_NAMES[0]

  return { ...rank, subLevel }
}

/**
 * Сколько мускулов нужно чтобы достичь глобального уровня N (накопительно).
 * Уровень 1 → 0, уровень 2 → 300, уровень 3 → 600 ...
 */
export function xpRequiredForLevel(level) {
  if (level <= 1) return 0
  return (level - 1) * XP_PER_LEVEL
}

/**
 * Сколько мускулов осталось до следующего уровня
 */
export function xpToNextLevel(currentXP) {
  const level = getLevelFromXP(currentXP)
  return xpRequiredForLevel(level + 1) - currentXP
}

/**
 * Получить текущий глобальный уровень по общему количеству мускулов
 */
export function getLevelFromXP(totalXP) {
  if (totalXP < 0) return 1
  return Math.floor(totalXP / XP_PER_LEVEL) + 1
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
 * Мускулы в текущем уровне (для отображения "180/300")
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
/* НАГРАДЫ В МУСКУЛАХ */
/* ============================================ */

export const XP_REWARDS = {
  WORKOUT_COMPLETE: 150,
  STREAK_BONUS_3DAYS: 50,
  STREAK_BONUS_7DAYS: 150,
  QUEST_SMALL: 20,
  QUEST_MEDIUM: 30,
  QUEST_LARGE: 50
}

/* ============================================ */
/* Реэкспорт для совместимости — старые файлы могут импортировать отсюда */
/* ============================================ */

export { pluralizeDays, pluralizeWorkouts } from '../utils/plural'