/**
 * Очередь оффлайн-операций.
 *
 * Когда нет сети — операции (сохранить вес, сменить упражнение, завершить
 * тренировку) не летят в Supabase, а складываются сюда, в localStorage.
 * Когда сеть появится — sync-engine.js разбирает очередь и отправляет всё.
 *
 * Почему localStorage а не IndexedDB: объёмы крошечные (десятки операций
 * максимум), а localStorage переживает закрытие Telegram. IndexedDB на таких
 * данных — overkill.
 *
 * СХЛОПЫВАНИЕ (дедупликация):
 *  - weight: ключ = exercise_id. Поменял вес 10 раз — храним последнее.
 *  - swap:   ключ = program_id|day|order_num. Менял слот туда-сюда — последнее.
 *  - finish: ключ = program_id|day|finished_at(дата). Одна тренировка за день.
 *  Это безопасно потому что и вес, и свап на сервере — upsert "последний
 *  выигрывает". Нет смысла слать промежуточные значения.
 *
 * Каждая операция хранит:
 *  - type: 'weight' | 'swap' | 'finish'
 *  - payload: данные для RPC
 *  - dedupKey: ключ схлопывания (по нему ищем дубль)
 *  - createdAt: когда создана (для finish важно — это реальный момент
 *    завершения тренировки, уходит в p_finished_at при синке)
 */

import { localGet, localSet } from '../utils/storage'

const QUEUE_KEY = 'offline-operations-queue'

/**
 * Прочитать всю очередь. Возвращает массив операций (пустой если нет/битая).
 */
export function getQueue() {
  const raw = localGet(QUEUE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Записать очередь целиком.
 */
function saveQueue(queue) {
  localSet(QUEUE_KEY, JSON.stringify(queue))
}

/**
 * Сколько операций в очереди (для баннера "синканётся N изменений").
 */
export function getQueueSize() {
  return getQueue().length
}

/**
 * Добавить операцию в очередь со схлопыванием по dedupKey.
 * Если операция того же type с тем же dedupKey уже есть — ЗАМЕНЯЕМ её
 * (последнее значение выигрывает), а не плодим дубль.
 *
 * type     — 'weight' | 'swap' | 'finish'
 * payload  — объект с данными для RPC (см. ниже формат каждого типа)
 * dedupKey — строка-ключ схлопывания
 */
export function enqueue(type, payload, dedupKey) {
  const queue = getQueue()

  const op = {
    type,
    payload,
    dedupKey,
    createdAt: new Date().toISOString()
  }

  // Ищем существующую операцию того же типа с тем же ключом
  const idx = queue.findIndex(o => o.type === type && o.dedupKey === dedupKey)

  if (idx !== -1) {
    // Для weight и swap — заменяем payload (последнее значение).
    // createdAt для finish сохраняем ИСХОДНЫЙ (момент реального завершения),
    // для остальных обновляем — не критично.
    if (type === 'finish') {
      // finish обычно не дублируется (одна тренировка в день), но если вдруг —
      // оставляем первую (исходный момент завершения важнее)
      console.log('[queue] finish уже в очереди для', dedupKey, '— оставляем исходную')
      return
    }
    queue[idx] = op
    console.log('[queue] схлопнули', type, dedupKey)
  } else {
    queue.push(op)
    console.log('[queue] добавили', type, dedupKey, '— размер:', queue.length)
  }

  saveQueue(queue)
}

/**
 * Удалить операцию из очереди (после успешной отправки в Supabase).
 * Ищем по точному совпадению type + dedupKey.
 */
export function dequeue(type, dedupKey) {
  const queue = getQueue()
  const filtered = queue.filter(o => !(o.type === type && o.dedupKey === dedupKey))
  if (filtered.length !== queue.length) {
    saveQueue(filtered)
    console.log('[queue] удалили', type, dedupKey, '— осталось:', filtered.length)
  }
}

/**
 * Полностью очистить очередь. Используется при clearAllData (сброс прогресса).
 */
export function clearQueue() {
  saveQueue([])
}

/* ============================================ */
/* Хелперы для формирования dedupKey            */
/* ============================================ */

export function weightDedupKey(exerciseId) {
  return `${exerciseId}`
}

export function swapDedupKey(programId, day, orderNum) {
  return `${programId}|${day}|${orderNum}`
}

export function finishDedupKey(programId, day, finishedAtISO) {
  // Дата (без времени) от момента завершения — одна тренировка на день
  const dateOnly = finishedAtISO.split('T')[0]
  return `${programId}|${day}|${dateOnly}`
}