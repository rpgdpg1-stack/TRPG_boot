/**
 * Авторизация пользователя через Telegram WebApp.
 *
 * При старте приложения берём данные пользователя из Telegram SDK,
 * вызываем RPC upsert_user в Supabase — она создаёт или обновляет запись.
 * Получаем внутренний ID нашего юзера и держим его в памяти приложения.
 *
 * Подписка через CustomEvent 'user-ready' — компоненты ждут пока авторизация завершится.
 */

import { supabase } from './supabase'
import { getUser as getTelegramUser } from './telegram'

let currentUser = null
let authPromise = null // защита от множественных параллельных вызовов

/**
 * Получить текущего юзера (синхронно).
 * Вернёт null если ensureAuth ещё не выполнился.
 */
export function getCurrentUser() {
  return currentUser
}

/**
 * Запустить авторизацию. Безопасно вызывать многократно — выполнится один раз.
 */
export async function ensureAuth() {
  if (authPromise) return authPromise

  authPromise = (async () => {
    const tgUser = getTelegramUser()
    const telegramId = tgUser?.id || getDevFallbackId()
    const firstName = tgUser?.first_name || 'Dev User'
    const username = tgUser?.username || null
    const photoUrl = tgUser?.photo_url || null

    console.log('[auth] Авторизация для telegram_id:', telegramId)

    const { data, error } = await supabase.rpc('upsert_user', {
      p_telegram_id: telegramId,
      p_first_name: firstName,
      p_username: username,
      p_photo_url: photoUrl
    })

    if (error) {
      console.error('[auth] Ошибка авторизации:', error)
      authPromise = null // даём возможность ретрая
      return null
    }

    currentUser = data
    console.log('[auth] Авторизован как:', currentUser)

    // Уведомляем приложение что юзер готов
    window.dispatchEvent(new CustomEvent('user-ready', { detail: currentUser }))

    return currentUser
  })()

  return authPromise
}

/**
 * Перечитать юзера из БД (например после начисления мускулов).
 * Обновляет currentUser и шлёт событие user-updated.
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
  window.dispatchEvent(new CustomEvent('user-updated', { detail: currentUser }))
  return currentUser
}

/**
 * Локально обновить кешированного юзера (без запроса в БД).
 * Используем когда мы уже знаем новое значение поля (например после add_muscles).
 */
export function setCurrentUser(user) {
  currentUser = user
  window.dispatchEvent(new CustomEvent('user-updated', { detail: currentUser }))
}

/**
 * Фейковый ID для разработки вне Телеги.
 */
function getDevFallbackId() {
  let id = localStorage.getItem('dev_telegram_id')
  if (!id) {
    id = String(Math.floor(100_000_000 + Math.random() * 900_000_000))
    localStorage.setItem('dev_telegram_id', id)
  }
  return parseInt(id, 10)
}
