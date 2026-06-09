/**
 * Хранилище данных пользователя.
 *
 * addXP и completeQuest теперь читают new_badge_rank_index из RPC.
 * Если значок выдан — эмитят BADGE_EARNED → модалка появляется сразу.
 */

import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'
import { EVENTS, emit } from './events'
import { getLevelFromXP } from './levels'
import { getCurrentWeekKey, getTodayKey } from '../utils/dates'
import { cloudGet, cloudSet, cloudRemove } from './cloud-storage'
import { localGet, localSet, localRemove } from '../utils/storage'
import { cacheGet, cacheSet, cacheInvalidate, TTL } from './cache'
import { clearQueue } from './offline-queue'
import { pcacheClear } from './persistent-cache'
function getUserId() {
  return getCurrentUser()?.id || null
}

/* ============================================ */
/* МУСКУЛЫ */
/* ============================================ */

export async function getTotalXP() {
  return getCurrentUser()?.total_muscles || 0
}

/**
 * Начислить мускулы. add_muscles теперь возвращает TABLE с двумя полями:
 *   total_muscles — новое общее число мускулов
 *   new_badge_rank_index — rank_index выданного значка или NULL
 *
 * Если значок выдан — эмитим BADGE_EARNED чтобы App.jsx показал модалку сразу.
 */
export async function addXP(amount, source = 'quest', sourceId = null) {
  const userId = getUserId()
  if (!userId) {
    console.warn('[storage] addXP без авторизации')
    return 0
  }

  const { data, error } = await supabase.rpc('add_muscles', {
    p_user_id: userId,
    p_amount: amount,
    p_source: source,
    p_source_id: sourceId
  })

  if (error) {
    console.error('[storage] addXP error:', error)
    return getCurrentUser()?.total_muscles || 0
  }

  // RPC теперь отдаёт массив объектов (TABLE), а не скаляр. Берём первый.
  const row = Array.isArray(data) ? data[0] : data
  const newTotal = row?.total_muscles ?? 0
  const newBadgeRank = row?.new_badge_rank_index ?? null

  const u = getCurrentUser()
  if (u) setCurrentUser({ ...u, total_muscles: newTotal })

  cacheInvalidate(`muscle-history:${userId}`)

  if (newBadgeRank !== null && newBadgeRank !== undefined) {
    console.log('[storage] new badge earned via addXP, rank_index =', newBadgeRank)
    emit(EVENTS.BADGE_EARNED, { rank_index: newBadgeRank })
  }

  return newTotal
}

export async function getUserLevel() {
  return getLevelFromXP(await getTotalXP())
}

