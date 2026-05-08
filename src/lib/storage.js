/**
 * Универсальная обёртка над хранилищем данных пользователя.
 *
 * НОВОЕ в Порции В:
 * - getWeeklyStreak / setWeeklyStreak / addWorkoutToWeek для огоньков серии
 * - getCurrentWeekKey — ключ недели для сброса по понедельникам в 03:00 МСК
 */

import { getLevelFromXP } from './levels'

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
const cloud = tg?.CloudStorage

/* НИЗКОУРОВНЕВЫЕ МЕТОДЫ */

function getItem(key) {
  return new Promise((resolve) => {
    if (cloud) {
      cloud.getItem(key, (err, value) => {
        if (err) { console.warn('CloudStorage error:', err); resolve(null); return }
        resolve(value || null)
      })
    } else {
      try { resolve(localStorage.getItem(key)) } catch { resolve(null) }
    }
  })
}

function setItem(key, value) {
  return new Promise((resolve) => {
    if (cloud) {
      cloud.setItem(key, String(value), (err) => resolve(!err))
    } else {
      try { localStorage.setItem(key, String(value)); resolve(true) } catch { resolve(false) }
    }
  })
}

function removeItem(key) {
  return new Promise((resolve) => {
    if (cloud) {
      cloud.removeItem(key, () => resolve(true))
    } else {
      try { localStorage.removeItem(key); resolve(true) } catch { resolve(false) }
    }
  })
}

/* АКТИВНЫЙ ДЕНЬ ПРОГРАММЫ */

export async function getActiveDay(programId) {
  const lastCompleted = await getItem(`program:${programId}:last_day`)
  if (!lastCompleted) return null
  const cycle = { 'A': 'B', 'B': 'C', 'C': 'A' }
  return cycle[lastCompleted] || 'A'
}

export async function setLastCompletedDay(programId, day) {
  return setItem(`program:${programId}:last_day`, day)
}

/* ЗАКРЕПЫ ПРОГРАММ */

export async function getPinnedPrograms() {
  const raw = await getItem('pinned_programs')
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export async function isPinned(programId) {
  const pinned = await getPinnedPrograms()
  return pinned.includes(programId)
}

export async function togglePin(programId) {
  const pinned = await getPinnedPrograms()
  const idx = pinned.indexOf(programId)
  if (idx === -1) pinned.push(programId)
  else pinned.splice(idx, 1)
  await setItem('pinned_programs', JSON.stringify(pinned))
  return idx === -1
}

/* МУСКУЛЫ (бывший XP), УРОВЕНЬ, СТАРЫЙ ДНЕВНОЙ СТРИК */

export async function getTotalXP() {
  const raw = await getItem('total_xp')
  return raw ? parseInt(raw, 10) || 0 : 0
}

export async function setTotalXP(xp) {
  return setItem('total_xp', xp)
}

export async function addXP(amount) {
  const current = await getTotalXP()
  const newTotal = current + amount
  await setTotalXP(newTotal)
  return newTotal
}

export async function getUserLevel() {
  const xp = await getTotalXP()
  return getLevelFromXP(xp)
}

// Старый дневной стрик — оставляем для совместимости с Progress.jsx
export async function getStreak() {
  const raw = await getItem('streak_days')
  return raw ? parseInt(raw, 10) || 0 : 0
}

export async function setStreak(days) {
  return setItem('streak_days', days)
}

export async function getTotalWorkouts() {
  const raw = await getItem('total_workouts')
  return raw ? parseInt(raw, 10) || 0 : 0
}

/* НЕДЕЛЬНЫЙ СТРИК — для огоньков на Главной (Порция В) */

/**
 * Ключ текущей недели (понедельник 03:00 МСК — начало).
 * Возвращает строку вида "2026-W19".
 *
 * Как работает: смещаемся на -3 часа (3:00 МСК), потом находим понедельник этой недели.
 */
export function getCurrentWeekKey() {
  const now = new Date()
  // Сдвиг на -3 часа: до 3:00 МСК неделя считается "прошлой"
  now.setHours(now.getHours() - 3)

  // Находим понедельник
  const day = now.getDay() // 0=вс, 1=пн ... 6=сб
  const diff = day === 0 ? -6 : 1 - day // сдвиг до понедельника
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)

  // Формат YYYY-MM-DD
  return monday.toISOString().split('T')[0]
}

/**
 * Получить количество тренировок за текущую неделю.
 * Если неделя сменилась — автоматически сбрасывается.
 *
 * Демо-режим: если в хранилище ничего нет, возвращаем 1
 * (чтобы один огонёк уже горел, как договаривались).
 */
export async function getWeeklyStreak() {
  const raw = await getItem('weekly_streak')
  if (!raw) return 1 // демо-значение

  try {
    const data = JSON.parse(raw)
    const currentWeek = getCurrentWeekKey()
    if (data.week !== currentWeek) {
      // Неделя сменилась — сбрасываем
      return 0
    }
    return data.count || 0
  } catch {
    return 1 // на ошибку парсинга — тоже демо
  }
}

/**
 * Установить значение недельного стрика напрямую (для отладки/демо).
 */
export async function setWeeklyStreak(count) {
  const week = getCurrentWeekKey()
  return setItem('weekly_streak', JSON.stringify({ week, count }))
}

/**
 * Прибавить +1 тренировку к недельному стрику.
 * Вызывается когда пользователь завершает тренировку (пока негде, но логика готова).
 */
export async function addWorkoutToWeek() {
  const current = await getWeeklyStreak()
  const next = Math.min(current + 1, 4) // лимит 4
  await setWeeklyStreak(next)
  return next
}

/* DAILY QUESTS (буcты дня) */

export async function getDailyQuests() {
  const raw = await getItem('daily_quests')
  if (!raw) return {}
  try {
    const data = JSON.parse(raw)
    const today = getTodayKey()
    if (data.date !== today) return {}
    return data.completed || {}
  } catch {
    return {}
  }
}

export async function completeQuest(questId) {
  const today = getTodayKey()
  const completed = await getDailyQuests()
  completed[questId] = true
  await setItem('daily_quests', JSON.stringify({ date: today, completed }))
  return completed
}

/**
 * Ключ дня для сброса квестов в 3:00 МСК
 */
function getTodayKey() {
  const now = new Date()
  now.setHours(now.getHours() - 3)
  return now.toISOString().split('T')[0]
}

/* НАЗВАНИЕ УРОВНЯ — для совместимости со старым Progress.jsx */

export function getLevelName(level) {
  if (level >= 31) return 'БЕССМЕРТНЫЙ'
  if (level >= 28) return 'АХИЛЛ'
  if (level >= 25) return 'ЛЕГЕНДА'
  if (level >= 22) return 'ТИТАН'
  if (level >= 19) return 'ГЕРАКЛ'
  if (level >= 16) return 'ЦЕНТУРИОН'
  if (level >= 13) return 'ВИТЯЗЬ'
  if (level >= 10) return 'БОЕЦ'
  if (level >= 7)  return 'АТЛЕТ'
  if (level >= 4)  return 'СПОРТСМЕН'
  return 'НОВОБРАНЕЦ'
}

/* ОТЛАДКА */

export async function clearAllData() {
  const keys = [
    'pinned_programs',
    'streak_days',
    'total_workouts',
    'total_xp',
    'daily_quests',
    'weekly_streak',
    'program:split:last_day'
  ]
  for (const key of keys) await removeItem(key)
}
