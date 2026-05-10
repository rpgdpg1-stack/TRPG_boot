/**
 * Работа с программами тренировок и их упражнениями.
 *
 * Д1-fix3: Не используем RPC. Грузим program_days и exercises
 * прямыми SELECT-запросами и собираем результат на клиенте.
 * Это надёжнее — RPC по непонятной причине возвращал [] из браузера.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'

/**
 * Получить упражнения для дня тренировки.
 * Логика:
 *  1. Берём слоты из program_days по program_id + day
 *  2. Берём свапы юзера из user_exercise_swaps
 *  3. Берём exercises (для имён, превью, мета)
 *  4. Берём веса юзера из user_exercise_weights
 *  5. Собираем результат
 */
export async function getWorkoutDay(programId, day) {
  console.log('[programs] getWorkoutDay called with', programId, day)
  const user = getCurrentUser()
  if (!user) {
    console.warn('[programs] no user, returning []')
    return []
  }

  // 1. Слоты программы
  const { data: slotsRaw, error: slotsErr } = await supabase
    .from('program_days')
    .select('order_num, muscle_group, sub_group, type')
    .eq('program_id', programId)
    .eq('day', day)
    .order('order_num', { ascending: true })

  if (slotsErr) {
    console.error('[programs] program_days error:', slotsErr)
    return []
  }
  console.log('[programs] got', (slotsRaw || []).length, 'slots from program_days')

  if (!slotsRaw || !slotsRaw.length) return []

  // 2. Свапы юзера
  const { data: swaps, error: swapsErr } = await supabase
    .from('user_exercise_swaps')
    .select('order_num, exercise_id')
    .eq('user_id', user.id)
    .eq('program_id', programId)
    .eq('day', day)

  if (swapsErr) console.warn('[programs] swaps error:', swapsErr)
  const swapsByOrder = {}
  for (const s of swaps || []) swapsByOrder[s.order_num] = s.exercise_id

  // 3. Все упражнения (88 строк, кэшируем целиком — проще)
  const { data: exercises, error: exErr } = await supabase
    .from('exercises')
    .select('id, name, sub_group, type, meta_info, preview_url, video_url, priority')
    .order('priority', { ascending: true })

  if (exErr) {
    console.error('[programs] exercises error:', exErr)
    return []
  }
  console.log('[programs] got', (exercises || []).length, 'exercises total')

  // Индексируем для быстрого поиска
  const exById = {}
  for (const e of exercises || []) exById[e.id] = e

  // 4. Веса юзера
  const { data: weights, error: wErr } = await supabase
    .from('user_exercise_weights')
    .select('exercise_id, weight_kg')
    .eq('user_id', user.id)

  if (wErr) console.warn('[programs] weights error:', wErr)
  const weightsByEx = {}
  for (const w of weights || []) weightsByEx[w.exercise_id] = w.weight_kg

  // 5. Собираем результат
  const result = slotsRaw.map(slot => {
    // Какое упражнение на этом слоте?
    let exerciseId = swapsByOrder[slot.order_num]
    let isSwapped = !!exerciseId

    if (!exerciseId) {
      // Дефолтное — наименьший priority в подгруппе+типе
      const candidates = (exercises || []).filter(
        e => e.sub_group === slot.sub_group && e.type === slot.type
      )
      // exercises уже отсортированы по priority ASC
      exerciseId = candidates[0]?.id || null
    }

    const ex = exerciseId ? exById[exerciseId] : null

    return {
      order_num: slot.order_num,
      muscle_group: slot.muscle_group,
      sub_group: slot.sub_group,
      type: slot.type,
      exercise_id: exerciseId,
      exercise_name: ex?.name || '(упражнение не найдено)',
      meta_info: ex?.meta_info || null,
      preview_url: ex?.preview_url || null,
      video_url: ex?.video_url || null,
      is_swapped: isSwapped,
      user_weight_kg: weightsByEx[exerciseId] ?? null
    }
  })

  console.log('[programs] returning', result.length, 'enriched slots. Sample:', result[0])
  return result
}

/**
 * Получить все упражнения по подгруппе+типу — для экрана замены.
 */
export async function getExercisesForSubgroup(subGroup, type) {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, meta_info, preview_url, video_url, priority')
    .eq('sub_group', subGroup)
    .eq('type', type)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[programs] getExercisesForSubgroup error:', error)
    return []
  }
  return data || []
}

/**
 * Сохранить замену упражнения в слоте программы.
 */
export async function saveExerciseSwap(programId, day, orderNum, exerciseId) {
  const user = getCurrentUser()
  if (!user) return false

  const { error } = await supabase
    .from('user_exercise_swaps')
    .upsert({
      user_id: user.id,
      program_id: programId,
      day,
      order_num: orderNum,
      exercise_id: exerciseId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,program_id,day,order_num' })

  if (error) {
    console.error('[programs] saveExerciseSwap error:', error)
    return false
  }
  return true
}

/**
 * Сохранить рабочий вес юзера для упражнения.
 */
export async function saveExerciseWeight(exerciseId, weightKg) {
  const user = getCurrentUser()
  if (!user) return false

  const { error } = await supabase
    .from('user_exercise_weights')
    .upsert({
      user_id: user.id,
      exercise_id: exerciseId,
      weight_kg: weightKg,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,exercise_id' })

  if (error) {
    console.error('[programs] saveExerciseWeight error:', error)
    return false
  }
  return true
}

/**
 * Получить полную информацию об упражнении.
 */
export async function getExerciseById(exerciseId) {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .single()

  if (error) {
    console.error('[programs] getExerciseById error:', error)
    return null
  }
  return data
}

/**
 * Названия групп мышц на русском.
 */
export const MUSCLE_GROUP_LABELS = {
  back: 'СПИНА',
  chest: 'ГРУДЬ',
  legs: 'НОГИ',
  shoulders: 'ПЛЕЧИ',
  arms: 'РУКИ',
  abs: 'ПРЕСС',
  forearms: 'ПРЕДПЛЕЧЬЯ',
  neck: 'ШЕЯ',
  warmup: 'РАЗМИНКА'
}
