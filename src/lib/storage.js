/**
 * Хранилище данных пользователя: недельный стрик, последние тренировки,
 * дневные квесты, цикл дней программы, избранная программа категории и
 * полный сброс прогресса.
 */

import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'
import { EVENTS, emit } from './events'
import { getCurrentWeekKey, getTodayKey } from '../utils/dates'
import { getAllPrograms, getProgramBySlug } from '../features/programs/registry'
import { cloudGet, cloudSet, cloudRemove } from './cloud-storage'
import { localGet, localSet, localRemove } from '../utils/storage'
import { cacheGet, cacheSet, cacheInvalidate, TTL } from './cache'
import { clearQueue } from './offline-queue'
import { pcacheClear } from './persistent-cache'
import { debug } from './debug'

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
  const cacheKey = `recent-workouts:${userId}:${limit}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const { data, error } = await supabase
    .from('workouts')
    .select('finished_at, started_at, program_id, day, distance_m')
    .eq('user_id', userId)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[storage] getRecentWorkouts error:', error)
    // Ошибка/оффлайн — отдаём персист-кеш (localStorage), чтобы не мигало пусто.
    return getRecentWorkoutsSync(limit) || []
  }
  const result = data || []
  cacheSet(cacheKey, result, TTL.MEDIUM)
  try { localSet(cacheKey, JSON.stringify(result)) } catch { /* ignore */ }
  return result
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
  const cacheKey = `recent-workouts:${userId}:${limit}`
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
/* DAILY QUESTS */
/* ============================================ */

function getDailyQuestsCacheKey() {
  const userId = getUserId()
  return userId ? `daily-quests-cache:${userId}:${getTodayKey()}` : null
}

export function getDailyQuestsSync() {
  const key = getDailyQuestsCacheKey()
  if (!key) return {}

  const raw = localGet(key)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export async function getDailyQuests() {
  const userId = getUserId()
  if (!userId) return {}

  const { data, error } = await supabase
    .from('daily_quests')
    .select('quest_id')
    .eq('user_id', userId)
    .eq('day_key', getTodayKey())

  if (error) {
    console.error('[storage] getDailyQuests error:', error)
    return getDailyQuestsSync()
  }

  const result = {}
  for (const row of data || []) result[row.quest_id] = true

  const key = getDailyQuestsCacheKey()
  if (key) localSet(key, JSON.stringify(result))

  return result
}

/**
 * Выполнить квест. complete_daily_quest возвращает was_new и new_total_muscles
 * (в сигнатуре есть ещё new_badge_rank_index от снятой системы значков — он
 * всегда пустой, не читаем).
 */
export async function completeQuest(questId, reward = 20) {
  const userId = getUserId()
  if (!userId) {
    console.warn('[storage] completeQuest без авторизации')
    return { completed: {}, wasNew: false, newTotalMuscles: 0 }
  }

  const { data, error } = await supabase.rpc('complete_daily_quest', {
    p_user_id: userId,
    p_day_key: getTodayKey(),
    p_quest_id: questId,
    p_reward: reward
  })

  if (error) {
    console.error('[storage] completeQuest error:', error)
    return { completed: await getDailyQuests(), wasNew: false, newTotalMuscles: 0 }
  }

  const result = data?.[0] || data || {}

  if (result.was_new && result.new_total_muscles !== undefined) {
    const u = getCurrentUser()
    if (u) {
      setCurrentUser({ ...u, total_muscles: result.new_total_muscles })
      emit(EVENTS.USER_CHANGED, getCurrentUser())
    }
    cacheInvalidate(`muscle-history:${userId}`)
  }

  const completed = await getDailyQuests()
  return {
    completed,
    wasNew: result.was_new || false,
    newTotalMuscles: result.new_total_muscles || 0
  }
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

export async function getActiveDay(programId) {
  const lastCompleted = await cloudGet(`program:${programId}:last_day`)
  return nextDayInCycle(programId, lastCompleted)
}

/**
 * Синхронно: активный день из localStorage (cloudSet дублирует туда же ключ
 * last_day). Нужен для мгновенного старта карточки без мигания «серый→зелёный» —
 * стартовое значение `useState`, а `getActiveDay` потом догонит из Cloud (кросс-
 * девайс). Первый-первый запуск без локального ключа → null (как и раньше).
 */
export function getActiveDaySync(programId) {
  const lastCompleted = localGet(`program:${programId}:last_day`)
  return nextDayInCycle(programId, lastCompleted)
}

export async function setLastCompletedDay(programId, day) {
  const today = getTodayKey()

  const lastDayDateKey = `program:${programId}:last_day_date`
  const lastDayKey = `program:${programId}:last_day`

  const previousDateRaw = localGet(lastDayDateKey)
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

  await cloudSet(lastDayKey, day)
  await cloudSet(lastDayDateKey, today)

  debug('[setLastCompletedDay] saved:', { lastDayKey: day, lastDayDateKey: today })
}

export async function resetProgramDayCycle(programId) {
  await cloudRemove(`program:${programId}:last_day`)
  await cloudRemove(`program:${programId}:last_day_date`)
}

/* ============================================ */
/* ИЗБРАННЫЕ ПРОГРАММЫ (одна на категорию)      */
/* ============================================ */

const FAVORITES_KEY = 'favorite_programs'

/** Карта «категория → slug избранной программы». Внутренний помощник двух функций ниже. */
async function getFavoritePrograms() {
  const raw = await cloudGet(FAVORITES_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch { return {} }
}

export async function getFavoriteProgramByCategory(categoryId) {
  const favorites = await getFavoritePrograms()
  return favorites[categoryId] || null
}

export async function toggleFavoriteProgram(categoryId, programSlug) {
  const favorites = await getFavoritePrograms()
  const current = favorites[categoryId]
  if (current === programSlug) {
    delete favorites[categoryId]
    await cloudSet(FAVORITES_KEY, JSON.stringify(favorites))
    return false
  } else {
    favorites[categoryId] = programSlug
    await cloudSet(FAVORITES_KEY, JSON.stringify(favorites))
    return true
  }
}


/* ============================================ */
/* СБРОС ДАННЫХ */
/* ============================================ */

export async function clearAllData() {
  const userId = getUserId()

  await cloudRemove('pinned_programs')
  await cloudRemove(FAVORITES_KEY)
  // Чистим ключи цикла дней для ВСЕХ программ (не только split) — иначе после
  // добавления новой программы её last_day переживёт сброс прогресса.
  for (const prog of getAllPrograms()) {
    await cloudRemove(`program:${prog.slug}:last_day`)
    await cloudRemove(`program:${prog.slug}:last_day_date`)
  }

  ;['daily_quests', 'weekly_streak', 'dev_telegram_id'].forEach(localRemove)

  const questsKey = getDailyQuestsCacheKey()
  if (questsKey) localRemove(questsKey)

  cacheInvalidate('')


  // Оффлайн-инфраструктура: чистим очередь несинканутых операций и
  // persistent-кеш дней/весов/упражнений. Иначе после сброса прогресса
  // старые операции могут уехать в БД при следующем синке.
  clearQueue()
  pcacheClear()

  if (!userId) return

  // Сброс прогресса через DEFINER-функцию: обнуляет total_muscles/стрик,
  // чистит muscle_history/daily_quests, историю тренировок
  // (workouts + exercise_sets каскадом), плюс ставит метку
  // last_progress_reset_at. Прямой апдейт users невозможен
  // (колоночная защита от накрутки), поэтому идём через RPC.
  const { error: resetErr } = await supabase.rpc('api_reset_my_progress')
  if (resetErr) {
    console.error('[storage] api_reset_my_progress error:', resetErr)
  }

  const { data } = await supabase.from('users').select('*').eq('id', userId).single()
  if (data) {
    setCurrentUser(data)
    emit(EVENTS.USER_CHANGED, data)
  }
}
