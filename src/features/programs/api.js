/**
 * Логика загрузки и завершения тренировки.
 *
 * ОФФЛАЙН:
 *  - getWorkoutDay: второй уровень кеша (persistent-cache в localStorage).
 *    Память → localStorage → сеть. Без сети день открывается из localStorage
 *    (можно зайти в зале с нуля после перезапуска Telegram).
 *  - finishWorkout: без сети кладёт завершение в очередь (с моментом завершения
 *    в createdAt) и возвращает { offline: true }. sync-engine отправит позже
 *    с правильным p_finished_at.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser, setCurrentUser } from '../../lib/auth'
import { EVENTS, emit } from '../../lib/events'
import { getCurrentWeekKey } from '../../utils/dates'
import { getProgramBySlug, getProgramDaySlots } from './registry'
import { cacheGet, cacheSet, cacheInvalidate, TTL, runWhenIdle } from '../../lib/cache'
import { pcacheGet, pcacheSet } from '../../lib/persistent-cache'
import { isOnline, checkNow } from '../../lib/network-status'
import { enqueue, finishDedupKey } from '../../lib/offline-queue'

// Сколько ждём ответ RPC завершения, прежде чем счесть сеть мёртвой и уйти в
// оффлайн-очередь. Supabase-клиент сам не таймаутит, а в зале Wi-Fi часто
// «живой» для navigator.onLine, но без реального доступа в интернет — без
// этого экран «Сохранение…» висел бы бесконечно.
const FINISH_TIMEOUT_MS = 7000

async function loadAllExercises() {
  const cacheKey = 'exercises:all'
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  // Persistent-кеш — переживает перезапуск, нужен для оффлайна
  const pcached = pcacheGet(cacheKey)
  if (pcached) {
    cacheSet(cacheKey, pcached, TTL.SESSION)
    // Если онлайн — в фоне обновим из сети (не блокируя)
    if (isOnline()) {
      runWhenIdle(() => refreshAllExercises())
    }
    return pcached
  }

  return refreshAllExercises()
}

/**
 * Перечитать все упражнения из сети и записать в оба кеша.
 * Вынесено отдельно чтобы звать и напрямую, и из фонового обновления.
 */
async function refreshAllExercises() {
  const cacheKey = 'exercises:all'
  let exercises = []

  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data?.length) {
      exercises = data
    }
  } catch (e) {
    console.warn('[programs] api_get_all_exercises failed:', e?.message)
  }

  if (!exercises.length) {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, sub_group, type, meta_info, preview_url, video_url, priority')
        .order('priority', { ascending: true })
      if (!error && data?.length) {
        exercises = data
      }
    } catch (e) {
      console.warn('[programs] direct select exercises failed:', e?.message)
    }
  }

  if (exercises.length) {
    cacheSet(cacheKey, exercises, TTL.SESSION)
    pcacheSet(cacheKey, exercises) // в persistent на 7 дней
  }

  return exercises
}

