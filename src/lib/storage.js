/**
 * Хранилище данных пользователя: недельный стрик, последние тренировки,
 * дневные квесты, цикл дней программы, избранная программа категории и
 * полный сброс прогресса.
 */

import { loadPrefs, getPrefSync, setPref, resetPrefs } from './prefs'
import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'
import { EVENTS, emit } from './events'
import { getCurrentWeekKey, getTodayKey } from '../utils/dates'
import { HISTORY_FETCH_LIMIT } from '../utils/history'
import { getAllPrograms, getProgramBySlug } from '../features/programs/registry'
import { cloudGet, cloudRemove } from './cloud-storage'
import { localGet, localSet, localRemove, localRemoveByPrefix } from '../utils/storage'
import { cacheGet, cacheDedupe, cacheSet, cacheInvalidate, TTL } from './cache'
import { reportError } from './report-error'
import { USER_SCOPED_KEYS, USER_SCOPED_PREFIXES } from './storage-keys'
import { recentWorkoutsKey } from './storage-keys'
import { canReadServer, canTrust } from './session'
import { clearQueue } from './offline-queue'
import { pcacheClear } from './persistent-cache'
import { debug } from './debug'
import { goal, GOALS } from './metrika'

function getUserId() {
  return getCurrentUser()?.id || null
}

/* ============================================ */
/* НЕДЕЛЬНЫЙ СТРИК */
/* ============================================ */

export { getCurrentWeekKey } from '../utils/dates'

export async function getWeeklyStreak() {
  const user = getCurrentUser()
  if (!user) return 0
  if (user.weekly_streak_week !== getCurrentWeekKey()) return 0
  return user.weekly_streak || 0
}

/**
 * Последние N завершённых тренировок — для попапа на странице профиля.
 * Возвращает массив { finished_at, program_id, day }, свежие сверху.
 */
export async function getRecentWorkouts(limit = 3) {
  const userId = getUserId()
  if (!userId) return []

  // Кеш в памяти — повторные заходы на Историю/Профиль/Главную мгновенные,
  // без мигания «Загрузка…». Инвалидируется при завершении тренировки
  // (cacheInvalidate('recent-workouts:') в api/sync-engine).
  const cacheKey = recentWorkoutsKey(userId, limit)

  // Без сети или сессии выборка вернётся пустой (RLS не отдаст чужому), и
  // «история пропала» — отдаём сохранённую.
  if (!canReadServer()) return getRecentWorkoutsSync(limit) || []

  // FE-001: экран статистики и вложенный календарь спрашивают историю
  // независимо и в одном кадре. Через cacheDedupe второй получает тот же
  // запрос, а не свой.
  return cacheDedupe(cacheKey, async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select('finished_at, started_at, program_id, day, distance_m')
      .eq('user_id', userId)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(limit)
    if (!canTrust(error)) {
      // FE-007: в боевой сборке консоль никто не читает — отправляем в Sentry.
      if (error) reportError(error, 'storage.getRecentWorkouts')
      // Ошибка/оффлайн — отдаём персист-кеш (localStorage), чтобы не мигало пусто.
      return getRecentWorkoutsSync(limit) || []
    }
    const result = data || []
    cacheSet(cacheKey, result, TTL.MEDIUM)
    try { localSet(cacheKey, JSON.stringify(result)) } catch { /* ignore */ }
    return result
  })
}

/**
 * Синхронно: последние тренировки из кеша (память → localStorage). Персист нужен,
 * чтобы после перезапуска мини-аппа (память пуста) статистика/история открывались
 * сразу своими данными, без мигания пустой заглушки «сделай тренировку».
 *
 * ВАЖНО: значение из localStorage НЕ кладём в кеш памяти. Иначе после завершения
 * тренировки (когда finishWorkout сбросил только память, а localStorage ещё старый)
 * этот старый список попал бы в память как «свежий», и следующий getRecentWorkouts
 * счёл бы его актуальным и не пошёл бы в сеть — новая тренировка не появилась бы
 * в «последней тренировке» профиля и в календаре/статистике. localStorage тут —
 * только для мгновенной отрисовки, сеть всё равно догоняет.
 */
export function getRecentWorkoutsSync(limit = 3) {
  const userId = getUserId()
  if (!userId) return null
  const cacheKey = recentWorkoutsKey(userId, limit)
  const mem = cacheGet(cacheKey)
  if (mem) return mem
  const raw = localGet(cacheKey)
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr
  } catch { /* ignore */ }
  return null
}

