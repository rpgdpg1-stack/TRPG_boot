/**
 * Реестр программ — единственное место где живёт связь
 * "URL-slug ↔ ID в БД ↔ модуль с данными".
 *
 * kind: тип программы. 'swim' — плавание (своя страница /swim/:slug, нет дней
 * A/B/C). Силовая kind не задаёт (трактуется как обычная по дням).
 */

import { SPLIT_PROGRAM } from '../../data/programs/split'
import { FULLBODY_PROGRAM } from '../../data/programs/fullbody'
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
    slug: 'fullbody',
    dbId: 'prog_002',
    title: 'ФУЛБАДИ',
    emoji: '🏋️',
    tags: ['зал'],
    category: 'gym',
    available: true,
    comingSoon: false,
    data: FULLBODY_PROGRAM
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
 * Получить слоты дня программы по slug и (опц.) месту.
 * Если место передано и у программы есть набор для него (data.locations[place]) —
 * берём его; иначе фолбэк на data.days (набор «Зал» / встроенная программа).
 * Используется в страницах WorkoutDay (силовая). Для плавания не применяется.
 */
export function getProgramDaySlots(slug, day, place) {
  const program = getProgramBySlug(slug)
  if (!program) return []
  if (place && program.data.locations?.[place]) {
    return program.data.locations[place][day] || []
  }
  return program.data.days?.[day] || []
}

/**
 * Места тренировки (Зал/Дом/Улица) — единый источник для конструктора и карточек.
 * Порядок фиксированный: зал → дом → улица. `icon` — имя SVG в assets/ui
 * (рисуется через UiIcon, красится currentColor вместе с текстом тега).
 * Цвет тега/иконки = цвет соответствующего тега (--tag-gym/home/outdoor).
 */
export const PLACES = ['gym', 'home', 'outdoor']
export const PLACE_META = {
  gym:     { key: 'gym',     label: 'Зал',   icon: 'place-gym',    color: 'var(--tag-gym)' },
  home:    { key: 'home',    label: 'Дом',   icon: 'place-home',   color: 'var(--tag-home)' },
  outdoor: { key: 'outdoor', label: 'Улица', icon: 'place-street', color: 'var(--tag-outdoor)' }
}
export function getPlaceMeta(loc) {
  return PLACE_META[loc] || PLACE_META.gym
}

/**
 * Какие места заполнены у программы (есть хоть один непустой день).
 * Берёт из data.locations (кастомная из БД). Возвращает массив ключей в
 * порядке PLACES. Для встроенной силовой (нет locations) — по тегу 'зал', иначе [].
 */
export function getProgramPlaces(program) {
  if (!program) return []
  const locs = program.data?.locations
  if (locs && typeof locs === 'object' && Object.keys(locs).length > 0) {
    return PLACES.filter(loc => {
      const days = locs[loc]
      return days && Object.values(days).some(slots => Array.isArray(slots) && slots.length > 0)
    })
  }
  if ((program.tags || []).includes('зал')) return ['gym']
  return []
}
