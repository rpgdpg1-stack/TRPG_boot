/**
 * Движок синхронизации оффлайн-очереди.
 *
 * Когда сеть появляется (или при старте приложения) — берёт операции из
 * offline-queue и отправляет в Supabase. Успешные удаляет из очереди.
 *
 * Запускается:
 *  - при старте приложения (App.jsx) — вдруг с прошлого раза что-то осталось
 *  - при событии "сеть вернулась" (network-status NETWORK_CHANGED → true)
 *
 * Защита от параллельного запуска: флаг isSyncing. Если синк уже идёт —
 * повторный вызов игнорируется (иначе одну операцию отправим дважды).
 *
 * События для UI (через lib/events, имена тут локальные):
 *  - SYNC_STARTED  — начали синк (баннер "🔄 Синхронизация...")
 *  - SYNC_DONE     — закончили, detail = { synced: N } (баннер "✅ N изменений")
 *  - SYNC_FAILED   — что-то не отправилось, осталось в очереди (попробуем позже)
 *
 * Обработка результата finish:
 *  - RPC вернула already_completed_today=true → это НЕ ошибка. Тренировка за
 *    тот день уже засчитана (или этой, или другой). Считаем операцию успешно
 *    обработанной и убираем из очереди (иначе застрянет навсегда).
 */

import { supabase } from './supabase'
import { getCurrentUser, setCurrentUser } from './auth'
import { emit } from './events'
import { getQueue, dequeue } from './offline-queue'
import { isOnline } from './network-status'
import { cacheInvalidate } from './cache'
import { EVENTS } from './events'

export const SYNC_EVENTS = {
  STARTED: 'sync-started',
  DONE: 'sync-done',
  FAILED: 'sync-failed'
}

let isSyncing = false

/**
 * Подписка на события синка для UI. Возвращает отписку.
 */
export function onSyncEvent(eventName, handler) {
  const wrapped = (e) => handler(e.detail)
  window.addEventListener(eventName, wrapped)
  return () => window.removeEventListener(eventName, wrapped)
}

/**
 * Главная функция — разобрать очередь и отправить в Supabase.
 * Безопасно звать многократно (защита isSyncing).
 */
export async function syncQueue() {
  if (isSyncing) {
    console.log('[sync] уже синхронизируется, пропускаем повторный вызов')
    return
  }

  if (!isOnline()) {
    console.log('[sync] нет сети, синк отложен')
    return
  }

  const user = getCurrentUser()
  if (!user) {
    console.log('[sync] нет юзера, синк отложен')
    return
  }

  const queue = getQueue()
  if (queue.length === 0) {
    return // нечего синкать — молча выходим, без событий
  }

  isSyncing = true
  emit(SYNC_EVENTS.STARTED, { total: queue.length })
  console.log('[sync] старт, операций в очереди:', queue.length)

  let syncedCount = 0
  let hadError = false

  // Идём по копии очереди. Успешные удаляем по ходу.
  for (const op of queue) {
    try {
      const ok = await sendOperation(op, user.id)
      if (ok) {
        dequeue(op.type, op.dedupKey)
        syncedCount++
      } else {
        hadError = true
        console.warn('[sync] операция не отправлена, остаётся в очереди:', op.type, op.dedupKey)
      }
    } catch (e) {
      hadError = true
      console.error('[sync] ошибка отправки операции:', op.type, op.dedupKey, e?.message)
    }
  }

  isSyncing = false

  // После синка инвалидируем кеши дней — данные на сервере изменились
  if (syncedCount > 0) {
    cacheInvalidate('workout-day:')
    cacheInvalidate(`user-weights:${user.id}`)
    cacheInvalidate(`user-swaps:`)
    cacheInvalidate(`recent-workouts:${user.id}`)
  }

  console.log('[sync] завершён, отправлено:', syncedCount, 'ошибки:', hadError)

  if (hadError) {
    emit(SYNC_EVENTS.FAILED, { synced: syncedCount })
  } else {
    emit(SYNC_EVENTS.DONE, { synced: syncedCount })
  }
}