/* ============================================ */
/* АКТИВНЫЙ ДЕНЬ ПРОГРАММЫ */
/* ============================================ */

/**
 * Следующий день цикла после lastCompleted, универсально для любой программы.
 * Дни берём из самой программы (Object.keys(data.days)), а не из захардкоженного
 * A/B/C — так новая программа (Full Body и т.д.) заработает без правок здесь.
 * Заворот: последний день → первый. Если программы/дней нет — null.
 */
function nextDayInCycle(programId, lastCompleted) {
  if (!lastCompleted) return null
  const program = getProgramBySlug(programId)
  const days = program?.data?.days ? Object.keys(program.data.days) : []
  if (days.length === 0) return null
  const idx = days.indexOf(lastCompleted)
  if (idx === -1) return days[0]
  return days[(idx + 1) % days.length]
}

// Ключи настроек: последний завершённый день программы и дата, когда его
// засчитали. Дата нужна, чтобы вторая тренировка за сутки не сдвигала цикл.
const lastDayKeyOf = (programId) => `program:${programId}:last_day`
const lastDayDateKeyOf = (programId) => `program:${programId}:last_day_date`

export async function getActiveDay(programId) {
  await loadPrefs()
  return getActiveDaySync(programId)
}

/**
 * Синхронно — для мгновенного старта карточки без мигания «серый→зелёный».
 *
 * Живёт в настройках АККАУНТА: раньше день лежал в облаке Telegram, и в
 * браузере цикл A/B/C начинался заново, будто человек не тренировался.
 */
export function getActiveDaySync(programId) {
  const lastCompleted = getPrefSync(lastDayKeyOf(programId), null)
  return nextDayInCycle(programId, lastCompleted)
}

export async function setLastCompletedDay(programId, day) {
  const today = getTodayKey()

  const lastDayDateKey = lastDayDateKeyOf(programId)
  const lastDayKey = lastDayKeyOf(programId)

  const previousDateRaw = getPrefSync(lastDayDateKey, null)
  const previousDate = previousDateRaw ? String(previousDateRaw).trim() : null

  debug('[setLastCompletedDay] called:', {
    programId,
    day,
    today,
    previousDate,
    willSkip: previousDate === today
  })

  if (previousDate === today) {
    return
  }

  await setPref(lastDayKey, day)
  await setPref(lastDayDateKey, today)

  debug('[setLastCompletedDay] saved:', { lastDayKey: day, lastDayDateKey: today })
}

/* ============================================ */
/* ИЗБРАННЫЕ ПРОГРАММЫ (одна на категорию)      */
/* ============================================ */

const FAVORITES_KEY = 'favorite_programs'

/**
 * Карта «категория → slug закреплённой программы».
 *
 * Читает через cloudGet: сперва localStorage (мгновенно), затем сверяет
 * с CloudStorage Telegram и подтягивает оттуда, если локально пусто.
 * Именно поэтому она ASYNC и экспортируется — главной нужен способ
 * восстановить закрепы, когда localStorage пуст, а облако помнит.
 */
export async function getFavoritePrograms() {
  await loadPrefs()
  const fromAccount = getFavoriteProgramsSync()
  if (Object.keys(fromAccount).length > 0) return fromAccount

  // РАЗОВЫЙ ПЕРЕНОС со старого места. До появления браузерной версии закрепы
  // жили в CloudStorage Telegram; у тех, кто пользовался приложением раньше,
  // они лежат именно там. Молча их потерять нельзя — забираем при первом
  // запуске и кладём в аккаунт, дальше старое место больше не читается.
  try {
    const legacyRaw = await cloudGet(FAVORITES_KEY)
    if (!legacyRaw) return {}
    const legacy = JSON.parse(legacyRaw)
    if (legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0) {
      await setPref(FAVORITES_KEY, legacy)
      debug('[storage] закрепы перенесены из CloudStorage в аккаунт')
      return legacy
    }
  } catch { /* старого нет или оно битое — не беда */ }

  return {}
}

/**
 * Закрепы СИНХРОННО — для первого кадра карусели.
 *
 * Раньше карта лежала в CloudStorage Telegram и в localStorage под общим
 * ключом. В браузере CloudStorage нет вовсе, а общий ключ означал, что чужой
 * аккаунт, открытый в том же браузере, видит ЧУЖИЕ закрепы — именно так
 * у нового человека появилась чужая закреплённая программа. Теперь это
 * настройка аккаунта (см. lib/prefs.js), и она следует за человеком, а не
 * за устройством.
 */
