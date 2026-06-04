import { getProgramByDbId } from '../features/programs/registry'

function pluralDays(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дня'
  return 'дней'
}

function titleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

// Целых календарных дней назад (по UTC — как и остальные даты в проекте).
function daysAgo(iso) {
  const then = new Date(iso)
  const now = new Date()
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((b - a) / 86400000)
}

// "02.05.26"
export function formatWorkoutDateShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = String(d.getUTCFullYear()).slice(-2)
  return `${dd}.${mm}.${yy}`
}

// Относительно: "Сегодня" | "Вчера" | "N дней назад" | "Очень давно" (90+).
export function formatRelative(iso) {
  if (!iso) return ''
  const n = daysAgo(iso)
  if (n <= 0) return 'Сегодня'
  if (n === 1) return 'Вчера'
  if (n < 90) return `${n} ${pluralDays(n)} назад`
  return 'Очень давно'
}

// "3 дня назад: 30.04.26" — для своего профиля / тапа на себя.
export function formatRelativeWithDate(iso) {
  if (!iso) return ''
  const rel = formatRelative(iso)
  if (rel === 'Очень давно') return rel // для 90+ дату не показываем — незачем
  return `${rel}: ${formatWorkoutDateShort(iso)}`
}

// Иконка раздела + название программы + вариант (день / минуты).
export function describeWorkout(workout) {
  const prog = getProgramByDbId(workout.program_id)
  const isSwim = prog?.kind === 'swim'
  const emoji = isSwim ? '🏊' : '🏋️'
  const title = prog ? titleCase(prog.title) : 'Тренировка'
  const variant = isSwim
    ? `${prog?.data?.durationMin || ''} мин`.trim()
    : `День ${workout.day}`
  return { emoji, title, variant }
}