async function loadUserSwaps(userId, dbId, day, place = 'gym') {
  // Место входит в ключ кеша — свапы Зал/Дом/Улица кешируются раздельно.
  const cacheKey = `user-swaps:${userId}:${dbId}:${place}:${day}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const pcached = pcacheGet(cacheKey)
  if (pcached && !isOnline()) {
    return pcached
  }

  let swapsByOrder = {}
  try {
    const { data: swaps, error } = await supabase.rpc('api_get_user_swaps', {
      p_user_id: userId,
      p_program_id: dbId,
      p_day: day,
      p_location: place
    })
    if (!error && swaps) {
      for (const s of swaps) swapsByOrder[s.order_num] = s.exercise_id
    }
  } catch (e) {
    console.warn('[programs] swaps fetch failed:', e?.message)
    // Сеть упала — пробуем persistent
    if (pcached) return pcached
  }

  cacheSet(cacheKey, swapsByOrder, TTL.LONG)
  pcacheSet(cacheKey, swapsByOrder)
  return swapsByOrder
}

async function loadUserWeights(userId) {
  const cacheKey = `user-weights:${userId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const pcached = pcacheGet(cacheKey)
  if (pcached && !isOnline()) {
    return pcached
  }

  let weightsByEx = {}
  try {
    const { data: weights, error } = await supabase.rpc('api_get_user_weights', {
      p_user_id: userId
    })
    if (!error && weights) {
      for (const w of weights) weightsByEx[w.exercise_id] = w.weight_kg
    }
  } catch (e) {
    console.warn('[programs] weights fetch failed:', e?.message)
    if (pcached) return pcached
  }

  cacheSet(cacheKey, weightsByEx, TTL.LONG)
  pcacheSet(cacheKey, weightsByEx)
  return weightsByEx
}

export async function getWorkoutDay(programSlug, day, place = null) {
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] no user, returning []')
    return []
  }

  const program = getProgramBySlug(programSlug)
  if (!program) {
    console.warn('[programs] unknown program slug:', programSlug)
    return []
  }
  const dbId = program.dbId

  // Место входит в ключ кеша — наборы Зал/Дом/Улица кешируются раздельно.
  const placeKey = place || 'gym'
  const dayCacheKey = `workout-day:${user.id}:${programSlug}:${placeKey}:${day}`
  const cachedDay = cacheGet(dayCacheKey)
  if (cachedDay) {
    schedulePrefetch(programSlug, day, user.id)
    return cachedDay
  }

  // Persistent-кеш собранного дня: без сети отдаём его сразу (зал, перезапуск)
  const pcachedDay = pcacheGet(dayCacheKey)
  if (pcachedDay && !isOnline()) {
    cacheSet(dayCacheKey, pcachedDay, TTL.MEDIUM)
    return pcachedDay
  }

  const slotsRaw = getProgramDaySlots(programSlug, day, place)
  if (!slotsRaw.length) return []

  const [swapsByOrder, exercises, weightsByEx] = await Promise.all([
    loadUserSwaps(user.id, dbId, day, placeKey),
    loadAllExercises(),
    loadUserWeights(user.id)
  ])

  const exById = {}
  for (const e of exercises) exById[e.id] = e

  const result = slotsRaw.map(slot => {
    // Свап применяем ТОЛЬКО если он валиден для слота: упражнение есть в каталоге
    // и совпадает по подгруппе+типу со слотом. Иначе это устаревший свап — после
    // правки/перестановки программы в конструкторе order_num сместились, и свап
    // (привязан к order_num) попал бы в чужой слот: упражнение другой группы
    // (напр. гиперэкстензия-спина) затесалось бы в шею. В таком случае
    // показываем default из конструктора — упражнения живут строго по группе.
    const swapId = swapsByOrder[slot.order_num]
    const swapEx = swapId ? exById[swapId] : null
    const swapValid = !!swapEx && swapEx.sub_group === slot.sub_group && swapEx.type === slot.type

    let exerciseId = swapValid ? swapId : null
    let isSwapped = swapValid

    if (!exerciseId) {
      exerciseId = slot.default_exercise_id || null
    }

    if (!exerciseId || !exById[exerciseId]) {
      const candidates = exercises.filter(
        e => e.sub_group === slot.sub_group && e.type === slot.type
      )
      exerciseId = candidates[0]?.id || exerciseId
    }

    const ex = exerciseId ? exById[exerciseId] : null
    const fallbackName = `${slot.sub_group} (${slot.type})`

    return {
      order_num: slot.order_num,
      muscle_group: slot.muscle_group,
      sub_group: slot.sub_group,
      type: slot.type,
      exercise_id: exerciseId,
      exercise_name: ex?.name || fallbackName,
      meta_info: ex?.meta_info || '3 × 8-12',
      preview_url: ex?.preview_url || null,
      video_url: ex?.video_url || null,
      is_swapped: isSwapped,
      user_weight_kg: weightsByEx[exerciseId] ?? null
    }
  })

  cacheSet(dayCacheKey, result, TTL.MEDIUM)
  pcacheSet(dayCacheKey, result) // переживает перезапуск для оффлайна

  schedulePrefetch(programSlug, day, user.id, place)

  return result
}

function schedulePrefetch(programSlug, currentDay, userId, place = null) {
  const program = getProgramBySlug(programSlug)
  if (!program) return

  const placeKey = place || 'gym'
  // Дни берём для текущего места (фолбэк на «Зал»/data.days).
  const dayMap = (place && program.data.locations?.[place]) || program.data.days || {}
  const days = Object.keys(dayMap)
  const idx = days.indexOf(currentDay)
  if (idx === -1) return

  const prev = idx > 0 ? days[idx - 1] : days[days.length - 1]
  const next = idx < days.length - 1 ? days[idx + 1] : days[0]

  const neighbours = [prev, next].filter(d => d !== currentDay)

  for (const d of neighbours) {
    const key = `workout-day:${userId}:${programSlug}:${placeKey}:${d}`
    if (cacheGet(key)) continue

    runWhenIdle(() => {
      getWorkoutDay(programSlug, d, place).catch(e => {
        console.warn('[programs] prefetch failed for day', d, e?.message)
      })
    })
  }
}

export function invalidateWorkoutDayCache(programSlug = null) {
  if (programSlug) {
    cacheInvalidate(`workout-day:`)
  } else {
    cacheInvalidate('workout-day:')
  }
}