export async function getRecentMuscleHistory(limit = 5) {
  const userId = getUserId()
  if (!userId) return []

  const cacheKey = `muscle-history:${userId}:${limit}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_recent_muscle_history', {
      p_user_id: userId,
      p_limit: limit
    })

    if (error) {
      console.warn('[storage] getRecentMuscleHistory RPC error:', error)
      const { data: fb, error: fbErr } = await supabase
        .from('muscle_history')
        .select('amount, source, recorded_at')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(limit)

      if (fbErr) {
        console.error('[storage] getRecentMuscleHistory fallback error:', fbErr)
        return []
      }
      const result = (fb || []).map(r => ({ amount: r.amount, source: r.source, created_at: r.recorded_at }))
      cacheSet(cacheKey, result, TTL.MEDIUM)
      return result
    }

    const result = data || []
    cacheSet(cacheKey, result, TTL.MEDIUM)
    return result
  } catch (e) {
    console.error('[storage] getRecentMuscleHistory exception:', e)
    return []
  }
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

/* ============================================ */
/* СОВМЕСТИМОСТЬ */
/* ============================================ */

export async function getStreak() { return getWeeklyStreak() }

export async function getTotalWorkouts() {
  const userId = getUserId()
  if (!userId) return 0
  const { count, error } = await supabase
    .from('workouts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('finished_at', 'is', null)
  if (error) { console.error('[storage] getTotalWorkouts error:', error); return 0 }
  return count || 0
}

/**
 * Последние N завершённых тренировок — для попапа на странице профиля.
 * Возвращает массив { finished_at, program_id, day }, свежие сверху.
 */
export async function getRecentWorkouts(limit = 3) {
  const userId = getUserId()
  if (!userId) return []
  const { data, error } = await supabase
    .from('workouts')
    .select('finished_at, program_id, day')
    .eq('user_id', userId)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('[storage] getRecentWorkouts error:', error); return [] }
  return data || []
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
 * Выполнить квест. complete_daily_quest теперь возвращает 3 поля:
 *   was_new, new_total_muscles, new_badge_rank_index.
 *
 * Если значок выдан (new_badge_rank_index != null) — эмитим BADGE_EARNED.
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
  const newBadgeRank = result.new_badge_rank_index ?? null

  if (result.was_new && result.new_total_muscles !== undefined) {
    const u = getCurrentUser()
    if (u) {
      setCurrentUser({ ...u, total_muscles: result.new_total_muscles })
      emit(EVENTS.USER_CHANGED, getCurrentUser())
    }
    cacheInvalidate(`muscle-history:${userId}`)
  }

  if (newBadgeRank !== null && newBadgeRank !== undefined) {
    console.log('[storage] new badge earned via quest, rank_index =', newBadgeRank)
    emit(EVENTS.BADGE_EARNED, { rank_index: newBadgeRank })
  }

  const completed = await getDailyQuests()
  return {
    completed,
    wasNew: result.was_new || false,
    newTotalMuscles: result.new_total_muscles || 0
  }
}

/* ============================================ */
/* ЗАКРЕПЫ И АКТИВНЫЙ ДЕНЬ */
/* ============================================ */

export async function getActiveDay(programId) {
  const lastCompleted = await cloudGet(`program:${programId}:last_day`)
  if (!lastCompleted) return null
  const cycle = { 'A': 'B', 'B': 'C', 'C': 'A' }
  return cycle[lastCompleted] || 'A'
}

export async function setLastCompletedDay(programId, day) {
  const today = getTodayKey()

  const lastDayDateKey = `program:${programId}:last_day_date`
  const lastDayKey = `program:${programId}:last_day`

  const previousDateRaw = localGet(lastDayDateKey)
  const previousDate = previousDateRaw ? String(previousDateRaw).trim() : null

  console.log('[setLastCompletedDay] called:', {
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

  console.log('[setLastCompletedDay] saved:', { lastDayKey: day, lastDayDateKey: today })
}

export async function resetProgramDayCycle(programId) {
  await cloudRemove(`program:${programId}:last_day`)
  await cloudRemove(`program:${programId}:last_day_date`)
}

export async function getPinnedPrograms() {
  const raw = await cloudGet('pinned_programs')
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export async function isPinned(programId) {
  return (await getPinnedPrograms()).includes(programId)
}

export async function togglePin(programId) {
  const pinned = await getPinnedPrograms()
  const idx = pinned.indexOf(programId)
  if (idx === -1) pinned.push(programId)
  else pinned.splice(idx, 1)
  await cloudSet('pinned_programs', JSON.stringify(pinned))
  return idx === -1
}

/* ============================================ */
/* ИЗБРАННЫЕ ПРОГРАММЫ (одна на категорию)      */
/* ============================================ */

const FAVORITES_KEY = 'favorite_programs'

export async function getFavoritePrograms() {
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

export async function isFavorite(categoryId, programSlug) {
  const favorites = await getFavoritePrograms()
  return favorites[categoryId] === programSlug
}

// Кеш собранного избранного в памяти модуля — переживает уход/возврат на
// главную и предзагружается при старте приложения (App.jsx), чтобы карточка
// не моргала. Сбрасывается при перезапуске мини-аппа.
let favoritesEntriesCache = null

/**
 * Синхронно вернуть кеш собранного избранного (или null если ещё не грузили).
 * Используется Home для мгновенного старта без чёрного экрана.
 */
export function getFavoritesEntriesCache() {
  return favoritesEntriesCache
}

/**
 * СИНХРОННАЯ сборка избранного напрямую из localStorage (без await/CloudStorage).
 *
 * Зачем: cloudSet дублирует favorite_programs и program:{slug}:last_day в
 * localStorage. Значит при любом запуске кроме самого первого данные уже есть
 * локально и читаются мгновенно. Это даёт картинку без мигания — карточка
 * появляется сразу вместе с остальной главной.
 *
 * buildProgramEntrySync — синхронный колбэк (slug, activeDay) => { prog, activeDay }.
 * Возвращает массив entries или null если в localStorage ничего нет.
 */
export function getFavoritesEntriesSync(buildProgramEntrySync) {
  // Если уже есть собранный кеш в памяти — отдаём его (самый быстрый путь)
  if (favoritesEntriesCache !== null) return favoritesEntriesCache

  const raw = localGet(FAVORITES_KEY)
  if (!raw) return null

  let favMap
  try {
    favMap = JSON.parse(raw)
    if (typeof favMap !== 'object' || favMap === null) return null
  } catch {
    return null
  }

  const entries = []
  for (const [categoryId, slug] of Object.entries(favMap)) {
    // Активный день читаем синхронно из localStorage (cloudSet туда пишет).
    const lastDay = localGet(`program:${slug}:last_day`)
    const cycle = { A: 'B', B: 'C', C: 'A' }
    const activeDay = lastDay ? (cycle[lastDay] || 'A') : null

    const built = buildProgramEntrySync(slug, activeDay)
    if (built) entries.push({ ...built, categoryId })
  }

  // Кладём в кеш памяти — дальше уже будет отдаваться мгновенно
  favoritesEntriesCache = entries
  return entries
}

/**
 * Собрать полные данные избранного: для каждой категории берём slug,
 * подтягиваем программу и её активный день. Кешируем результат.
 *
 * buildProgramEntry — колбэк (slug) => { prog, activeDay }, передаётся из Home
 * чтобы не тащить registry-зависимости в storage.
 */
export async function loadFavoritesEntries(buildProgramEntry) {
  const favMap = await getFavoritePrograms()
  const entries = []
  for (const [categoryId, slug] of Object.entries(favMap)) {
    const built = await buildProgramEntry(slug)
    if (built) entries.push({ ...built, categoryId })
  }
  favoritesEntriesCache = entries
  return entries
}

/* ============================================ */
/* СБРОС ДАННЫХ */
/* ============================================ */

export async function clearAllData() {
  const userId = getUserId()

  await cloudRemove('pinned_programs')
  await cloudRemove(FAVORITES_KEY)
  await cloudRemove('program:split:last_day')
  await cloudRemove('program:split:last_day_date')

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

  // Сброс прогресса через DEFINER-функцию: обнуляет total_muscles/стрик и
  // чистит свои muscle_history/daily_quests/league_badges. Прямой апдейт users
  // больше невозможен (колоночная защита от накрутки), поэтому идём через RPC.
  // Значки чистим тоже — чтобы при следующем тапе квеста снова появилась
  // модалка той лиги, до которой быстро добежишь.
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

/**
 * Дев-сброс ТОЛЬКО значков лиг. Не трогает мускулы, стрик, историю.
 * Используется кнопкой в настройках чтобы тестировать модалки на одном аккаунте.
 */
export async function devResetBadgesOnly() {
  const userId = getUserId()
  if (!userId) return false

  try {
    const { error } = await supabase.rpc('api_dev_reset_user_badges', {
      p_user_id: userId
    })
    if (error) {
      console.error('[storage] devResetBadgesOnly RPC error:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('[storage] devResetBadgesOnly exception:', e)
    return false
  }
}