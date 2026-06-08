/**
 * Авторизация пользователя через Telegram WebApp (с проверкой подписи).
 *
 * Поток:
 *   1. Берём сырую подписанную строку initData из window.Telegram.WebApp.initData.
 *   2. Отправляем её в Edge Function telegram-auth — та проверяет HMAC-подпись
 *      бота, находит/создаёт auth-пользователя и связывает его с записью в users.
 *   3. Обмениваем возвращённый одноразовый token_hash на сессию через verifyOtp.
 *      После этого supabase-клиент работает от имени проверенного юзера (auth.uid()).
 *
 * Без данных Telegram вход не происходит — приложение работает в read-only режиме.
 * Веб-вход через почту появится позже как отдельный провайдер Supabase Auth.
 */

import { supabase } from './supabase'
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
    // Сырая подписанная строка initData от Telegram (НЕ initDataUnsafe).
    // Её проверяет Edge Function по HMAC-подписи бота.
    const initData = window.Telegram?.WebApp?.initData

    if (!initData) {
      // Нет данных Telegram — вход невозможен.
      // Веб-вход через почту появится позже как отдельный провайдер.
      authState = 'no-telegram'
      console.warn('[auth] Telegram initData not available. Open through Telegram.')
      return null
    }

    // 1. Отправляем initData в Edge Function: она проверяет подпись,
    //    находит/создаёт auth-пользователя и связывает его с записью в users.
    const { data: authData, error: fnError } = await supabase.functions.invoke(
      'telegram-auth',
      { body: { initData } }
    )

    if (fnError || !authData?.success || !authData?.token_hash) {
      console.error('[auth] telegram-auth failed:', fnError || authData)
      authState = 'error'
      authPromise = null
      return null
    }

    // 2. Обмениваем одноразовый token_hash на полноценную сессию.
    //    После этого supabase работает от имени проверенного юзера (auth.uid()).
    //    Если verifyOtp вернёт ошибку про невалидный/просроченный токен —
    //    поменяй type: 'email' на type: 'magiclink' (одна строка ниже).
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: authData.token_hash,
      type: 'email',
    })

    if (otpError || !otpData?.user?.id) {
      console.error('[auth] verifyOtp error:', otpError)
      authState = 'error'
      authPromise = null
      return null
    }

    // 3. Тянем свою запись из public.users по связке auth_id.
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', otpData.user.id)
      .single()

    if (userError || !userRecord) {
      console.error('[auth] user record not found by auth_id:', userError)
      authState = 'error'
      authPromise = null
      return null
    }

    currentUser = userRecord
    cacheUser(currentUser)
    authState = 'ok'
    console.log('[auth] Authorized as:', currentUser)
    emit(EVENTS.USER_READY, currentUser)

    // Проверяем start_param — если юзер пришёл по реф-ссылке, добавляем
    // отправителя в друзья. Делаем это после emit USER_READY чтобы UI
    // уже показал главную страницу, а добавление в друзья случилось в фоне.
    // Не блокируем return — пусть выполнится асинхронно без задержки старта.
    const refCode = getStartParamReferralCode()
    if (refCode) {
      console.log('[auth] referral code detected:', refCode)
      acceptReferral(refCode).then(result => {
        if (result.success) {
          console.log('[auth] friend added via referral')
          // Обновляем юзера и рассылаем USER_CHANGED чтобы UI обновил
          // место в рейтинге на главной
          emit(EVENTS.USER_CHANGED, currentUser)
        } else {
          console.warn('[auth] referral failed:', result.error)
        }
      }).catch(err => {
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