/**
 * Завершить тренировку.
 *
 * ОФФЛАЙН: кладём в очередь с finishDedupKey (program|day|дата), createdAt
 * операции = момент завершения. Возвращаем { offline: true } — WorkoutDay
 * покажет "сохранено локально, синканётся". Локально обновляем стрик/мускулы
 * оптимистично НЕ делаем (чтобы не было расхождений — реальные цифры придут
 * при синке от сервера).
 *
 * ОНЛАЙН: как раньше — атомарная RPC, BADGE_EARNED при выдаче значка.
 */
export async function finishWorkout(programSlug, day, exerciseIds, reward = 150) {
  console.log('[programs] finishWorkout:', { programSlug, day, exerciseIds, reward })

  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] finishWorkout без авторизации')
    return null
  }

  const program = getProgramBySlug(programSlug)
  if (!program) {
    console.warn('[programs] finishWorkout: unknown slug', programSlug)
    return null
  }
  const dbId = program.dbId

  // Положить завершение в оффлайн-очередь и вернуть флаг offline. Зовём и когда
  // сети заведомо нет, и когда онлайн-запрос завис/упал (мёртвый Wi-Fi): иначе
  // экран «Сохранение…» висел бы вечно. Безопасно — RPC при синке схлопнётся по
  // лимиту «1 тренировка в день» (already_completed_today), повтора начислений нет.
  const queueOfflineFinish = () => {
    const finishedAt = new Date().toISOString()
    enqueue('finish', {
      program_id: dbId,
      day,
      exercise_ids: exerciseIds,
      reward
    }, finishDedupKey(dbId, day, finishedAt))
    return {
      offline: true,
      workoutId: null,
      newTotalMuscles: user.total_muscles || 0,
      newWeeklyStreak: user.weekly_streak || 0,
      alreadyCompletedToday: false
    }
  }

  // ОФФЛАЙН (сеть заведомо недоступна): сразу в очередь.
  if (!isOnline()) {
    console.log('[programs] finishWorkout сохранён ОФФЛАЙН в очередь')
    return queueOfflineFinish()
  }

  // ОНЛАЙН: атомарная RPC, но с таймаутом — если не ответила за FINISH_TIMEOUT_MS
  // или упала по сети, считаем что интернета по факту нет → в очередь как оффлайн
  // и фоном пере-проверяем статус сети (обновит OfflineBanner).
  const TIMEOUT = Symbol('timeout')
  let timer = null
  try {
    const rpcPromise = supabase.rpc('api_finish_workout', {
      p_user_id: user.id,
      p_program_id: dbId,
      p_day: day,
      p_exercise_ids: exerciseIds,
      p_reward: reward
    })
    const timeoutPromise = new Promise(resolve => {
      timer = setTimeout(() => resolve(TIMEOUT), FINISH_TIMEOUT_MS)
    })
    const raced = await Promise.race([rpcPromise, timeoutPromise])

    if (raced === TIMEOUT) {
      console.warn('[programs] finishWorkout: RPC таймаут → оффлайн-очередь')
      checkNow() // пере-оценить сеть в фоне → баннер «оффлайн»
      return queueOfflineFinish()
    }

    const { data, error } = raced
    if (error) {
      console.error('[programs] api_finish_workout ERROR:', error)
      return null
    }

    const result = data?.[0]
    if (!result) {
      console.warn('[programs] no result from api_finish_workout')
      return null
    }

    console.log('[programs] workout finished:', result)

    setCurrentUser({
      ...user,
      total_muscles: result.new_total_muscles,
      weekly_streak: result.new_weekly_streak,
      weekly_streak_week: getCurrentWeekKey()
    })

    cacheInvalidate('workout-day:')
    cacheInvalidate(`muscle-history:${user.id}`)
    cacheInvalidate(`recent-workouts:${user.id}`)
    cacheInvalidate(`leaderboard-friends:${user.id}`)
    cacheInvalidate(`leaderboard-league:${user.id}`)
    cacheInvalidate(`my-friend-place:${user.id}`)

    emit(EVENTS.USER_CHANGED, getCurrentUser())

    if (result.new_badge_rank_index !== null && result.new_badge_rank_index !== undefined) {
      console.log('[programs] new badge earned via workout, rank_index =', result.new_badge_rank_index)
      emit(EVENTS.BADGE_EARNED, { rank_index: result.new_badge_rank_index })
    }

    return {
      offline: false,
      workoutId: result.workout_id,
      newTotalMuscles: result.new_total_muscles,
      newWeeklyStreak: result.new_weekly_streak,
      alreadyCompletedToday: result.already_completed_today || false
    }
  } catch (e) {
    // Сетевой сбой во время запроса — тоже в очередь как оффлайн.
    console.warn('[programs] finishWorkout: сетевой сбой → оффлайн-очередь:', e?.message)
    checkNow()
    return queueOfflineFinish()
  } finally {
    if (timer) clearTimeout(timer)
  }
}