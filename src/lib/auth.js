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
import { restoreDevSession } from './dev-auth'
import { EVENTS, emit } from './events'
import { getStartParamReferralCode, acceptReferral } from './friends'
import { localGet, localSet, localRemove, localRemoveByPrefix } from '../utils/storage'
import { debug } from './debug'
import { resetPrefs } from './prefs'
import { setSessionAlive, markAuthBroken, hasSession } from './session'

const CACHED_USER_KEY = 'cached-user'

// Сколько ждём каждый шаг входа, прежде чем счесть связь мёртвой. Ни
// Edge Function, ни supabase-клиент сами не таймаутят: на плохой связи
// (VPN, зал, метро) запрос висел молча, а приложение всё это время
// считало, что входит — и открывалось с пустыми данными.
const AUTH_STEP_TIMEOUT_MS = 12000

/** Обернуть шаг входа таймаутом: не ответил вовремя — считаем сбоем связи. */
function withTimeout(promise, ms = AUTH_STEP_TIMEOUT_MS) {
  const TIMEOUT = Symbol('auth-timeout')
  let timer = null
  return Promise.race([
    Promise.resolve(promise),
    new Promise(resolve => { timer = setTimeout(() => resolve(TIMEOUT), ms) })
  ]).then(res => {
    clearTimeout(timer)
    if (res === TIMEOUT) throw new Error('auth step timeout')
    return res
  })
}

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
      // Дев-сборка: если в .env.local лежит токен сессии — входим по нему, без
      // кода с почты. В боевом бандле этой ветки нет вовсе (см. dev-auth.js).
      await restoreDevSession()

      // Браузер. Telegram тут не при чём, но человек мог войти по почте раньше —
      // сессия хранится клиентом и переживает перезапуск.
      const fromSession = await loadUserFromSession()
      if (fromSession) return fromSession

      debug('[auth] нет ни Telegram, ни сессии — покажем вход по почте')
      authPromise = null
      return null
    }

    // Вход в Telegram делается заново при каждом запуске, и все три его шага
    // ходят по сети. Любой из них может не дойти на плохой связи — тогда мы
    // остаёмся без сессии, а сервер начинает отвечать пустотой вместо данных
    // (пользовательские RPC узнают человека по подписи сессии, см. lib/session.js).
    // Поэтому шаги обёрнуты таймаутом, а срыв входа — не «молча ноль», а
    // осознанная развилка ниже: живая сессия прошлого запуска или честный сбой.
    let userRecord = null
    try {
      // 1. Отправляем initData в Edge Function: она проверяет подпись,
      //    находит/создаёт auth-пользователя и связывает его с записью в users.
      const { data: authData, error: fnError } = await withTimeout(
        supabase.functions.invoke('telegram-auth', { body: { initData } })
      )

      if (fnError || !authData?.success || !authData?.token_hash) {
        throw new Error('telegram-auth failed: ' + (fnError?.message || 'no token_hash'))
      }

      // 2. Обмениваем одноразовый token_hash на полноценную сессию.
      //    После этого supabase работает от имени проверенного юзера (auth.uid()).
      //    Если verifyOtp вернёт ошибку про невалидный/просроченный токен —
      //    поменяй type: 'email' на type: 'magiclink' (одна строка ниже).
      const { data: otpData, error: otpError } = await withTimeout(
        supabase.auth.verifyOtp({ token_hash: authData.token_hash, type: 'email' })
      )

      if (otpError || !otpData?.user?.id) {
        throw new Error('verifyOtp failed: ' + (otpError?.message || 'no user'))
      }

      // 3. Тянем свою запись из public.users по связке auth_id.
      const { data: record, error: userError } = await withTimeout(
        supabase.from('users').select('*').eq('auth_id', otpData.user.id).single()
      )

      if (userError || !record) {
        throw new Error('user record not found: ' + (userError?.message || 'empty'))
      }

      userRecord = record
      setSessionAlive(true)
    } catch (e) {
      console.error('[auth] вход через Telegram не прошёл:', e?.message)

      // ЗАПАСНОЙ ПУТЬ. Сессию мы храним (persistSession), и с прошлого удачного
      // запуска она обычно ещё жива — клиент сам продлевает токен. Тогда сорвавшийся
      // обмен подписи не повод сидеть без данных: входим по тому, что уже есть.
      const fromSession = await loadUserFromSession().catch(() => null)
      if (fromSession) {
        debug('[auth] Telegram-вход не дошёл, работаем по сессии прошлого запуска')
        authPromise = null   // связь плохая — дать шанс повторить вход позже
        return fromSession
      }

      // Ни нового входа, ни старой сессии: данных с сервера не будет вовсе.
      // Помечаем сбой — плашка покажет «Нет связи», а кеши не будут затёрты
      // пустыми ответами (см. lib/session.js).
      markAuthBroken()
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
 * Повторить вход, если он сорвался.
 *
 * Нужен потому, что вход одноразовый: не дошёл при запуске — приложение так и
 * работало бы без сессии до перезахода, показывая пустые заметки и нулевые веса
 * (сервер без подписи отдаёт пустоту). Зовём при возвращении сети и при выходе
 * приложения из фона (App.jsx).
 *
 * Возвращает пользователя или null. Ничего не делает, если сессия уже есть.
 */
export async function retryAuth() {
  if (hasSession()) return currentUser
  authPromise = null
  debug('[auth] повторная попытка входа')
  const user = await ensureAuth().catch(() => null)
  if (user && hasSession()) emit(EVENTS.USER_READY, user)
  return user
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

    // Сессия на месте — значит сервер узнает человека. Отмечаем это ДО запроса:
    // дальше чтение может не дойти по сети, но право читать у нас есть.
    setSessionAlive(true)

    const { data: userRecord, error } = await withTimeout(
      supabase.from('users').select('*').eq('auth_id', authId).maybeSingle()
    )

    if (error) {
      // ЗАПРОС НЕ ДОШЁЛ — это не повод выходить из аккаунта. Раньше здесь был
      // signOut на любую ошибку, и на плохой связи человека выбрасывало на экран
      // входа по почте: сессия была жива, а приложение её гасило само.
      // Отдаём последнего известного человека (он лежит в localStorage) —
      // приложение работает на кешах, данные догонят.
      console.warn('[auth] не смогли прочитать запись пользователя:', error.message)
      return currentUser || null
    }

    if (!userRecord) {
      // Ответ ПРИШЁЛ и записи в нём нет — аккаунт правда удалён (например,
      // с другого устройства). Мёртвая сессия будет молча ломать каждый
      // запрос, поэтому гасим её и просим войти заново.
      console.warn('[auth] сессия без пользователя, выходим')
      await supabase.auth.signOut()
      setSessionAlive(false)
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


/**
 * Всё, что на устройстве принадлежит конкретному человеку.
 *
 * Список ведётся руками, и это осознанно: снести localStorage целиком нельзя —
 * там лежат и не наши ключи. Заводишь новое хранимое значение про человека —
 * дописывай сюда, иначе оно переживёт выход и достанется следующему.
 */
const USER_SCOPED_KEYS = [
  'personal-records',       // рекорды
  'fav-exercises-list',     // любимые упражнения
  'user-programs',          // свои программы и программа от друга
  'active-workout',         // начатая тренировка
  'notification-settings',  // напоминания
  'offline-operations-queue' // неотправленное: применить его к ЧУЖОМУ аккаунту хуже, чем потерять
]

const USER_SCOPED_PREFIXES = [
  'prefs:',
  'friends-list:',
  'pcache:',
  'recent-workouts:',       // история тренировок
  'workout-progress:',      // галочки в дне
  'program:',               // цикл дней A/B/C, выбранное место
  'swim-pool:',
  'swim-reps:',
  'quick-set:',             // наборы быстрой тренировки
  'quick-on:'
]

/**
 * Выйти из аккаунта. Только для браузерной версии: в Telegram выходить некуда —
 * приложение узнаёт человека по подписи Telegram при каждом запуске, и кнопка
 * «выйти» там означала бы «выйти и тут же зайти обратно».
 *
 * Чистим ВСЁ, что помнит про человека. Иначе следующий, кто войдёт на этом
 * устройстве, увидит чужую историю тренировок, чужие рекорды и чужие
 * любимые упражнения — и не «до первого обновления», а до тех пор, пока
 * приложение само не перезапишет каждый кеш.
 */
export async function signOut() {
  try {
    await supabase.auth.signOut()
  } catch (e) {
    console.warn('[auth] signOut:', e)
  }

  currentUser = null
  authPromise = null
  setSessionAlive(false)
  resetPrefs()

  try {
    localRemove(CACHED_USER_KEY)
    for (const key of USER_SCOPED_KEYS) localRemove(key)
    for (const prefix of USER_SCOPED_PREFIXES) localRemoveByPrefix(prefix)
  } catch (e) { /* хранилище недоступно — не критично */ }

  emit(EVENTS.USER_CHANGED, null)
}
