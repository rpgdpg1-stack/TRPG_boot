/**
 * Универсальная обёртка над хранилищем данных пользователя.
 *
 * Сейчас использует Telegram CloudStorage (если доступен) или localStorage (fallback для браузера/тестов).
 * В будущем можем поменять на Supabase — изменится ТОЛЬКО этот файл.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
const cloud = tg?.CloudStorage

/**
 * Низкоуровневые методы — get/set/remove
 * Возвращают Promise, чтобы единообразно работать с CloudStorage и localStorage
 */

function getItem(key) {
  return new Promise((resolve) => {
    if (cloud) {
      cloud.getItem(key, (err, value) => {
        if (err) {
          console.warn('CloudStorage getItem error:', err)
          resolve(null)
          return
        }
        resolve(value || null)
      })
    } else {
      // Fallback на localStorage
      try {
        resolve(localStorage.getItem(key))
      } catch {
        resolve(null)
      }
    }
  })
}

function setItem(key, value) {
  return new Promise((resolve) => {
    if (cloud) {
      cloud.setItem(key, String(value), (err) => {
        resolve(!err)
      })
    } else {
      try {
        localStorage.setItem(key, String(value))
        resolve(true)
      } catch {
        resolve(false)
      }
    }
  })
}

function removeItem(key) {
  return new Promise((resolve) => {
    if (cloud) {
      cloud.removeItem(key, () => resolve(true))
    } else {
      try {
        localStorage.removeItem(key)
        resolve(true)
      } catch {
        resolve(false)
      }
    }
  })
}

/* ============================================ */
/* ВЫСОКОУРОВНЕВЫЕ МЕТОДЫ — для использования в коде */
/* ============================================ */

/**
 * Активный день программы (A / B / C)
 * Логика: следующий после последнего завершённого
 */
export async function getActiveDay(programId) {
  const lastCompleted = await getItem(`program:${programId}:last_day`)

  if (!lastCompleted) return null // ни одной тренировки ещё не было

  // Цикл A → B → C → A
  const cycle = { 'A': 'B', 'B': 'C', 'C': 'A' }
  return cycle[lastCompleted] || 'A'
}

/**
 * Сохранить последний завершённый день программы
 */
export async function setLastCompletedDay(programId, day) {
  return setItem(`program:${programId}:last_day`, day)
}

/**
 * Закрепы программ — управление через Set
 */
export async function getPinnedPrograms() {
  const raw = await getItem('pinned_programs')
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function isPinned(programId) {
  const pinned = await getPinnedPrograms()
  return pinned.includes(programId)
}

export async function togglePin(programId) {
  const pinned = await getPinnedPrograms()
  const idx = pinned.indexOf(programId)

  if (idx === -1) {
    pinned.push(programId)
  } else {
    pinned.splice(idx, 1)
  }

  await setItem('pinned_programs', JSON.stringify(pinned))
  return idx === -1 // true если закрепили, false если открепили
}

/**
 * Стрик и уровень — пока заглушки, заполним когда будут реальные тренировки
 */
export async function getStreak() {
  const raw = await getItem('streak_days')
  return raw ? parseInt(raw, 10) || 0 : 0
}

export async function getTotalWorkouts() {
  const raw = await getItem('total_workouts')
  return raw ? parseInt(raw, 10) || 0 : 0
}

export async function getUserLevel() {
  // Формула: каждые 5 тренировок = новый уровень. Пока заглушка возвращает 1.
  // Будем использовать когда подключим логику завершения тренировок.
  const total = await getTotalWorkouts()
  return Math.floor(total / 5) + 1
}

/**
 * Название уровня по числу
 * Пока заглушка — позже доработаем формулу с пользователем
 */
export function getLevelName(level) {
  if (level >= 50) return 'GOD MODE'
  if (level >= 20) return 'LEGEND'
  if (level >= 10) return 'BEAST'
  if (level >= 5) return 'WARRIOR'
  if (level >= 3) return 'ATHLETE'
  if (level >= 2) return 'ROOKIE'
  return 'NEWBIE'
}

/**
 * Очистка всех данных пользователя (для отладки/теста)
 */
export async function clearAllData() {
  const keys = [
    'pinned_programs',
    'streak_days',
    'total_workouts',
    'program:split:last_day'
  ]
  for (const key of keys) {
    await removeItem(key)
  }
}
