/**
 * Реестр программ — единственное место где живёт связь
 * "URL-slug ↔ ID в БД ↔ модуль с данными".
 *
 * kind: тип программы. 'swim' — плавание (своя страница /swim/:slug, нет дней
 * A/B/C). Силовая kind не задаёт (трактуется как обычная по дням).
 */

import { SPLIT_PROGRAM } from '../../data/programs/split'
import { SWIM_PROGRAM } from '../../data/programs/swim'

/**
 * Список всех программ.
 * slug — для URL, dbId — для базы, data — структура дней/блоков.
 */
export const PROGRAMS = [
  {
    slug: 'split',
    dbId: 'prog_001',
    title: 'СПЛИТ',
    emoji: '🏋️',
    tags: ['зал'],
    category: 'gym',
    available: true,
    comingSoon: false,
    data: SPLIT_PROGRAM
  },
  {
    slug: 'swim',
    dbId: 'swim_001',
    title: 'ЗАПЛЫВ',
    emoji: '🏊',
    tags: ['бассейн'],
    category: 'pool',
    kind: 'swim',
    available: true,
    comingSoon: false,
    data: SWIM_PROGRAM
  }
]

/**
 * Найти программу по slug (то что в URL).
 */
export function getProgramBySlug(slug) {
  return PROGRAMS.find(p => p.slug === slug) || null
}

/**
 * Найти программу по dbId (то что в БД).
 */
export function getProgramByDbId(dbId) {
  return PROGRAMS.find(p => p.dbId === dbId) || null
}

/**
 * Универсальный поиск: принимает либо slug, либо dbId.
 * Используется когда не уверены что пришло (например, при миграции старых URL).
 */
export function getProgramByAnyId(id) {
  return getProgramBySlug(id) || getProgramByDbId(id)
}

/**
 * Все программы для категории (для экрана Category).
 */
export function getProgramsByCategory(categoryId) {
  return PROGRAMS.filter(p => p.category === categoryId)
}

/**
 * Получить слоты дня программы по slug.
 * Используется в страницах WorkoutDay (силовая). Для плавания не применяется.
 */
export function getProgramDaySlots(slug, day) {
  const program = getProgramBySlug(slug)
  if (!program) return []
  return program.data.days?.[day] || []
}

/**
 * Эмодзи программы по slug. Единый источник для карточек (Home, Category).
 * Дефолт 💪 — чтобы незнакомая/placeholder-программа не ломала вёрстку.
 */
export function getProgramEmoji(slug) {
  return getProgramBySlug(slug)?.emoji || '💪'
}