/**
 * Отправить одну операцию. Возвращает true если успешно (можно удалять из очереди).
 */
async function sendOperation(op, userId) {
  switch (op.type) {
    case 'weight':
      return sendWeight(op, userId)
    case 'swap':
      return sendSwap(op, userId)
    case 'finish':
      return sendFinish(op, userId)
    default:
      console.warn('[sync] неизвестный тип операции:', op.type)
      return true // удаляем мусор из очереди
  }
}

/**
 * Вес — upsert. payload: { exercise_id, weight_kg }
 */
async function sendWeight(op, userId) {
  const { exercise_id, weight_kg } = op.payload

  const { error } = await supabase.rpc('api_save_user_weight', {
    p_user_id: userId,
    p_exercise_id: exercise_id,
    p_weight_kg: weight_kg
  })

  if (error) {
    // Фоллбэк на прямой upsert (как в exercises/api.js)
    const { error: upsertErr } = await supabase.from('user_exercise_weights').upsert({
      user_id: userId,
      exercise_id,
      weight_kg,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,exercise_id' })
    if (upsertErr) {
      console.error('[sync] weight upsert error:', upsertErr)
      return false
    }
  }
  return true
}

/**
 * Свап — upsert. payload: { program_id, day, order_num, exercise_id }
 */
async function sendSwap(op, userId) {
  const { program_id, day, order_num, exercise_id } = op.payload
  // location появилось не сразу — у старых элементов очереди его может не быть.
  const location = op.payload.location || 'gym'

  const { error } = await supabase.rpc('api_save_user_swap', {
    p_user_id: userId,
    p_program_id: program_id,
    p_day: day,
    p_order_num: order_num,
    p_exercise_id: exercise_id,
    p_location: location
  })

  if (error) {
    const { error: upsertErr } = await supabase.from('user_exercise_swaps').upsert({
      user_id: userId,
      program_id,
      day,
      location,
      order_num,
      exercise_id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,program_id,day,location,order_num' })
    if (upsertErr) {
      console.error('[sync] swap upsert error:', upsertErr)
      return false
    }
  }
  return true
}

/**
 * Завершение тренировки. payload: { program_id, day, exercise_ids, reward }
 * createdAt операции = реальный момент завершения → уходит в p_finished_at,
 * чтобы "сегодня" и стрик считались от момента тренировки, а не от момента синка.
 *
 * already_completed_today=true — НЕ ошибка, операцию убираем (return true).
 */
async function sendFinish(op, userId) {
  const { program_id, day, exercise_ids, reward, started_at, distance_m } = op.payload
  const finishedAt = op.createdAt // ISO-строка момента завершения оффлайн

  const { data, error } = await supabase.rpc('api_finish_workout', {
    p_user_id: userId,
    p_program_id: program_id,
    p_day: day,
    p_exercise_ids: exercise_ids,
    p_reward: reward,
    p_finished_at: finishedAt,
    p_started_at: started_at ?? null,
    p_distance_m: distance_m ?? null
  })

  if (error) {
    console.error('[sync] api_finish_workout error:', error)
    return false
  }

  const result = data?.[0]
  if (!result) {
    console.warn('[sync] api_finish_workout вернул пусто')
    return false
  }

  // Обновляем локального юзера свежими цифрами с сервера
  const u = getCurrentUser()
  if (u) {
    setCurrentUser({
      ...u,
      total_muscles: result.new_total_muscles,
      weekly_streak: result.new_weekly_streak
    })
  }

  // Значок лиги мог выдаться при синке — шлём событие, App покажет модалку
  if (result.new_badge_rank_index !== null && result.new_badge_rank_index !== undefined) {
    emit(EVENTS.BADGE_EARNED, { rank_index: result.new_badge_rank_index })
  }

  // already_completed_today=true — тоже успех (return true ниже), просто
  // начисления не было. Главное — операцию из очереди убрать.
  if (result.already_completed_today) {
    console.log('[sync] finish: уже было засчитано за тот день, убираем из очереди')
  }

  return true
}