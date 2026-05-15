/**
 * Логика загрузки и завершения тренировки.
 *
 * ОБНОВЛЕНИЕ: добавлен кеш на уровне модуля + предзагрузка соседних дней.
 *
 * Стратегия кеширования:
 *  - api_get_all_exercises  → TTL.SESSION (24ч) — упражнения почти не меняются
 *  - api_get_user_swaps     → TTL.LONG (1ч), инвалидируется при saveExerciseSwap
 *  - api_get_user_weights   → TTL.LONG (1ч), инвалидируется при saveExerciseWeight
 *  - готовый getWorkoutDay  → TTL.MEDIUM (5мин), инвалидируется при свапах/весах
 *
 * При открытии любого дня запускается prefetchNeighbourDays — следующий и
 * предыдущий день начинают грузиться в фоне через requestIdleCallback,
 * чтобы свайп между днями был мгновенным.
 *
 * Slug в URL ↔ dbId в БД конвертируется через registry.
 */

import { supabase } from '../../lib/supabase'
import { getCurrentUser, setCurrentUser } from '../../lib/auth'
import { EVENTS, emit } from '../../lib/events'
import { getCurrentWeekKey } from '../../utils/dates'
import { getProgramBySlug, getProgramDaySlots } from './registry'
import { cacheGet, cacheSet, cacheInvalidate, TTL, runWhenIdle } from '../../lib/cache'

/**
 * Загрузить все упражнения. Кешируется на сессию.
 */
async function loadAllExercises() {
  const cacheKey = 'exercises:all'
  const cached = cacheGet(cacheKey)
  if (cached) return cached

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
  }

  return exercises
}

/**
 * Загрузить свапы юзера для конкретного дня. Кешируется на час.
 */
async function loadUserSwaps(userId, dbId, day) {
  const cacheKey = `user-swaps:${userId}:${dbId}:${day}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  let swapsByOrder = {}
  try {
    const { data: swaps, error } = await supabase.rpc('api_get_user_swaps', {
      p_user_id: userId,
      p_program_id: dbId,
      p_day: day
    })
    if (!error && swaps) {
      for (const s of swaps) swapsByOrder[s.order_num] = s.exercise_id
    }
  } catch (e) {
    console.warn('[programs] swaps fetch failed:', e?.message)
  }

  cacheSet(cacheKey, swapsByOrder, TTL.LONG)
  return swapsByOrder
}

/**
 * Загрузить веса юзера для всех упражнений. Кешируется на час.
 * Хранится одним блобом потому что api_get_user_weights отдаёт все веса сразу.
 */
async function loadUserWeights(userId) {
  const cacheKey = `user-weights:${userId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

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
  }

  cacheSet(cacheKey, weightsByEx, TTL.LONG)
  return weightsByEx
}

/**
 * Сборка дня тренировки из закешированных кусков.
 * Сам результат тоже кешируется на 5 минут для повторных открытий того же дня.
 */
export async function getWorkoutDay(programSlug, day) {
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

  // 1. Проверяем итоговый кеш дня
  const dayCacheKey = `workout-day:${user.id}:${programSlug}:${day}`
  const cachedDay = cacheGet(dayCacheKey)
  if (cachedDay) {
    // Запускаем prefetch соседних дней — пусть тоже греются в фоне
    schedulePrefetch(programSlug, day, user.id)
    return cachedDay
  }

  // 2. Слоты программы — из кода
  const slotsRaw = getProgramDaySlots(programSlug, day)
  if (!slotsRaw.length) return []

  // 3. Параллельная загрузка всех зависимостей (с кешем)
  const [swapsByOrder, exercises, weightsByEx] = await Promise.all([
    loadUserSwaps(user.id, dbId, day),
    loadAllExercises(),
    loadUserWeights(user.id)
  ])

  const exById = {}
  for (const e of exercises) exById[e.id] = e

  // 4. Собираем результат
  const result = slotsRaw.map(slot => {
    let exerciseId = swapsByOrder[slot.order_num]
    let isSwapped = !!exerciseId

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

  // 5. Прелоадим соседние дни в фоне
  schedulePrefetch(programSlug, day, user.id)

  return result
}

/**
 * Предзагрузить соседние дни (предыдущий и следующий) в фоне.
 * Запускается через requestIdleCallback — не блокирует UI.
 */
function schedulePrefetch(programSlug, currentDay, userId) {
  const program = getProgramBySlug(programSlug)
  if (!program) return

  const days = Object.keys(program.data.days)
  const idx = days.indexOf(currentDay)
  if (idx === -1) return

  const prev = idx > 0 ? days[idx - 1] : days[days.length - 1]
  const next = idx < days.length - 1 ? days[idx + 1] : days[0]

  const neighbours = [prev, next].filter(d => d !== currentDay)

  for (const d of neighbours) {
    const key = `workout-day:${userId}:${programSlug}:${d}`
    if (cacheGet(key)) continue // уже в кеше

    runWhenIdle(() => {
      // Тихо грузим — не делаем await, не показываем спиннер
      getWorkoutDay(programSlug, d).catch(e => {
        console.warn('[programs] prefetch failed for day', d, e?.message)
      })
    })
  }
}

/**
 * Инвалидировать кеш дня (или всех дней программы).
 * Вызывается при смене упражнения или изменении веса.
 */
export function invalidateWorkoutDayCache(programSlug = null) {
  if (programSlug) {
    cacheInvalidate(`workout-day:`)
  } else {
    cacheInvalidate('workout-day:')
  }
}

/**
 * Завершить тренировку — атомарная RPC.
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

  const { data, error } = await supabase.rpc('api_finish_workout', {
    p_user_id: user.id,
    p_program_id: dbId,
    p_day: day,
    p_exercise_ids: exerciseIds,
    p_reward: reward
  })

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

  // Инвалидируем кеши которые могли измениться после тренировки
  cacheInvalidate('workout-day:')
  cacheInvalidate(`muscle-history:${user.id}`)

  emit(EVENTS.USER_CHANGED, getCurrentUser())

  return {
    workoutId: result.workout_id,
    newTotalMuscles: result.new_total_muscles,
    newWeeklyStreak: result.new_weekly_streak,
    alreadyCompletedToday: result.already_completed_today || false
  }
}