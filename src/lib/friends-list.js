/**
 * Список друзей для отдельной страницы «Друзья».
 *
 * В отличие от lib/leaderboard.js (рейтинг — соревнование по мускулам),
 * здесь друзья показываются СПИСКОМ: без нумерации, с закрепами и
 * сортировкой по активности (последняя тренировка).
 *
 * Все функции — обёртки над Supabase RPC:
 *  - api_get_friends_list   → список друзей (без меня) с местом в лиге,
 *                             последней тренировкой, закрепом
 *  - api_toggle_pin_friend  → закрепить/открепить (лимит 6)
 *
 * Кеш короткий (1 мин), сбрасывается при закрепе/добавлении друга.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { cacheGet, cacheSet, cacheInvalidate, TTL } from './cache'
import { localGet, localSet } from '../utils/storage'

export const PIN_LIMIT = 6

/**
 * Список друзей текущего юзера (БЕЗ самого юзера).
 * Возвращает массив: { user_id, first_name, username, photo_url,
 *   total_muscles, rank_index, league_place, total_in_league,
 *   last_workout_at, pinned_at }
 *
 * Уже отсортирован сервером: закреплённые (новее выше) → по свежести
 * тренировки → по мускулам.
 */
/**
 * СИНХРОННО последний список друзей для мгновенного рендера (память → localStorage).
 * Персист нужен, чтобы после перезапуска мини-аппа страница друзей открывалась сразу
 * с данными, без «Загрузка…». null = ещё ни разу не грузили (показать скелетон).
 */
export function getFriendsListSync() {
  const user = getCurrentUser()
  if (!user) return null
  const mem = cacheGet(`friends-list:${user.id}`)
  if (mem) return mem
  const raw = localGet(`friends-list:${user.id}`)
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) { cacheSet(`friends-list:${user.id}`, arr, TTL.SHORT); return arr }
  } catch { /* ignore */ }
  return null
}

export async function getFriendsList() {
  const user = getCurrentUser()
  if (!user) return []

  const cacheKey = `friends-list:${user.id}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_friends_list', {
      p_user_id: user.id
    })

    if (error) {
      console.error('[friends-list] error:', error)
      return getFriendsListSync() || []
    }

    const result = data || []
    cacheSet(cacheKey, result, TTL.SHORT)
    try { localSet(cacheKey, JSON.stringify(result)) } catch { /* ignore */ }
    return result
  } catch (e) {
    console.error('[friends-list] exception:', e)
    return getFriendsListSync() || []
  }
}

/**
 * Закрепить / открепить друга (toggle).
 * Возвращает { success, pinned } или { success:false, error } где error:
 *   'limit'      — упёрся в лимит 6 закрепов
 *   'not_friend' — это не друг
 *   'bad_args'   — кривые аргументы
 *
 * При успехе сбрасываем кеш списка, чтобы порядок пересчитался.
 */
export async function togglePinFriend(friendId) {
  const user = getCurrentUser()
  if (!user) return { success: false, error: 'no_user' }

  try {
    const { data, error } = await supabase.rpc('api_toggle_pin_friend', {
      p_user_id: user.id,
      p_friend_id: friendId
    })

    if (error) {
      console.error('[friends-list] togglePin RPC error:', error)
      return { success: false, error: 'rpc_error' }
    }

    if (data?.success) {
      invalidateFriendsListCache()
      return { success: true, pinned: data.pinned }
    }

    return { success: false, error: data?.error || 'unknown' }
  } catch (e) {
    console.error('[friends-list] togglePin exception:', e)
    return { success: false, error: 'exception' }
  }
}

/**
 * Сбросить кеш списка друзей. Вызывается после:
 *  - закрепа/открепа (порядок изменился)
 *  - добавления друга (новый в списке)
 *  - завершения тренировки (свежесть активности изменилась)
 */
export function invalidateFriendsListCache() {
  const user = getCurrentUser()
  if (!user) return
  cacheInvalidate(`friends-list:${user.id}`)
}

/**
 * Публичный профиль игрока (для модалки профиля друга): последняя тренировка,
 * серия, статистика — с учётом приватности (сервер сам скрывает выключенное).
 */
export async function getUserPublicProfile(userId) {
  if (!userId) return null
  try {
    const viewer = getCurrentUser()
    const { data, error } = await supabase.rpc('api_get_user_public_profile', {
      p_user_id: userId,
      p_viewer_id: viewer?.id ?? null
    })
    if (error) {
      console.error('[friends-list] getUserPublicProfile error:', error)
      return null
    }
    return data || null
  } catch (e) {
    console.error('[friends-list] getUserPublicProfile exception:', e)
    return null
  }
}