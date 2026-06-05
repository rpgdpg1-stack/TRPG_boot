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
import { getStartParamReferralCode, acceptReferral } from './friends'
import { localGet, localSet } from '../utils/storage'

const CACHED_USER_KEY = 'cached-user'

// При старте сразу поднимаем последнего известного юзера из localStorage,
// чтобы UI показал актуальные данные (мускулы, ранг) мгновенно, даже без
// сети — без мигания дефолтным Новичком.
let currentUser = (() => {
  const raw = localGet(CACHED_USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
})()

let authPromise = null
let authState = 'pending' // 'pending' | 'no-telegram' | 'ok' | 'error'

export function getCurrentUser() {
  return currentUser
}

/**
 * Сохранить юзера в localStorage (кеш для мгновенного старта без мигания).
 */
function cacheUser(user) {
  if (user) {
    localSet(CACHED_USER_KEY, JSON.stringify(user))
  }
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

    let telegramId, firstName, username, photoUrl

    if (tgUser?.id) {
      telegramId = tgUser.id
      firstName = tgUser.first_name || null
      username = tgUser.username || null
      photoUrl = tgUser.photo_url || null
      console.log('[auth] Telegram user found:', telegramId)
    } else {
      // Нет данных Telegram — вход невозможен (dev-режим убран).
      // Веб-вход через почту появится позже как отдельный провайдер.
      authState = 'no-telegram'
      console.warn('[auth] Telegram user data not available. Open through Telegram.')
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
    cacheUser(currentUser)
    authState = 'ok'
    console.log('[auth] Authorized as:', currentUser)
    emit(EVENTS.USER_READY, currentUser)

    // Проверяем start_param — если юзер пришёл по реф-ссылке, добавляем
    // отправителя в друзья. Делаем это после emit USER_READY чтобы UI
    // уже показал главную страницу, а добавление в друзья случилось в фоне.
    // Не блокируем return — пусть выполнится асинхронно без задержки старта.
    // [ВРЕМЕННАЯ ДИАГНОСТИКА РЕФЕРАЛА — убрать после отладки]
    const rawStartParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    const refCode = getStartParamReferralCode()
    window.alert(
      '[РЕФ-ОТЛАДКА]\n' +
      'start_param: ' + (rawStartParam ?? 'НЕТ') + '\n' +
      'refCode: ' + (refCode ?? 'НЕТ') + '\n' +
      'мой id: ' + (currentUser?.id ?? 'НЕТ')
    )
    if (refCode) {
      console.log('[auth] referral code detected:', refCode)
      acceptReferral(refCode).then(result => {
        window.alert('[РЕФ-ОТЛАДКА] ответ сервера: ' + JSON.stringify(result))
        if (result.success) {
          console.log('[auth] friend added via referral')
          // Обновляем юзера и рассылаем USER_CHANGED чтобы UI обновил
          // место в рейтинге на главной
          emit(EVENTS.USER_CHANGED, currentUser)
        } else {
          console.warn('[auth] referral failed:', result.error)
        }
      }).catch(err => {
        window.alert('[РЕФ-ОТЛАДКА] исключение: ' + (err?.message || err))
        console.warn('[auth] referral exception:', err)
      })
    }

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
  cacheUser(currentUser)
  emit(EVENTS.USER_CHANGED, currentUser)
  return currentUser
}

/**
 * Локально обновить кешированного юзера (без запроса в БД).
 */
export function setCurrentUser(user) {
  currentUser = user
  cacheUser(currentUser)
  emit(EVENTS.USER_CHANGED, currentUser)
}