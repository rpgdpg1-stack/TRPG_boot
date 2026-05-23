/**
 * Лиги — обёртка над данными рангов специально для рейтинга.
 *
 * Лига = ранг (одна лига на 3 подуровня).
 * Лиг всего 11: 10 обычных рангов + Бессмертный.
 *
 * Здесь мы переиспользуем данные из lib/levels.js (RANK_NAMES, IMMORTAL),
 * но добавляем функции которые нужны именно рейтингу:
 *  - по rank_index получить лигу
 *  - порог входа / выхода лиги (для отображения "сезон закончится тут")
 *  - имя лиги без подуровня ("Спортсмен" вместо "Спортсмен 2")
 *
 * rank_index — это число от 0 до 10. 0 = Новобранец, ..., 9 = Ахилл, 10 = Бессмертный.
 * То же самое возвращает SQL-функция в RPC лидерборда.
 */

import { RANK_NAMES, IMMORTAL, LEVELS_PER_RANK, XP_PER_LEVEL } from './levels'

const IMMORTAL_RANK_INDEX = 10

/**
 * Получить лигу по rank_index.
 * Возвращает { rankIndex, name, emoji, color, isImmortal, minMuscles, maxMuscles }.
 * Для бессмертного maxMuscles = Infinity.
 */
export function getLeagueByRankIndex(rankIndex) {
  if (rankIndex >= IMMORTAL_RANK_INDEX) {
    return {
      rankIndex: IMMORTAL_RANK_INDEX,
      name: IMMORTAL.name,
      emoji: IMMORTAL.emoji,
      color: IMMORTAL.color,
      isImmortal: true,
      minMuscles: IMMORTAL_RANK_INDEX * LEVELS_PER_RANK * XP_PER_LEVEL, // 9000
      maxMuscles: Infinity
    }
  }

  const rank = RANK_NAMES[rankIndex] || RANK_NAMES[0]
  const minMuscles = rankIndex * LEVELS_PER_RANK * XP_PER_LEVEL
  const maxMuscles = minMuscles + LEVELS_PER_RANK * XP_PER_LEVEL

  return {
    rankIndex,
    name: rank.name,
    emoji: rank.emoji,
    color: rank.color,
    isImmortal: false,
    minMuscles,
    maxMuscles
  }
}

/**
 * Получить лигу по количеству мускулов.
 * Используется на главной чтобы определить "в какой лиге сейчас юзер".
 */
export function getLeagueByMuscles(totalMuscles) {
  const rankIndex = Math.min(Math.max(Math.floor(totalMuscles / 900), 0), IMMORTAL_RANK_INDEX)
  return getLeagueByRankIndex(rankIndex)
}

/**
 * Все лиги в порядке (для экрана выбора лиг или для отображения списка).
 */
export function getAllLeagues() {
  const leagues = []
  for (let i = 0; i <= IMMORTAL_RANK_INDEX; i++) {
    leagues.push(getLeagueByRankIndex(i))
  }
  return leagues
}

/**
 * Сколько 💪 нужно для следующей лиги (для отображения "до следующей лиги: 240").
 * Для бессмертного возвращает null — он уже на максимуме.
 */
export function musclesUntilNextLeague(totalMuscles) {
  const current = getLeagueByMuscles(totalMuscles)
  if (current.isImmortal) return null
  return current.maxMuscles - totalMuscles
}