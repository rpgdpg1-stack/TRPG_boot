/**
 * API для лидербордов: друзья, лига, моё место.
 *
 * Все функции — обёртки над Supabase RPC. Ничего больше тут нет.
 * Кеширование на короткое время (1 минута), потому что:
 *  - рейтинг не должен меняться каждую секунду (нагрузка)
 *  - при возврате на страницу не хочется ждать сетевой запрос
 *  - при изменении мускулов кеш сбрасывается явно через invalidate
 *
 * При ошибках возвращаем безопасные дефолты ([], 1) а не бросаем —
 * UI должен оставаться работоспособным даже без интернета.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { cacheGet, cacheSet, cacheInvalidate, TTL } from './cache'

/**
 * Топ среди друзей юзера (включая самого юзера).
 * Возвращает массив объектов: { user_id, first_name, username, photo_url,
 *   total_muscles, rank_index, place, is_me }
 *
 * Список уже отсортирован сервером по убыванию мускулов.
 */
export async function getFriendsLeaderboard() {
  const user = getCurrentUser()
  if (!user) return []

  const cacheKey = `leaderboard-friends:${user.id}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_friends_leaderboard', {
      p_user_id: user.id
    })

    if (error) {
      console.error('[leaderboard] friends error:', error)
      return []
    }

    const result = data || []
    cacheSet(cacheKey, result, TTL.SHORT)
    return result
  } catch (e) {
    console.error('[leaderboard] friends exception:', e)
    return []
  }
}

/**
 * Топ внутри лиги юзера (по умолчанию топ-100 + сам юзер если он ниже).
 * Возвращает: { rows: [...], totalInLeague: число }
 *
 * totalInLeague нужен чтобы показывать "Вы один из 4523 в лиге Атлет"
 * даже когда в rows только топ-100.
 */
export async function getLeagueLeaderboard(limit = 100) {
  const user = getCurrentUser()
  if (!user) return { rows: [], totalInLeague: 0 }

  const cacheKey = `leaderboard-league:${user.id}:${limit}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_league_leaderboard', {
      p_user_id: user.id,
      p_limit: limit
    })

    if (error) {
      console.error('[leaderboard] league error:', error)
      return { rows: [], totalInLeague: 0 }
    }

    const rows = data || []
    // total_in_league одинаков во всех строках — берём из первой
    const totalInLeague = rows[0]?.total_in_league ?? 0
    const result = { rows, totalInLeague }

    cacheSet(cacheKey, result, TTL.SHORT)
    return result
  } catch (e) {
    console.error('[leaderboard] league exception:', e)
    return { rows: [], totalInLeague: 0 }
  }
}

/**
 * Моё место среди друзей. Для главной экрана — рядом с рангом.
 * Возвращает число (1, 2, ...). Если друзей нет — возвращает 1 (юзер сам себе лидер).
 *
 * Отдельная функция (не filter() из getFriendsLeaderboard) потому что:
 *  - запрашивается часто (на каждый рендер главной)
 *  - возвращает одно число (мало трафика)
 *  - можно кешировать дольше
 */
export async function getMyFriendsPlace() {
  const user = getCurrentUser()
  if (!user) return 1

  const cacheKey = `my-friend-place:${user.id}`
  const cached = cacheGet(cacheKey)
  if (cached !== null && cached !== undefined) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_my_friend_place', {
      p_user_id: user.id
    })

    if (error) {
      console.error('[leaderboard] my place error:', error)
      return 1
    }

    const place = data || 1
    cacheSet(cacheKey, place, TTL.MEDIUM)
    return place
  } catch (e) {
    console.error('[leaderboard] my place exception:', e)
    return 1
  }
}

/**
 * Моё место в ЛИГЕ (не среди друзей). Для главной и профиля рядом с кубком.
 * Возвращает { place, totalInLeague, rankIndex }. Дефолт { 1, 1, 0 }.
 */
export async function getMyLeaguePlace() {
  const user = getCurrentUser()
  if (!user) return { place: 1, totalInLeague: 1, rankIndex: 0 }

  const cacheKey = `my-league-place:${user.id}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  try {
    const { data, error } = await supabase.rpc('api_get_my_league_place', {
      p_user_id: user.id
    })

    if (error) {
      console.error('[leaderboard] my league place error:', error)
      return { place: 1, totalInLeague: 1, rankIndex: 0 }
    }

    const row = Array.isArray(data) ? data[0] : data
    const result = {
      place: row?.place ?? 1,
      totalInLeague: row?.total_in_league ?? 1,
      rankIndex: row?.rank_index ?? 0
    }
    cacheSet(cacheKey, result, TTL.MEDIUM)
    return result
  } catch (e) {
    console.error('[leaderboard] my league place exception:', e)
    return { place: 1, totalInLeague: 1, rankIndex: 0 }
  }
}

/**
 * Сбросить все кеши лидерборда. Вызывается:
 *  - после finish workout (мускулы изменились → место могло поменяться)
 *  - после complete quest (мускулы изменились)
 *  - после add friend (список друзей изменился)
 */
export function invalidateLeaderboardCache() {
  const user = getCurrentUser()
  if (!user) return
  cacheInvalidate(`leaderboard-friends:${user.id}`)
  cacheInvalidate(`leaderboard-league:${user.id}`)
  cacheInvalidate(`my-friend-place:${user.id}`)
  cacheInvalidate(`my-league-place:${user.id}`)
}