/**
 * Друзья — добавление по реферальной ссылке, генерация приглашения.
 *
 * Реферальный код хранится в users.referral_code (формат: 'ref_xxxxxxxx').
 * Создан вместе с юзером при upsert_user (в SQL миграции).
 *
 * Flow добавления:
 *  1. Юзер A открывает приложение через t.me/bot/app?startapp=ref_X
 *  2. Telegram передаёт это в WebApp.initDataUnsafe.start_param
 *  3. App.jsx после auth проверяет startParam и вызывает acceptReferral(code)
 *  4. acceptReferral дёргает api_add_friend_by_ref → юзер становится другом
 *
 * Flow приглашения:
 *  1. Юзер тапает "Пригласить друга"
 *  2. shareReferralLink() формирует ссылку и открывает Telegram share-диалог
 *  3. Друг тапает по ссылке → попадает в Mini App с start_param
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

/**
 * Получить реферальный код текущего юзера.
 * Просто читаем из объекта юзера в памяти — после auth он там есть.
 */
export function getMyReferralCode() {
  const user = getCurrentUser()
  return user?.referral_code || null
}

/**
 * Принять реферальный код — добавить отправителя в друзья.
 * Вызывается один раз при первом входе через ссылку.
 *
 * Возвращает { success: true } или { success: false, error: '...' }.
 * Возможные error: 'not_found', 'self', 'limit'.
 */
export async function acceptReferral(referralCode) {
  const user = getCurrentUser()
  if (!user) return { success: false, error: 'no_user' }
  if (!referralCode) return { success: false, error: 'no_code' }

  try {
    const { data, error } = await supabase.rpc('api_add_friend_by_ref', {
      p_user_id: user.id,
      p_referral_code: referralCode
    })

    if (error) {
      console.error('[friends] acceptReferral RPC error:', error)
      return { success: false, error: 'rpc_error' }
    }

    if (data?.success) {
      return { success: true, friend_id: data.friend_id }
    }

    return { success: false, error: data?.error || 'unknown' }
  } catch (e) {
    console.error('[friends] acceptReferral exception:', e)
    return { success: false, error: 'exception' }
  }
}

/**
 * Прочитать start_param из Telegram WebApp.
 * Используется в App.jsx при инициализации, чтобы понять — пришёл ли юзер по реф-ссылке.
 *
 * Если параметра нет — возвращает null. Если есть, но это не реф-код (другой префикс) —
 * тоже null, чтобы не передать в acceptReferral мусор.
 */
export function getStartParamReferralCode() {
  if (!tg) return null
  const param = tg.initDataUnsafe?.start_param
  if (!param) return null
  if (!param.startsWith('ref_')) return null
  return param
}

/**
 * Поделиться реферальной ссылкой через Telegram.
 *
 * Используем tg.openTelegramLink + URL вида https://t.me/share/url?url=...&text=...
 * который открывает нативный share-диалог. Это работает во всех версиях Telegram.
 *
 * Если SDK недоступен (dev в браузере) — копируем ссылку в буфер обмена.
 */
export async function shareReferralLink() {
  const code = getMyReferralCode()
  if (!code) {
    console.warn('[friends] shareReferralLink: no referral code')
    return false
  }

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'YourBot'
  const appName = import.meta.env.VITE_APP_NAME || 'app'

  const link = `https://t.me/${botUsername}/${appName}?startapp=${code}`
  const text = `Качайся со мной в RPG Training App 💪`

  if (tg && typeof tg.openTelegramLink === 'function') {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
    tg.openTelegramLink(shareUrl)
    return true
  }

  // Fallback для разработки в браузере: копируем в буфер
  try {
    await navigator.clipboard.writeText(link)
    window.alert(`Ссылка скопирована:\n${link}`)
    return true
  } catch (e) {
    window.alert(`Скопируй ссылку вручную:\n${link}`)
    return false
  }
}