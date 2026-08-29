/**
 * Синхронизация активной тренировки между устройствами.
 *
 * Сессия и галочки живут в localStorage — так быстрее и работает без сети.
 * Но один аккаунт открывают и из Telegram, и из браузера по почте, и начатая
 * там тренировка обязана быть видна тут. Поэтому localStorage остаётся
 * рабочей копией, а база — общей.
 *
 * Отправка «в один конец»: ошибки глотаем. Тренировка не должна ломаться
 * из-за того, что не удалось синхронизировать — локальная копия на месте.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { canReadServer } from './session'
import { debug } from './debug'

/** Частые галочки не должны бить в базу на каждый тап. */
const PUSH_DEBOUNCE_MS = 1500
let pushTimer = null

/** Отправить состояние сессии на сервер. */
export function pushSession({ programId, day, place, startedAt, done }) {
  if (!getCurrentUser() || !canReadServer()) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    supabase.rpc('api_set_active_session', {
      p_program_id: programId,
      p_day: day,
      p_place: place || 'gym',
      p_started_at: startedAt,
      p_done: done || []
    }).then(({ error }) => {
      if (error) console.warn('[session-sync] не сохранилась:', error.message)
    }).catch(() => {})
  }, PUSH_DEBOUNCE_MS)
}

/** Убрать сессию с сервера — завершение или отмена. */
export function clearSession() {
  clearTimeout(pushTimer)
  if (!getCurrentUser() || !canReadServer()) return
  supabase.rpc('api_clear_active_session')
    .then(({ error }) => {
      if (error) console.warn('[session-sync] не удалилась:', error.message)
    })
    .catch(() => {})
}

/** Что лежит на сервере. null — там пусто или не дотянулись. */
export async function fetchSession() {
  if (!getCurrentUser() || !canReadServer()) return null
  const { data, error } = await supabase.rpc('api_get_active_session')
  if (error) {
    console.warn('[session-sync] не прочиталась:', error.message)
    return null
  }
  const row = data?.[0]
  if (!row) return null
  return {
    programId: row.program_id,
    day: row.day,
    place: row.place,
    startedAt: row.started_at,
    done: row.done || [],
    updatedAt: row.updated_at,
    // false — надгробие: тренировку отменили или завершили на другом
    // устройстве. Строка остаётся именно ради этого признака.
    active: row.active !== false
  }
}

/**
 * Свести локальное и серверное состояние.
 *
 * Правила по убыванию очевидности:
 *  • на сервере надгробие (тренировку отменили или завершили на другом
 *    устройстве) — гасим и у себя, если только не начали новую уже ПОСЛЕ
 *    отмены;
 *  • есть только на сервере — забираем его;
 *  • есть только локально — отдаём своё;
 *  • одна и та же тренировка — объединяем галочки. Внутри одной сессии они
 *    только добавляются, и объединение никогда не отнимет отмеченное:
 *    потерять галочку обиднее, чем увидеть лишнюю;
 *  • разные тренировки — берём ту, что тронули позже.
 *
 * Возвращает { session, done, from } либо null. from === 'cleared' означает
 * «тренировки больше нет, убрать и локально».
 */
export function mergeSessions(local, remote) {
  if (!local && !remote) return null

  // Надгробие разбираем первым: пока оно не учтено, любое сравнение «кто
  // свежее» сравнивает живую сессию с несуществующей и всегда её воскрешает.
  if (remote && remote.active === false) {
    if (!local) return null
    // Новую начали уже после отмены — она главнее надгробия.
    const localTime = local.updatedAt || local.startedAt
    if (localTime > remote.updatedAt) {
      return { session: local, done: local.done, from: 'local' }
    }
    return { from: 'cleared' }
  }

  if (!local) return { session: remote, done: remote.done, from: 'remote' }
  if (!remote) return { session: local, done: local.done, from: 'local' }

  const same = local.programId === remote.programId
    && local.day === remote.day
    && local.place === remote.place

  if (same) {
    const done = [...new Set([...(local.done || []), ...(remote.done || [])])].sort((a, b) => a - b)
    // Начало берём раннее: тренировка началась тогда, когда её начали,
    // а не когда о ней узнало второе устройство.
    const startedAt = local.startedAt < remote.startedAt ? local.startedAt : remote.startedAt
    return { session: { ...local, startedAt }, done, from: 'merged' }
  }

  const localTime = local.updatedAt || local.startedAt
  const remoteWins = remote.updatedAt > localTime
  debug('[session-sync] разные тренировки, побеждает', remoteWins ? 'сервер' : 'устройство')
  return remoteWins
    ? { session: remote, done: remote.done, from: 'remote' }
    : { session: local, done: local.done, from: 'local' }
}
