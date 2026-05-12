/**
 * Авторизация пользователя через Telegram WebApp.
 *
 * Прод-режим: данные пользователя берутся из window.Telegram.WebApp.initDataUnsafe.user.
 * Без этих данных авторизация не происходит — приложение работает в read-only режиме.
 *
 * Дев-режим: явно включается через localStorage.setItem('dev_mode', 'true').
 * Когда включён — используется стабильный фейковый ID для разработки в браузере.
 */

import { supabase } from './supabase'
import { getUser as getTelegramUser } from './telegram'
import { EVENTS, emit } from './events'

let currentUser = null
let authPromise = null
let authState = 'pending' // 'pending' | 'no-telegram' | 'ok' | 'error'

export function getCurrentUser() {
  return currentUser
}

export function getAuthState() {
  return authState
}

/**
 * Запустить авторизацию. Безопасно вызывать многократно — выполнится один раз.
 */
export async function ensureAuth() {
  if (authPromise) return authPromise

  authPromise = (async () => {
    const tgUser = getTelegramUser()
    const devMode = localStorage.getItem('dev_mode') === 'true'

    let telegramId, firstName, username, photoUrl

    if (tgUser?.id) {
      telegramId = tgUser.id
      firstName = tgUser.first_name || null
      username = tgUser.username || null
      photoUrl = tgUser.photo_url || null
      console.log('[auth] Telegram user found:', telegramId)
    } else if (devMode) {
      telegramId = 999999999
      firstName = 'Dev User'
      username = null
      photoUrl = null
      console.log('[auth] Dev mode active, using fixed dev ID:', telegramId)
    } else {
      authState = 'no-telegram'
      console.warn('[auth] Telegram user data not available. Open through Telegram or enable dev mode.')
      return null
    }

    const { data, error } = await supabase.rpc('upsert_user', {
      p_telegram_id: telegramId,
      p_first_name: firstName,
      p_username: username,
      p_photo_url: photoUrl
    })

    if (error) {
      console.error('[auth] Auth error:', error)
      authState = 'error'
      authPromise = null
      return null
    }

    currentUser = data
    authState = 'ok'
    console.log('[auth] Authorized as:', currentUser)
    emit(EVENTS.USER_READY, currentUser)
    return currentUser
  })()

  return authPromise
}

/**
 * Перечитать юзера из БД (например после начисления мускулов).
 */
export async function refreshCurrentUser() {
  if (!currentUser) return null

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', currentUser.id)
    .single()

  if (error) {
    console.error('[auth] refreshCurrentUser error:', error)
    return null
  }

  currentUser = data
  emit(EVENTS.USER_CHANGED, currentUser)
  return currentUser
}

/**
 * Локально обновить кешированного юзера (без запроса в БД).
 */
export function setCurrentUser(user) {
  currentUser = user
  emit(EVENTS.USER_CHANGED, currentUser)
}