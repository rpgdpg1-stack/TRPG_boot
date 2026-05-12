/**
 * Реестр программ — единственное место где живёт связь
 * "URL-slug ↔ ID в БД ↔ модуль с данными".
 *
 * Правка #3: раньше slug ("split") и dbId ("prog_001") путались между собой
 * в URL и в коде. Если бы добавилась вторая программа — баги были бы гарантированы.
 *
 * Теперь правило простое:
 *   - В URL'ах живёт slug: /program/split, /workout/split/A
 *   - В коде и БД живёт dbId: prog_001
 *   - Связь slug↔dbId — ТОЛЬКО тут
 *
 * Когда добавляешь новую программу — добавляешь сюда одну запись,
 * и она автоматически становится доступна везде.
 */

import { SPLIT_PROGRAM } from '../../data/programs/split'

/**
 * Список всех программ.
 * slug — для URL, dbId — для базы, data — структура дней.
 */
export const PROGRAMS = [
  {
    slug: 'split',
    dbId: 'prog_001',
    title: 'СПЛИТ',
    tags: ['зал'],
    category: 'gym',
    available: true,
    comingSoon: false,
    data: SPLIT_PROGRAM
  }
  // Добавлять новые программы сюда. Например:
  // {
  //   slug: 'fullbody-ab',
  //   dbId: 'prog_002',
  //   title: 'FULL BODY A/B',
  //   tags: ['зал', 'дом'],
  //   category: 'gym',
  //   available: true,
  //   comingSoon: false,
  //   data: FULLBODY_AB_PROGRAM
  // }
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
 * Используется в страницах WorkoutDay.
 */
export function getProgramDaySlots(slug, day) {
  const program = getProgramBySlug(slug)
  if (!program) return []
  return program.data.days[day] || []
}