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
  { name: 'НОВИЧОК',     color: '#9ED153', rarity: 'common',     icon: 'rookie' },
  { name: 'СПОРТСМЕН',   color: '#9ED153', rarity: 'common',     icon: 'sportsman' },
  { name: 'АТЛЕТ',       color: '#3FA2F7', rarity: 'rare',       icon: 'athlete' },
  { name: 'ТРЕНЕР',      color: '#3FA2F7', rarity: 'rare',       icon: 'coach' },
  { name: 'МАШИНА',      color: '#B47BFF', rarity: 'epic',       icon: 'machine' },
  { name: 'ЭЛИТА',       color: '#B47BFF', rarity: 'epic',       icon: 'elite' },
  { name: 'ЧЕМПИОН',     color: '#FF8C42', rarity: 'legendary',  icon: 'champion' },
  { name: 'Х3 ЧЕМПИОН',  color: '#FF8C42', rarity: 'legendary',  icon: 'x3-champion' },
  { name: 'ТИТАН',       color: '#E84545', rarity: 'mythic',     icon: 'titan' },
  { name: 'ЛЕГЕНДА',     color: '#E84545', rarity: 'mythic',     icon: 'legend' }
]

export const IMMORTAL = { name: 'БЕССМЕРТНЫЙ', color: '#FFD700', rarity: 'godlike', icon: 'immortal' }

export const LEVELS_PER_RANK = 3
export const XP_PER_LEVEL = 300
export const IMMORTAL_START_LEVEL = RANK_NAMES.length * LEVELS_PER_RANK + 1 // = 31

/* ============================================ */
/* ФУНКЦИИ */
/* ============================================ */

export function getRankByLevel(level) {
  if (level >= IMMORTAL_START_LEVEL) {
    return {
      ...IMMORTAL,
      subLevel: level - IMMORTAL_START_LEVEL + 1
    }
  }

  const rankIndex = Math.floor((level - 1) / LEVELS_PER_RANK)
  const subLevel = ((level - 1) % LEVELS_PER_RANK) + 1
  const rank = RANK_NAMES[rankIndex] || RANK_NAMES[0]

  return { ...rank, subLevel }
}

export function xpRequiredForLevel(level) {
  if (level <= 1) return 0
  return (level - 1) * XP_PER_LEVEL
}

export function xpToNextLevel(currentXP) {
  const level = getLevelFromXP(currentXP)
  return xpRequiredForLevel(level + 1) - currentXP
}

export function getLevelFromXP(totalXP) {
  if (totalXP < 0) return 1
  return Math.floor(totalXP / XP_PER_LEVEL) + 1
}

export function getLevelProgress(totalXP) {
  const level = getLevelFromXP(totalXP)
  const currentLevelXP = xpRequiredForLevel(level)
  const nextLevelXP = xpRequiredForLevel(level + 1)
  const progressInLevel = totalXP - currentLevelXP
  const totalForLevel = nextLevelXP - currentLevelXP
  return Math.min(100, Math.max(0, (progressInLevel / totalForLevel) * 100))
}

/**
 * Мускулы в текущем уровне (для отображения "20/300" внутри ТЕКУЩЕГО уровня).
 * Используется для логики заполнения XP-бара.
 *
 * Пример: при totalXP=320 (уровень 2) вернёт { current: 20, needed: 300 }.
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

/**
 * Общий прогресс по мускулам (для отображения "320/600" в XP-баре).
 *
 * Цифры показывают накопительный общий счёт и порог следующего уровня.
 * Полоса заполнения бара при этом остаётся "прогресс внутри уровня"
 * — отдельная функция getLevelProgress.
 *
 * Пример: при totalXP=320 (уровень 2, до уровня 3 надо 600) вернёт
 *   { current: 320, needed: 600 }
 */
export function getTotalXPProgress(totalXP) {
  const level = getLevelFromXP(totalXP)
  const nextLevelXP = xpRequiredForLevel(level + 1)
  return {
    current: Math.max(0, totalXP),
    needed: nextLevelXP
  }
}

/* ============================================ */
/* НАГРАДЫ */
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
/* Реэкспорт для совместимости */
/* ============================================ */

export { pluralizeDays, pluralizeWorkouts } from '../utils/plural'