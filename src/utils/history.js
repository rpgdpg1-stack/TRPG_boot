import { getProgramByDbId } from '../features/programs/registry'
import { mskParts, mskDayKey } from './dates'

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
 * Короткая подпись выбранного периода — та, что стоит справа в строке значений
 * («7 дней» · «Август» · «2026»). Один источник на главную, экран статистики и
 * карточку профиля, чтобы подписи не разъезжались.
 *
 * У «Всё» — «За всё время»: строка периода теперь стоит отдельным уровнем над
 * цифрами, и пустое место в ней читалось бы как недогруз.
 *
 * `refDate` — какой месяц/год назвать (на экране статистики календарь листается,
 * поэтому это не всегда «сегодня»).
 */
export function periodShortLabel(period, refDate = new Date()) {
  const p = mskParts(refDate.toISOString())
  if (period === 'week') return '7 дней'
  if (period === 'month') return MONTHS_RU[p.m]
  if (period === 'year') return String(p.y)
  return 'За всё время'
}

/**
 * Тот же период — родительным падежом для заглушки «Не тренировался …».
 * Возвращает уточнение в скобках: «(последние 7 дней)», «(Август)», «(2026)».
 */
export function periodHintSuffix(period, refDate = new Date()) {
  if (period === 'week') return ' (последние 7 дней)'
  if (period === 'all') return ''   // «за всё время» уточнять нечем
  return ` (${periodShortLabel(period, refDate)})`
}

/**
 * Разложить ISO-таймстамп на части по МОСКОВСКОМУ времени (UTC+3).
 * Приложение живёт по Москве (лимиты/сутки), поэтому и день, на который падает
 * тренировка, считаем по Москве — сдвигаем на +3ч и читаем UTC-части.
 * Возвращает { y, m (0–11), d, hh, min }.
 */
// Московские компоненты даты и ключ дня живут в utils/dates.js (базовый слой
// календаря) — здесь только реэкспорт, чтобы у экранов не менялся импорт.
export { mskParts, mskDayKey }

// Время по Москве: "10:05".
export function formatTimeMsk(iso) {
  if (!iso) return ''
  const { hh, min } = mskParts(iso)
  return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`
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
const CATEGORY_META = {
  pool: {
    key: 'pool', iconName: 'swimming', color: 'var(--cat-pool)', label: 'Плавание',
    // Роды у разделов разные («силовая была», «заплыв был»), поэтому фразы лежат
    // готовыми, а не склеиваются из label на месте.
    limitTitle: 'Сегодня заплыв уже был',
    limitUnit: '1 заплыв в день'
  },
  cardio: {
    key: 'cardio', iconName: 'cardio', color: 'var(--cat-cardio)', label: 'Кардио',
    limitTitle: 'Сегодня кардио уже было',
    limitUnit: '1 кардио в день'
  },
  stretch: {
    key: 'stretch', iconName: 'stretching', color: 'var(--cat-stretch)', label: 'Растяжка',
    limitTitle: 'Сегодня растяжка уже была',
    limitUnit: '1 растяжка в день'
  },
  strength: {
    key: 'strength', iconName: 'power', color: 'var(--cat-gym)', label: 'Силовая',
    limitTitle: 'Сегодня силовая уже была',
    limitUnit: '1 силовая в день'
  }
}

/**
 * Ключ раздела по самой ПРОГРАММЕ — там, где тренировки ещё нет.
 *
 * Нужен, чтобы предупредить о лимите ДО старта: лимит держится по разделу
 * (одна тренировка в сутки в каждом), и знать раздел надо заранее.
 */
export function programCategoryKey(prog) {
  if (prog?.kind === 'swim' || prog?.category === 'pool') return 'pool'
  if (prog?.category === 'cardio') return 'cardio'
  if (prog?.category === 'stretch') return 'stretch'
  return 'strength'
}

/** Описание раздела по ключу (иконка, цвет, подпись, тексты лимита). */
export function categoryMetaByKey(key) {
  return CATEGORY_META[key] || CATEGORY_META.strength
}

export function workoutCategoryMeta(workout) {
  return categoryMetaByKey(programCategoryKey(getProgramByDbId(workout.program_id)))
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

// Время в сводке статистики: «46 мин» · «1 ч 20 мин» · «2 ч 06 мин» · «3 ч 00 мин».
// Часы и минуты всегда нормализованы (60 минут не бывает — часы берём целочисленным
// делением), при часах минуты двузначные и не пропадают: «3 ч 00 мин», а не «3 ч».
// Дробных часов («1,5 ч») тут больше нет — время стоит в скобках рядом с числом
// тренировок и должно читаться как на секундомере.
export function formatStatTime(min) {
  const total = Math.max(0, Math.round(min || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} мин`
  return `${h} ч ${String(m).padStart(2, '0')} мин`
}

// "750 м" / "1.2 км" — дистанция плавания.
export function formatMeters(m) {
  if (!m) return '0 м'
  if (m < 1000) return `${m} м`
  // Дробная часть — через запятую: в русской типографике десятичный разделитель
  // запятая, точка читается как разделитель разрядов.
  const km = (m / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
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

/**
 * Была ли СЕГОДНЯ (Москва-сутки) засчитанная тренировка этого типа.
 * Нужно, чтобы предупредить о лимите ДО старта второй силовой за день —
 * сервер (`api_finish_workout`) всё равно засчитает только первую.
 */
export function hasWorkoutTodayOfType(workouts, typeKey, now = new Date()) {
  const p = mskParts(now.toISOString())
  const start = mskMidnightMs(p.y, p.m, p.d)
  const end = start + 86400000
  return (workouts || []).some(w => {
    if (!w.finished_at) return false
    const t = new Date(w.finished_at).getTime()
    if (t < start || t >= end) return false
    return workoutCategoryMeta(w).key === typeKey
  })
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

