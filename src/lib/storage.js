/**
 * Универсальная обёртка над хранилищем данных пользователя.
 * Telegram CloudStorage (если доступен) или localStorage (fallback).
 */

import { getLevelFromXP } from './levels'

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
const cloud = tg?.CloudStorage

/* ============================================ */
/* НИЗКОУРОВНЕВЫЕ МЕТОДЫ */
/* ============================================ */

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

/* ============================================ */
/* АКТИВНЫЙ ДЕНЬ ПРОГРАММЫ */
/* ============================================ */

export async function getActiveDay(programId) {
  const lastCompleted = await getItem(`program:${programId}:last_day`)
  if (!lastCompleted) return null
  const cycle = { 'A': 'B', 'B': 'C', 'C': 'A' }
  return cycle[lastCompleted] || 'A'
}

export async function setLastCompletedDay(programId, day) {
  return setItem(`program:${programId}:last_day`, day)
}

/* ============================================ */
/* ЗАКРЕПЫ ПРОГРАММ */
/* ============================================ */

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

/* ============================================ */
/* XP, УРОВЕНЬ, СТРИК */
/* Сейчас заглушки — позже подключим реальные тренировки */
/* ============================================ */

/**
 * Получить общий XP пользователя
 * Пока заглушка возвращает 0 (можно поменять для тестов на 700)
 */
export async function getTotalXP() {
  const raw = await getItem('total_xp')
  return raw ? parseInt(raw, 10) || 0 : 0
}

/**
 * Установить общий XP (для тестов и будущих наград)
 */
export async function setTotalXP(xp) {
  return setItem('total_xp', xp)
}

/**
 * Добавить XP (например после тренировки или квеста)
 */
export async function addXP(amount) {
  const current = await getTotalXP()
  const newTotal = current + amount
  await setTotalXP(newTotal)
  return newTotal
}

/**
 * Получить текущий уровень по XP
 */
export async function getUserLevel() {
  const xp = await getTotalXP()
  return getLevelFromXP(xp)
}

/**
 * Получить серию (стрик) дней подряд
 */
export async function getStreak() {
  const raw = await getItem('streak_days')
  return raw ? parseInt(raw, 10) || 0 : 0
}

export async function setStreak(days) {
  return setItem('streak_days', days)
}

/**
 * Всего тренировок (для статистики)
 */
export async function getTotalWorkouts() {
  const raw = await getItem('total_workouts')
  return raw ? parseInt(raw, 10) || 0 : 0
}

/* ============================================ */
/* НАЗВАНИЕ УРОВНЯ — оставлено для совместимости */
/* Используем getRankByLevel из ./levels вместо этого */
/* ============================================ */

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

/* ============================================ */
/* ОТЛАДКА */
/* ============================================ */

export async function clearAllData() {
  const keys = [
    'pinned_programs',
    'streak_days',
    'total_workouts',
    'total_xp',
    'program:split:last_day'
  ]
  for (const key of keys) await removeItem(key)
}
