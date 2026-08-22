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
 * ВТОРОЙ ВХОД — ПОЧТА. Вне Telegram данных для входа нет, но может быть уже
 * выданная сессия: человек входил по коду из письма, и supabase-клиент хранит
 * её сам. Поэтому без initData мы не сдаёмся сразу, а сперва спрашиваем, нет
 * ли живой сессии. Нет — приложение покажет экран входа по почте.
 */

import { supabase } from './supabase'
import { EVENTS, emit } from './events'
import { getStartParamReferralCode, acceptReferral } from './friends'
import { localGet, localSet } from '../utils/storage'
import { debug } from './debug'

const CACHED_USER_KEY = 'cached-user'

// При старте сразу поднимаем последнего известного юзера из localStorage,
// чтобы UI показал актуальные данные (стрик, имя) мгновенно, даже без
// сети — без мигания дефолтным Новичком.
let currentUser = (() => {
  const raw = localGet(CACHED_USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
})()

let authPromise = null

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
      // Браузер. Telegram тут не при чём, но человек мог войти по почте раньше —
      // сессия хранится клиентом и переживает перезапуск.
      const fromSession = await loadUserFromSession()
      if (fromSession) return fromSession

      debug('[auth] нет ни Telegram, ни сессии — покажем вход по почте')
      authPromise = null
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
      authPromise = null
      return null
    }

    currentUser = userRecord
    cacheUser(currentUser)
    debug('[auth] Authorized as:', currentUser)
    emit(EVENTS.USER_READY, currentUser)

    // Проверяем start_param — если юзер пришёл по реф-ссылке, добавляем
    // отправителя в друзья. Делаем это после emit USER_READY чтобы UI
    // уже показал главную страницу, а добавление в друзья случилось в фоне.
    // Не блокируем return — пусть выполнится асинхронно без задержки старта.
    const refCode = getStartParamReferralCode()
    if (refCode) {
      debug('[auth] referral code detected:', refCode)
      acceptReferral(refCode).then(result => {
        if (result.success) {
          debug('[auth] friend added via referral')

          // Показываем «теперь вы друзья» только тому, у кого аккаунт УЖЕ был.
          // Новичку это лишний экран поверх первого впечатления: он и так
          // увидит друга в списке, а объяснять ему устройство приложения
          // модалкой в первую секунду — плохой момент.
          //
          // «Новичок» = запись создана только что, в этом же входе. Минуты
          // с запасом хватает: между созданием записи и этим кодом проходят
          // доли секунды.
          const createdAt = new Date(currentUser?.created_at || 0).getTime()
          const justRegistered = Date.now() - createdAt < 60 * 1000
          if (!justRegistered) {
            emit(EVENTS.FRIEND_INVITE, {
              name: result.friend_name || null,
              already: !!result.already
            })
          }
          // Обновляем юзера и рассылаем USER_CHANGED чтобы UI обновил
          // серия за неделю на главной
          emit(EVENTS.USER_CHANGED, currentUser)
          // Дружба завелась уже ПОСЛЕ старта приложения: страница «Друзья» к
          // этому моменту могла успеть отрисоваться с пустым списком. Отдельным
          // событием просим её сбросить кеш и перечитать — без этого человек,
          // пришедший по ссылке, видел «Пока нет друзей» до перезахода.
          emit(EVENTS.FRIENDS_CHANGED, { friendId: result.friend_id })
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
 * Поднять пользователя по уже существующей сессии (вход по почте).
 *
 * Возвращает запись из users или null. Используется и при старте в браузере,
 * и сразу после ввода кода — в обоих случаях сессия уже установлена, остаётся
 * найти, чья она.
 */
export async function loadUserFromSession() {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const authId = sessionData?.session?.user?.id
    if (!authId) return null

    const { data: userRecord, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle()

    if (error || !userRecord) {
      // Сессия есть, а записи нет — например, аккаунт удалили с другого
      // устройства. Держать мёртвую сессию незачем: она будет молча ломать
      // каждый запрос, поэтому гасим её и просим войти заново.
      console.warn('[auth] сессия без пользователя, выходим:', error)
      await supabase.auth.signOut()
      return null
    }

    currentUser = userRecord
    cacheUser(currentUser)
    debug('[auth] вход по сессии почты:', currentUser.id)
    emit(EVENTS.USER_READY, currentUser)
    return currentUser
  } catch (e) {
    console.error('[auth] loadUserFromSession exception:', e)
    return null
  }
}

/**
 * Перечитать юзера из БД (например после сброса прогресса).
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