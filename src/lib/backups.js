/**
 * Подстраховка — поддержка друга/игрока из лиги.
 *
 * Жмёшь на чужом профиле "Подстраховать" → ему +100 💪, тебе +20 за поддержку.
 * Лимит: один игрок страхует другого раз в сутки (защита в БД через UNIQUE).
 * Получателю прилетает модалка "тебя подстраховали" при следующем заходе.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { invalidateLeaderboardCache } from './leaderboard'
import { cacheInvalidate } from './cache'
import { EVENTS, emit } from './events'

export const BACKUP_REWARD = 100
export const BACKUP_BONUS = 20
// Дублирует серверный лимит (анти-чит живёт в api_backup_user). Здесь — только для UI.
export const BACKUP_DAILY_LIMIT = 5

/**
 * Подстраховать игрока. Возвращает { success, error?, reward, backer_bonus, backerBadgeRank }.
 * error: 'self' | 'target_not_found' | 'already_today' | 'rpc_error' | 'no_user'
 *
 * При успехе:
 *  - инвалидирует кеши лидерборда (мускулы изменились у обоих)
 *  - обновляет локального юзера (backer получил +20)
 *  - если backer получил значок лиги за бонус — эмитит BADGE_EARNED
 */
export async function backupUser(targetId) {
  const user = getCurrentUser()
  if (!user) return { success: false, error: 'no_user' }
  if (!targetId) return { success: false, error: 'target_not_found' }

  try {
    const { data, error } = await supabase.rpc('api_backup_user', {
      p_backer_id: user.id,
      p_target_id: targetId,
      p_reward: BACKUP_REWARD,
      p_backer_bonus: BACKUP_BONUS
    })

    if (error) {
      console.error('[backups] backupUser RPC error:', error)
      return { success: false, error: 'rpc_error' }
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'unknown',
        dailyLimit: data?.daily_limit ?? BACKUP_DAILY_LIMIT,
        todayCount: data?.today_count ?? null
      }
    }

    // Backer получил +20 — обновим локальные мускулы оптимистично.
    const fresh = getCurrentUser()
    if (fresh) {
      const { setCurrentUser } = await import('./auth')
      setCurrentUser({ ...fresh, total_muscles: (fresh.total_muscles || 0) + (data.backer_bonus || 0) })
    }

    invalidateLeaderboardCache()
    cacheInvalidate(`muscle-history:${user.id}`)

    const backerBadgeRank = data.backer_new_badge_rank_index
    if (backerBadgeRank !== null && backerBadgeRank !== undefined) {
      emit(EVENTS.BADGE_EARNED, { rank_index: backerBadgeRank })
    }

    return {
      success: true,
      reward: data.reward || BACKUP_REWARD,
      backer_bonus: data.backer_bonus || BACKUP_BONUS,
      backerBadgeRank,
      dailyLimit: data.daily_limit ?? BACKUP_DAILY_LIMIT,
      todayCount: data.today_count ?? null
    }
  } catch (e) {
    console.error('[backups] backupUser exception:', e)
    return { success: false, error: 'exception' }
  }
}

/**
 * Получить невыданные "меня подстраховали" — для модалки-списка.
 * Возвращает массив: { id, reward, backer_id, first_name, username, photo_url,
 *   total_muscles, rank_index, can_return }
 */
export async function getPendingBackups() {
  const user = getCurrentUser()
  if (!user) return []

  try {
    const { data, error } = await supabase.rpc('api_get_pending_backups', {
      p_user_id: user.id
    })
    if (error) {
      console.error('[backups] getPendingBackups error:', error)
      return []
    }
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error('[backups] getPendingBackups exception:', e)
    return []
  }
}

/**
 * Пометить подстраховки показанными (после закрытия модалки).
 * ids — массив id записей backups.
 */
export async function markBackupsShown(ids) {
  if (!ids || ids.length === 0) return true
  try {
    const { error } = await supabase.rpc('api_mark_backups_shown', { p_ids: ids })
    if (error) {
      console.error('[backups] markBackupsShown error:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('[backups] markBackupsShown exception:', e)
    return false
  }
}

/**
 * Публичный профиль чужого юзера для модалки профиля из рейтинга.
 * Принимает p_viewer_id (текущий юзер) — сервер докладывает статусы подстраховки.
 * Возвращает { last_workout, weekly_streak, weekly_streak_week, total_workouts,
 *   already_backed_today, today_backup_count, daily_backup_limit } | null.
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
      console.error('[backups] getUserPublicProfile error:', error)
      return null
    }
    return data || null
  } catch (e) {
    console.error('[backups] getUserPublicProfile exception:', e)
    return null
  }
}