export function getFavoriteProgramsSync() {
  const value = getPrefSync(FAVORITES_KEY, null)
  return (value && typeof value === 'object') ? value : {}
}

export async function getFavoriteProgramByCategory(categoryId) {
  const favorites = await getFavoritePrograms()
  return favorites[categoryId] || null
}

export async function toggleFavoriteProgram(categoryId, programSlug) {
  const favorites = { ...getFavoriteProgramsSync() }
  const wasPinned = favorites[categoryId] === programSlug

  if (wasPinned) delete favorites[categoryId]
  else favorites[categoryId] = programSlug

  await setPref(FAVORITES_KEY, favorites)
  // Считаем только закрепление. Открепление — это не действие «пользуюсь»,
  // а отказ, и в одной цели с закрепом оно бы обнулило смысл цифры.
  if (!wasPinned) goal(GOALS.PROGRAM_PIN, { category: categoryId, program: programSlug })
  return !wasPinned
}


/* ============================================ */
/* СБРОС ДАННЫХ */
/* ============================================ */

export async function clearAllData() {
  const userId = getUserId()

  // ── Сервер. Сначала база, потом локальное: если сброс на сервере не прошёл,
  // локальные данные ещё целы и человек не остался с пустым экраном при живой
  // истории в базе.
  if (userId) {
    // Полный сброс аккаунта одной DEFINER-функцией: история, веса и их
    // история, заметки, замены, любимые, настройки, свои упражнения и
    // программы, идущая сессия, личные данные, приватность, уведомления.
    // Дружбы намеренно НЕ трогает — связь двусторонняя.
    const { error: resetErr } = await supabase.rpc('api_reset_my_progress')
    if (resetErr) {
      reportError(resetErr, 'storage.clearAllData')
      throw resetErr   // экран покажет «не удалось» и НЕ станет чистить локальное
    }
  }

  // ── Локальное. Ровно те же ключи, что снимаются при входе другим аккаунтом
  // (lib/storage-keys.js): один список на оба сценария — «пришёл другой
  // человек» и «этот человек начинает с нуля». Раньше здесь был свой,
  // более короткий перечень, и часть данных сброс переживала.
  try {
    for (const key of USER_SCOPED_KEYS) localRemove(key)
    for (const prefix of USER_SCOPED_PREFIXES) localRemoveByPrefix(prefix)
    localRemove('weekly_streak')
  } catch (e) { /* хранилище недоступно — не критично */ }

  // Старое место хранения (Telegram CloudStorage): часть настроек могла
  // остаться там с прежних версий и вернулась бы при следующем переезде.
  await cloudRemove('pinned_programs')
  await cloudRemove(FAVORITES_KEY)
  for (const prog of getAllPrograms()) {
    await cloudRemove(`program:${prog.slug}:last_day`)
    await cloudRemove(`program:${prog.slug}:last_day_date`)
  }

  cacheInvalidate('')
  // Очередь несинканутых операций: без чистки они уехали бы в базу при
  // следующем синке и вернули часть сброшенного.
  clearQueue()
  pcacheClear()
  // Настройки аккаунта в памяти — иначе экран покажет их до первого чтения.
  resetPrefs()

  if (!userId) return

  const { data } = await supabase.from('users').select('*').eq('id', userId).single()
  if (data) {
    setCurrentUser(data)
    emit(EVENTS.USER_CHANGED, data)
  }
}

/**
 * Когда по этой программе тренировались в последний раз.
 *
 * Источник — история тренировок из базы, а НЕ настройка «последний день».
 * Настройка пишется только когда тренировку завершили через приложение, и
 * у неё другая задача — не засчитать два дня цикла за одни сутки. Карточка
 * же должна отвечать на вопрос «когда я этим занимался», и ответ на него
 * есть в базе всегда: у человека была девятка заплывов, а карточка писала
 * «Ещё не начинали», потому что смотрела не туда.
 *
 * В базе программа записана своим идентификатором (prog_001, swim_001), а
 * в адресах и на карточках живёт короткое имя (split, swim) — переводим одно
 * в другое через реестр. У своих программ идентификатор и имя совпадают.
 */
export function getLastWorkoutDateBySlug(slug) {
  if (!slug) return null
  const prog = getProgramBySlug(slug)
  const programId = prog?.dbId || slug
  const list = getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || []
  // Список уже отсортирован от свежих к старым — первое совпадение и есть
  // последняя тренировка по этой программе.
  const found = list.find(w => w.program_id === programId)
  return found?.finished_at || null
}
