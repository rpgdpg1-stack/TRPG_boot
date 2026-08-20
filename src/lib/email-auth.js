/**
 * Вход по почте — клиентская часть.
 *
 * Две серверные функции: одна выпускает код и шлёт письмо, вторая его
 * проверяет. Сам код нигде на клиенте не хранится и не сверяется — здесь
 * только пересылка и разбор ответа.
 *
 * Сессия выдаётся тем же одноразовым ключом, что и при входе через Telegram
 * (token_hash → verifyOtp). Механизм один на оба входа намеренно: расходиться
 * им нельзя, а второй набор граблей нам не нужен.
 */

import { supabase } from './supabase'
import { webApp } from './telegram'

/**
 * Тело ответа у функции, вернувшей не-2xx.
 *
 * supabase-js в этом случае бросает ошибку и прячет ответ в context, а нам
 * важно именно тело: там лежит причина отказа («рано», «неверный код») и
 * сколько секунд ждать. Без этого человек видел бы одну общую «ошибку сети»
 * там, где сервер объяснил всё словами.
 */
async function readErrorBody(error) {
  try {
    const res = error?.context
    if (res && typeof res.json === 'function') return await res.json()
  } catch { /* тело уже прочитано или не JSON */ }
  return null
}

async function callFunction(name, body) {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body })
    if (error) return (await readErrorBody(error)) || { ok: false, error: 'network' }
    return data || { ok: false, error: 'empty_response' }
  } catch (e) {
    console.error(`[email-auth] ${name} exception:`, e)
    return { ok: false, error: 'network' }
  }
}

/**
 * Запросить код на почту.
 *
 * purpose: 'login' — вход в браузере, 'link' — привязка изнутри Telegram.
 * Для привязки прикладываем подписанные данные Telegram: сервер по ним
 * поймёт, к ЧЬЕМУ аккаунту привязывать, и без подписи откажет.
 */
export async function requestEmailCode(email, purpose = 'login') {
  const body = { email: String(email || '').trim().toLowerCase(), purpose }
  if (purpose === 'link') body.initData = webApp?.initData || ''
  return callFunction('email-request-code', body)
}

/**
 * Проверить код.
 *
 * refCode — реферальный код из ссылки-приглашения: если человек пришёл по ней,
 * дружба заведётся сразу при входе, а не отдельным шагом.
 */
export async function verifyEmailCode(email, code, purpose = 'login', refCode = null) {
  const body = {
    email: String(email || '').trim().toLowerCase(),
    code: String(code || '').trim(),
    purpose,
  }
  if (purpose === 'link') body.initData = webApp?.initData || ''
  if (refCode) body.refCode = refCode
  return callFunction('email-verify-code', body)
}

/**
 * Применить выданный сервером ключ входа: после этого supabase-клиент работает
 * от имени проверенного человека.
 */
export async function applySession(tokenHash) {
  if (!tokenHash) return false
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (error) {
    console.error('[email-auth] verifyOtp error:', error)
    return false
  }
  return true
}

/** Отвязать почту (останется вход через Telegram). */
export async function unlinkEmail() {
  const { data, error } = await supabase.rpc('api_unlink_my_email')
  if (error) return { ok: false, error: 'rpc_error' }
  return data
}

/** Отвязать Telegram (останется вход по почте). */
export async function unlinkTelegram() {
  const { data, error } = await supabase.rpc('api_unlink_my_telegram')
  if (error) return { ok: false, error: 'rpc_error' }
  return data
}

/**
 * Человеческий текст ошибки.
 *
 * Держим в одном месте: эти же коды приходят и на экране входа, и в привязке
 * почты внутри профиля, и формулировки обязаны совпадать. Отдельная тонкость —
 * 'both_have_data': это не поломка, а осознанный отказ, и текст должен
 * объяснять, что делать дальше, а не извиняться.
 */
export function emailErrorText(error, extra = {}) {
  switch (error) {
    case 'too_soon':
      return `Код уже отправлен. Повторить можно через ${extra.retry_after || 60} с`
    case 'rate_limited':
      return 'Слишком много запросов. Попробуйте через час'
    case 'wrong_code':
      return extra.attempts_left > 0
        ? `Неверный код. Осталось попыток: ${extra.attempts_left}`
        : 'Неверный код'
    case 'too_many_attempts':
      return 'Слишком много попыток. Запросите новый код'
    case 'no_code':
      return 'Код устарел или уже использован. Запросите новый'
    case 'bad_email':
      return 'Проверьте адрес почты'
    case 'both_have_data':
      return 'На этой почте уже есть аккаунт с тренировками. Войдите в него в браузере или укажите другую почту'
    case 'other_has_telegram':
      return 'К этой почте уже привязан другой Telegram'
    case 'last_login_method':
      return 'Это единственный способ войти — сначала добавьте второй'
    case 'send_failed':
      return 'Не удалось отправить письмо. Попробуйте позже'
    case 'network':
      return 'Нет связи с сервером'
    default:
      return 'Что-то пошло не так. Попробуйте ещё раз'
  }
}
