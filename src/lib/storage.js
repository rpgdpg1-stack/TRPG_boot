/**
 * Универсальная обёртка над хранилищем данных пользователя.
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

/* XP, УРОВЕНЬ, СТРИК */

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

/* DAILY QUESTS — для Порции Б */

/**
 * Получить состояние ежедневных квестов на сегодня.
 * Возвращает объект { questId: true/false, ... }
 */
export async function getDailyQuests() {
  const raw = await getItem('daily_quests')
  if (!raw) return {}
  try {
    const data = JSON.parse(raw)
    // Проверяем что это сегодня (если другой день — сбрасываем)
    const today = getTodayKey()
    if (data.date !== today) return {}
    return data.completed || {}
  } catch {
    return {}
  }
}

/**
 * Отметить квест выполненным
 */
export async function completeQuest(questId) {
  const today = getTodayKey()
  const completed = await getDailyQuests()
  completed[questId] = true
  await setItem('daily_quests', JSON.stringify({ date: today, completed }))
  return completed
}

/**
 * Ключ дня для сброса квестов в 3:00 МСК
 * Пока упрощённо — берём текущий день, сброс по локальному времени
 */
function getTodayKey() {
  const now = new Date()
  // 3 часа ночи МСК = смещение -3 часа
  now.setHours(now.getHours() - 3)
  return now.toISOString().split('T')[0]
}

/* НАЗВАНИЕ УРОВНЯ — для совместимости */

export function getLevelName(level) {
  if (level >= 50) return 'БЕССМЕРТНЫЙ'
  if (level >= 45) return 'АХИЛЛ'
  if (level >= 40) return 'ЛЕГЕНДА'
  if (level >= 35) return 'ТИТАН'
  if (level >= 30) return 'ГЕРАКЛ'
  if (level >= 25) return 'ЦЕНТУРИОН'
  if (level >= 20) return 'ВИТЯЗЬ'
  if (level >= 15) return 'БОЕЦ'
  if (level >= 10) return 'АТЛЕТ'
  if (level >= 5) return 'СПОРТСМЕН'
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
    'program:split:last_day'
  ]
  for (const key of keys) await removeItem(key)
}
