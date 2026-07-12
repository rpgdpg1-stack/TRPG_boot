import { getProgramByDbId } from '../features/programs/registry'
import { MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'

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

/* ============================================ */
/* Календарь истории (месячная сетка)           */
/* ============================================ */

// Названия месяцев (именительный — для заголовка «Июль 2026»).
export const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

// Дни недели, понедельник первым (как принято в РФ).
export const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/**
 * Разложить ISO-таймстамп на части по МОСКОВСКОМУ времени (UTC+3).
 * Приложение живёт по Москве (лимиты/сутки), поэтому и день, на который падает
 * тренировка, считаем по Москве — сдвигаем на +3ч и читаем UTC-части.
 * Возвращает { y, m (0–11), d, hh, min }.
 */
export function mskParts(iso) {
  const shifted = new Date(new Date(iso).getTime() + 3 * 3600 * 1000)
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    min: shifted.getUTCMinutes()
  }
}

// Ключ дня по Москве: "2026-07-06".
export function mskDayKey(iso) {
  const { y, m, d } = mskParts(iso)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Время по Москве: "10:05".
export function formatTimeMsk(iso) {
  if (!iso) return ''
  const { hh, min } = mskParts(iso)
  return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`
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

// Описание тренировки для строки истории.
// Силовая: название + буква дня (без слова «День»). Заплыв: название уже
// содержит минуты («Заплыв 45»), отдельный вариант не нужен.
// iconName — имя SVG из assets/ui (через UiIcon), вместо эмодзи.
export function describeWorkout(workout) {
  const prog = getProgramByDbId(workout.program_id)
  const isSwim = prog?.kind === 'swim'

  if (isSwim) {
    const min = prog?.data?.durationMin
    return {
      iconName: 'swimming',
      title: `Заплыв${min ? ` ${min}` : ''}`,
      variant: ''
    }
  }

  // Кастомную программу показываем как ввёл юзер (его регистр), встроенную —
  // нормализуем (Первая заглавная). Та же развилка, что на карточке категории.
  const title = prog
    ? (prog.source === 'custom' ? prog.title : titleCase(prog.title))
    : 'Тренировка'

  return {
    iconName: 'power',
    title,
    variant: workout.day || ''
  }
}
/**
 * Категория тренировки для календаря/сводки: иконка (SVG из assets/ui), цвет
 * раздела и человекочитаемый лейбл. Силовая (gym и любая своя силовая) → power/зелёный,
 * плавание → swimming/pool, кардио/растяжка — свои цвета. Fallback — силовая.
 */
export function workoutCategoryMeta(workout) {
  const prog = getProgramByDbId(workout.program_id)
  const cat = prog?.category
  if (prog?.kind === 'swim' || cat === 'pool') {
    return { key: 'pool', iconName: 'swimming', color: 'var(--cat-pool)', label: 'Плавание' }
  }
  if (cat === 'cardio') {
    return { key: 'cardio', iconName: 'cardio', color: 'var(--cat-cardio)', label: 'Кардио' }
  }
  if (cat === 'stretch') {
    return { key: 'stretch', iconName: 'stretching', color: 'var(--cat-stretch)', label: 'Растяжка' }
  }
  return { key: 'strength', iconName: 'power', color: 'var(--color-primary)', label: 'Силовая' }
}

// Порядок разделов в сводке месяца.
export const CATEGORY_ORDER = ['strength', 'pool', 'cardio', 'stretch']

/* ============================================ */
/* Метрики за период (для карточки главной и экрана Истории) */
/* ============================================ */

// Длительность тренировки в минутах из started_at/finished_at. Работает и для
// силовой (started_at = старт сессии), и для заплыва (синтетический started_at,
// см. finishWorkout). Нет пары / меньше минуты → 0.
export function workoutMinutes(w) {
  if (!w?.started_at || !w?.finished_at) return 0
  const diff = Math.round((new Date(w.finished_at) - new Date(w.started_at)) / 60000)
  return diff >= 1 ? diff : 0
}

// "45 мин" / "1 ч 20 мин" / "2 ч".
export function formatDuration(min) {
  if (!min || min < 1) return '0 мин'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} мин`
  if (m === 0) return `${h} ч`
  return `${h} ч ${m} мин`
}

// "750 м" / "1.2 км" — дистанция плавания.
export function formatMeters(m) {
  if (!m) return '0 м'
  if (m < 1000) return `${m} м`
  const km = (m / 1000).toFixed(2).replace(/\.?0+$/, '')
  return `${km} км`
}

// Полночь МСК даты (y,m,d) как реальный UTC-таймстамп (мс). Москва = UTC+3, значит
// её полночь наступает в 21:00 UTC предыдущих суток. Date.UTC нормализует overflow
// по дню/месяцу (можно передавать d-dow < 1 или m+1 == 12).
function mskMidnightMs(y, m, d) {
  return Date.UTC(y, m, d) - 3 * 3600 * 1000
}

// Сколько последних тренировок тянуть с сервера для истории/статистики. Вся история
// хранится в БД (запись на тренировку, ничего не удаляется) — берём с большим запасом,
// чтобы фильтр «Всё время» считался по всем данным (2600 тренировок ≈ 10 лет по 5/нед).
export const HISTORY_FETCH_LIMIT = 5000

// Границы периода по Москве [startMs, endMs) для сравнения с finished_at.
// period: 'week' (Пн–Вс) | 'month' | 'year' | 'all' (вся история).
export function periodRange(period, now = new Date()) {
  if (period === 'all') return [0, Number.MAX_SAFE_INTEGER]
  const p = mskParts(now.toISOString())
  if (period === 'year') return [mskMidnightMs(p.y, 0, 1), mskMidnightMs(p.y + 1, 0, 1)]
  if (period === 'month') return [mskMidnightMs(p.y, p.m, 1), mskMidnightMs(p.y, p.m + 1, 1)]
  // Неделя с понедельника (как принято в РФ), по МСК.
  const dow = (new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay() + 6) % 7
  const start = mskMidnightMs(p.y, p.m, p.d - dow)
  return [start, start + 7 * 86400000]
}

// Сводка завершённых тренировок за период: общий счёт/время + разбивка по типам
// (`byType[key] = { count, minutes, distance }`, key из workoutCategoryMeta:
// strength/pool/cardio/stretch). Общий для карточки истории на главной и блока
// статистики. Разбивка растёт сама при появлении новых типов — UI ничего не ломает.
export function summarizeWorkouts(workouts, period, now = new Date()) {
  const [start, end] = periodRange(period, now)
  let count = 0
  let minutes = 0
  const byType = {}
  for (const w of workouts || []) {
    if (!w.finished_at) continue
    const t = new Date(w.finished_at).getTime()
    if (t < start || t >= end) continue
    const key = workoutCategoryMeta(w).key
    const mins = workoutMinutes(w)
    count++
    minutes += mins
    const b = (byType[key] ||= { count: 0, minutes: 0, distance: 0 })
    b.count++
    b.minutes += mins
    b.distance += w.distance_m || 0
  }
  return { count, minutes, byType }
}

/**
 * Уникальные группы мышц дня программы — для тегов в истории и в дне.
 * Возвращает [{ key, label, color }] в порядке появления, без дублей.
 * Только для силовых (по дням A/B/C). Для заплыва — пустой массив.
 */
// Ручной набор групп для дней, где автонабор не отражает суть тренировки.
// Например день B по слотам начинается с груди и плеч, но трицепс — ключевая
// группа дня, поэтому показываем именно Грудь + Трицепс.
const DAY_TAGS_OVERRIDE = {
  prog_001: {
    B: ['chest', 'triceps']
  }
}

export function getDayMuscleTags(programId, day) {
  const prog = getProgramByDbId(programId)
  if (!prog || prog.kind === 'swim') return []

  const toTag = (key) => ({
    key,
    label: titleCase(MUSCLE_GROUP_LABELS[key] || key),
    color: getMuscleGroupColors(key).tag
  })

  // Ручной оверрайд для конкретного дня
  const override = DAY_TAGS_OVERRIDE[prog.dbId]?.[day]
  if (override) return override.map(toTag)

  const slots = prog.data?.days?.[day] || []
  const seen = new Set()
  const tags = []
  for (const s of slots) {
    const key = s.muscle_group
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(toTag(key))
  }
  return tags.slice(0, 2)
}