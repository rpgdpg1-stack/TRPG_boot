/**
 * Работа с упражнениями: альтернативы, веса, свапы.
 *
 * ОФФЛАЙН: при отсутствии сети saveExerciseWeight / saveExerciseSwap пишут
 * операцию в offline-queue и возвращают true (сохранено локально). sync-engine
 * отправит в Supabase когда сеть вернётся. Локальный persistent-cache веса
 * обновляем сразу, чтобы при перезапуске без сети показывался свежий вес.
 */

import { supabase } from '../../lib/supabase'
import { isCustomExercise, loadExercisesByIds } from '../programs/userExercises'
import { getCurrentUser } from '../../lib/auth'
import { getProgramBySlug } from '../programs/registry'
import { cacheGet, cacheSet, cacheInvalidate, TTL } from '../../lib/cache'
import { pcacheGet, pcacheSet, CATALOG_CACHE_KEY } from '../../lib/persistent-cache'
import { canReadServer, canTrust } from '../../lib/session'
import { debug } from '../../lib/debug'
import {
  enqueue,
  weightDedupKey,
  swapDedupKey
} from '../../lib/offline-queue'
import { goal, GOALS } from '../../lib/metrika'

/**
 * Упражнения подгруппы — для экрана замены.
 *
 * Сервер отдаёт каталог целиком, фильтр на клиенте, и раньше это повторялось
 * на КАЖДЫЙ заход в замену. Теперь каталог кешируется: в памяти на час и на
 * диске на неделю. Каталог меняется редко, а замену чаще всего открывают
 * в зале, где сети может не быть вовсе.
 */
// Ключ общий с programs/api.js — каталог один, кеш один. Версия задана
// в persistent-cache.js: поднять её там, чтобы старый кеш перестали читать.
const CATALOG_KEY = CATALOG_CACHE_KEY

export async function getExercisesForSubgroup(subGroup, type) {
  const cached = cacheGet(CATALOG_KEY) || pcacheGet(CATALOG_KEY)
  if (cached) {
    // Отдаём кеш сразу (замену открывают в зале, где сети может не быть),
    // а свежий каталог подтягиваем в фоне — к следующему заходу.
    refreshAllExercisesInBackground()
    return cached.filter(e => e.sub_group === subGroup && e.type === type)
  }

  try {
    const { data, error } = await supabase.rpc('api_get_all_exercises')
    if (!error && data) {
      cacheSet(CATALOG_KEY, data, TTL.LONG)
      pcacheSet(CATALOG_KEY, data)
      return data.filter(e => e.sub_group === subGroup && e.type === type)
    }
  } catch (e) { /* падаем на прямой запрос ниже */ }

  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, meta_info, preview_url, video_url, priority')
    .is('archived_at', null)   // убранные из каталога в замену не предлагаем
    .eq('sub_group', subGroup)
    .eq('type', type)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[exercises] getExercisesForSubgroup error:', error)
    return []
  }
  return data || []
}

// Фоновое обновление каталога: молча, ошибки глушим — на кеше уже работаем.
let _refreshingAll = false
function refreshAllExercisesInBackground() {
  if (_refreshingAll) return
  _refreshingAll = true
  supabase.rpc('api_get_all_exercises')
    .then(({ data, error }) => {
      if (!error && data?.length) {
        cacheSet(CATALOG_KEY, data, TTL.LONG)
        pcacheSet(CATALOG_KEY, data)
      }
    })
    .catch(() => { /* нет сети — остаёмся на кеше */ })
    .finally(() => { _refreshingAll = false })
}

export async function getExerciseById(exerciseId) {
  // Своё упражнение прямым select не достать: политика RLS отдаёт наружу только
  // каталог приложения (иначе чужие личные упражнения читал бы кто угодно).
  // Для них — функция, которая отвечает по конкретным id.
  if (isCustomExercise(exerciseId)) {
    const rows = await loadExercisesByIds([exerciseId])
    return rows[0] || null
  }

  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .single()

  if (error) {
    console.error('[exercises] getExerciseById error:', error)
    return null
  }
  return data
}

/**
 * Сохранить замену упражнения.
 * ОФФЛАЙН → кладём в очередь, возвращаем true (засинкается позже).
 * ОНЛАЙН → шлём в Supabase, при успехе инвалидируем кеши.
 */
