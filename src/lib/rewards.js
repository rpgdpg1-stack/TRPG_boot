/**
 * Награды — значки лиг и сезонные рамки.
 *
 * Два типа:
 *  - badge (значок лиги) — выдаётся ОДИН РАЗ при первом достижении лиги
 *  - frame (рамка сезона) — топ-3 каждой лиги в конце сезона
 *
 * При входе в приложение фронт спрашивает api_get_pending_rewards.
 * Если есть невыданные — показывает модалки по одной с кнопкой "Дальше".
 * После показа каждой — вызывает api_mark_reward_shown.
 *
 * Накопленные награды юзер потом видит в профиле и может выбрать активную рамку.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'

/**
 * Получить невыданные награды (модалки которые ещё не показывали юзеру).
 * Возвращает { badges: [...], frames: [...] }.
 *
 * Каждый элемент:
 *  badge: { id, rank_index, type: 'badge' }
 *  frame: { id, season_key, season_name, rank_index, place, type: 'frame' }
 */
export async function getPendingRewards() {
  const user = getCurrentUser()
  if (!user) return { badges: [], frames: [] }

  try {
    const { data, error } = await supabase.rpc('api_get_pending_rewards', {
      p_user_id: user.id
    })

    if (error) {
      console.error('[rewards] getPendingRewards error:', error)
      return { badges: [], frames: [] }
    }

    return {
      badges: data?.badges || [],
      frames: data?.frames || []
    }
  } catch (e) {
    console.error('[rewards] getPendingRewards exception:', e)
    return { badges: [], frames: [] }
  }
}

/**
 * Пометить награду как показанную. Вызывается после закрытия модалки.
 * type должен быть 'badge' или 'frame'.
 */
export async function markRewardShown(rewardId, type) {
  if (!rewardId || !type) return false

  try {
    const { error } = await supabase.rpc('api_mark_reward_shown', {
      p_reward_id: rewardId,
      p_type: type
    })

    if (error) {
      console.error('[rewards] markRewardShown error:', error)
      return false
    }

    return true
  } catch (e) {
    console.error('[rewards] markRewardShown exception:', e)
    return false
  }
}

/**
 * Получить все награды юзера (для экрана профиля).
 * В отличие от pending тут показываем ВСЁ что есть, включая уже показанные.
 *
 * Возвращает { badges: [...], frames: [...] } отсортировано по дате (свежие сверху).
 */
export async function getAllUserRewards() {
  const user = getCurrentUser()
  if (!user) return { badges: [], frames: [] }

  try {
    // Прямые запросы к таблицам — отдельный RPC пока не делал,
    // потому что для профиля это не критично по скорости.
    const [badgesRes, framesRes] = await Promise.all([
      supabase
        .from('league_badges')
        .select('id, rank_index, earned_at')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false }),
      supabase
        .from('season_rewards')
        .select('id, season_key, season_name, rank_index, place, awarded_at')
        .eq('user_id', user.id)
        .order('awarded_at', { ascending: false })
    ])

    if (badgesRes.error) console.warn('[rewards] badges fetch error:', badgesRes.error)
    if (framesRes.error) console.warn('[rewards] frames fetch error:', framesRes.error)

    return {
      badges: badgesRes.data || [],
      frames: framesRes.data || []
    }
  } catch (e) {
    console.error('[rewards] getAllUserRewards exception:', e)
    return { badges: [], frames: [] }
  }
}

/**
 * Сводка наград Бессмертного (медали + титулы).
 * Возвращает { gold, silver, bronze, best_place, title1, title2, title3 }.
 *  - gold/silver/bronze — счётчики медалей (по всем сезонам)
 *  - best_place — лучшее место (1/2/3) или null → для медали в карточке профиля
 *  - title1/2/3 — открыт ли титул #1/#2/#3 (хоть раз занял место)
 */
export async function getImmortalAwards(userId) {
  const uid = userId || getCurrentUser()?.id
  if (!uid) return { gold: 0, silver: 0, bronze: 0, best_place: null, title1: false, title2: false, title3: false }

  try {
    const { data, error } = await supabase.rpc('api_get_immortal_awards', { p_user_id: uid })
    if (error) {
      console.error('[rewards] getImmortalAwards error:', error)
      return { gold: 0, silver: 0, bronze: 0, best_place: null, title1: false, title2: false, title3: false }
    }
    return data || { gold: 0, silver: 0, bronze: 0, best_place: null, title1: false, title2: false, title3: false }
  } catch (e) {
    console.error('[rewards] getImmortalAwards exception:', e)
    return { gold: 0, silver: 0, bronze: 0, best_place: null, title1: false, title2: false, title3: false }
  }
}

/**
 * Надеть/снять активный титул (#1/#2/#3 или null чтобы снять).
 * Пишет в users.active_title напрямую (колонка в разрешённых для UPDATE).
 * value: 1 | 2 | 3 | null
 */
export async function setActiveTitle(value) {
  const user = getCurrentUser()
  if (!user) return false
  try {
    const { error } = await supabase
      .from('users')
      .update({ active_title: value === null ? null : String(value) })
      .eq('id', user.id)
    if (error) {
      console.error('[rewards] setActiveTitle error:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('[rewards] setActiveTitle exception:', e)
    return false
  }
}