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