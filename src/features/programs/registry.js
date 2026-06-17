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
    title: 'ЗАПЛЫВ 45',
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
 * Пользовательские программы (своя + от друга) — подгружаются из БД в рантайме
 * через features/programs/customProgram.js и участвуют во всех геттерах ниже.
 */
let USER_PROGRAMS = []

export function setUserPrograms(list) {
  USER_PROGRAMS = Array.isArray(list) ? list : []
}

export function getUserPrograms() {
  return USER_PROGRAMS
}

/** Все программы: статические + пользовательские (для сбросов/обходов). */
export function getAllPrograms() {
  return [...PROGRAMS, ...USER_PROGRAMS]
}

/**
 * Найти программу по slug (то что в URL).
 */
export function getProgramBySlug(slug) {
  return PROGRAMS.find(p => p.slug === slug)
    || USER_PROGRAMS.find(p => p.slug === slug)
    || null
}

/**
 * Найти программу по dbId (то что в БД).
 */
export function getProgramByDbId(dbId) {
  return PROGRAMS.find(p => p.dbId === dbId)
    || USER_PROGRAMS.find(p => p.dbId === dbId)
    || null
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
  return [
    ...PROGRAMS.filter(p => p.category === categoryId),
    ...USER_PROGRAMS.filter(p => p.category === categoryId)
  ]
}

/**
 * Кол-во программ в категории (статические + пользовательские).
 * Для динамической подписи «N программ» на главной и в разделе.
 */
export function getCategoryProgramCount(categoryId) {
  return getProgramsByCategory(categoryId).length
}

/**
 * Склонение слова «программа» по числу: 1 программа, 2 программы, 5 программ.
 */
export function pluralPrograms(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'программ'
  if (last === 1) return 'программа'
  if (last >= 2 && last <= 4) return 'программы'
  return 'программ'
}

/**
 * Готовая подпись «N программ» с правильным склонением.
 */
export function programCountLabel(categoryId) {
  const n = getCategoryProgramCount(categoryId)
  return `${n} ${pluralPrograms(n)}`
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

/**
 * Цвет тега программы. Единый источник для карточек (Home, Category).
 * Кастомная программа (source === 'custom') — всегда акцентный зелёный.
 * Встроенные — по названию тега. Незнакомый тег → серый.
 */
export function getProgramTagColor(tag, source) {
  if (source === 'custom') return 'var(--color-primary)'
  switch ((tag || '').toLowerCase()) {
    case 'зал': return 'var(--tag-gym)'
    case 'дом': return 'var(--tag-home)'
    case 'улица': return 'var(--tag-outdoor)'
    case 'бассейн': return 'var(--cat-pool)'
    default: return 'var(--color-text-secondary)'
  }
}