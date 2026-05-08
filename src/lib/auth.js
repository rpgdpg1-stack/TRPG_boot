/**
 * Авторизация пользователя через Telegram WebApp.
 *
 * При старте приложения берём данные пользователя из Telegram SDK,
 * вызываем RPC upsert_user в Supabase — она создаёт или обновляет запись.
 * Получаем внутренний ID нашего юзера и держим его в памяти приложения.
 *
 * Используется в App.jsx при старте, и в storage.js (Г6) при чтении/записи данных.
 */

import { supabase } from './supabase'
import { getUser as getTelegramUser } from './telegram'

// Текущий авторизованный юзер. Заполняется при старте приложения.
let currentUser = null

/**
 * Получить текущего юзера (синхронно, после авторизации).
 * Вернёт null если ensureAuth ещё не выполнился или упал.
 */
export function getCurrentUser() {
  return currentUser
}

/**
 * Запустить авторизацию: достать данные из Telegram, синхронизировать с Supabase.
 * Вызывается один раз при старте приложения из App.jsx.
 *
 * Возвращает объект юзера из БД (или null если что-то пошло не так).
 */
export async function ensureAuth() {
  const tgUser = getTelegramUser()

  // Если приложение запущено вне Телеги (например DevTools на десктопе) —
  // используем фейковый ID для разработки.
  // ВАЖНО: в проде Mini App всегда даёт реальный telegram_id.
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
    currentUser = null
    return null
  }

  currentUser = data
  console.log('[auth] Авторизован как:', currentUser)
  return currentUser
}

/**
 * Фейковый ID для разработки вне Телеги.
 * Берём из localStorage чтобы был стабильный между перезагрузками.
 */
function getDevFallbackId() {
  let id = localStorage.getItem('dev_telegram_id')
  if (!id) {
    // Случайный ID в диапазоне 100000000-999999999 (как реальные telegram_id)
    id = String(Math.floor(100_000_000 + Math.random() * 900_000_000))
    localStorage.setItem('dev_telegram_id', id)
  }
  return parseInt(id, 10)
}