export async function saveExerciseSwap(programSlug, day, orderNum, exerciseId, place = 'gym') {
  const user = getCurrentUser()
  if (!user) {
    console.warn('[exercises] saveExerciseSwap: no user')
    return false
  }

  const program = getProgramBySlug(programSlug)
  if (!program) {
    console.error('[exercises] saveExerciseSwap: unknown program slug:', programSlug)
    return false
  }
  const dbId = program.dbId

  // Положить замену в очередь. Зовём и когда сети нет, и когда сеть есть,
  // но сервер нас не узнаёт (сессия не поднялась) или запрос упал: замена —
  // upsert «последний выигрывает», терять её из-за связи нельзя.
  const queueSwap = () => {
    enqueue('swap', {
      program_id: dbId,
      day,
      location: place,
      order_num: orderNum,
      exercise_id: exerciseId
    }, swapDedupKey(dbId, day, orderNum, place))

    cacheInvalidate(`workout-day:${user.id}:${programSlug}:`)
    debug('[exercises] swap сохранён в очередь (нет связи или сессии)')
    return true
  }

  if (!canReadServer()) return queueSwap()

  debug('[exercises] saveExerciseSwap:', { dbId, day, orderNum, exerciseId, userId: user.id })

  let success = false

  try {
    const { error } = await supabase.rpc('api_save_user_swap', {
      p_user_id: user.id,
      p_program_id: dbId,
      p_day: day,
      p_order_num: orderNum,
      p_exercise_id: exerciseId,
      p_location: place
    })
    if (!error) {
      success = true
    } else {
      console.warn('[exercises] saveExerciseSwap RPC error:', error)
    }
  } catch (e) {
    console.warn('[exercises] saveExerciseSwap RPC exception:', e)
  }

  if (!success) {
    const { error } = await supabase.from('user_exercise_swaps').upsert({
      user_id: user.id,
      program_id: dbId,
      day,
      location: place,
      order_num: orderNum,
      exercise_id: exerciseId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,program_id,day,location,order_num' })

    if (error) {
      console.error('[exercises] saveExerciseSwap upsert error:', error)
      return queueSwap()
    }
    success = true
  }

  // Инвалидируем кеши: и свапы, и собранные дни
  if (success) {
    cacheInvalidate(`user-swaps:${user.id}:${dbId}:`)
    cacheInvalidate(`workout-day:${user.id}:${programSlug}:`)
  }

  return success
}

/**
 * Сохранить вес.
 * ОФФЛАЙН → кладём в очередь, возвращаем true. ОНЛАЙН → в Supabase.
 */
export async function saveExerciseWeight(exerciseId, weightKg) {
  const user = getCurrentUser()
  if (!user) return false

  // Цель ставится до ветвления онлайн/оффлайн: вес человек ввёл в любом
  // случае, а дойдёт он до базы сейчас или после синка — вопрос связи,
  // а не поведения. Здесь мы меряем именно поведение.
  goal(GOALS.WEIGHT_CHANGE)

  // Положить вес в очередь: нет сети, нет сессии (сервер ответит
  // «not authenticated») или запрос упал. Вес — upsert, терять его нельзя.
  const queueWeight = () => {
    enqueue('weight', {
      exercise_id: exerciseId,
      weight_kg: weightKg
    }, weightDedupKey(exerciseId))

    cacheInvalidate(`user-weights:${user.id}`)
    cacheInvalidate(`workout-day:${user.id}:`)
    cacheInvalidate(`weight-history:${user.id}:${exerciseId}`)
    debug('[exercises] вес сохранён в очередь:', exerciseId, weightKg)
    return true
  }

  if (!canReadServer()) return queueWeight()

  let success = false

  try {
    const { error } = await supabase.rpc('api_save_user_weight', {
      p_user_id: user.id,
      p_exercise_id: exerciseId,
      p_weight_kg: weightKg
    })
    if (!error) success = true
  } catch (e) {}

  if (!success) {
    const { error } = await supabase.from('user_exercise_weights').upsert({
      user_id: user.id,
      exercise_id: exerciseId,
      weight_kg: weightKg,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,exercise_id' })

    if (error) {
      console.error('[exercises] saveExerciseWeight error:', error)
      return queueWeight()
    }
    success = true
  }

  if (success) {
    cacheInvalidate(`user-weights:${user.id}`)
    cacheInvalidate(`workout-day:${user.id}:`)
    // Триггер БД записал точку истории за сегодня — сбрасываем кеш графика,
    // чтобы при следующем открытии модалки линия учла свежий вес.
    cacheInvalidate(`weight-history:${user.id}:${exerciseId}`)
  }

  return success
}

/**
 * История рабочего веса упражнения для графика прогресса.
 * Возвращает [{ day: 'YYYY-MM-DD', weight: number }] по возрастанию дня.
 * Данные пишет триггер БД (одна точка в день, по Москве). Ошибка/оффлайн → [].
 */
export async function getWeightHistory(exerciseId) {
  const user = getCurrentUser()
  if (!user || !exerciseId) return []

  const cacheKey = `weight-history:${user.id}:${exerciseId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_weight_history', {
      p_user_id: user.id,
      p_exercise_id: exerciseId
    })
    // Без сессии история приходит пустой (сервер не знает, чья она) —
    // такой ответ в кеш не кладём, иначе график «обнулится» до перезахода.
    if (!canTrust(error)) {
      if (error) console.warn('[exercises] getWeightHistory error:', error.message)
      return []
    }
    const result = (data || []).map(r => ({ day: r.day, weight: Number(r.weight_kg) }))
    cacheSet(cacheKey, result, TTL.MEDIUM)
    return result
  } catch (e) {
    console.warn('[exercises] getWeightHistory exception:', e?.message)
    return []
  }
}