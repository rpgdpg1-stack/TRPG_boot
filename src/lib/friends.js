/**
 * Друзья — добавление по реферальной ссылке, генерация приглашения.
 *
 * Реферальный код хранится в users.referral_code (формат: 'ref_xxxxxxxx').
 * Создаётся вместе с записью пользователя (значение по умолчанию у колонки).
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
      return {
        success: true,
        friend_id: data.friend_id,
        friend_name: data.friend_name || null,
        // true — дружба уже была: тогда это не новость, а подтверждение,
        // и текст человеку нужен другой.
        already: !!data.already
      }
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
 * Ссылка РАЗНАЯ в зависимости от того, откуда приглашают, и это принципиально:
 *
 *   • из Telegram — ссылка на мини-приложение (t.me/бот/апп?startapp=код) плюс
 *     нативный диалог «Поделиться»;
 *   • из браузера — ссылка на сайт (адрес?ref=код), которую открывает кто угодно.
 *
 * Наоборот нельзя: человеку, который сидит в браузере и Telegram не пользуется,
 * ссылка на мини-приложение бесполезна — он её просто не откроет. А раньше
 * копировалась именно она, потому что браузер считался режимом разработки.
 */
export async function shareReferralLink() {
  const code = getMyReferralCode()
  if (!code) {
    console.warn('[friends] shareReferralLink: no referral code')
    return false
  }

  const text = '💪🏻 Тренируйся со мной в TRPG'
  const insideTelegram = !!tg?.initData

  if (insideTelegram && typeof tg.openTelegramLink === 'function') {
    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'YourBot'
    const appName = import.meta.env.VITE_APP_NAME || 'app'
    const link = `https://t.me/${botUsername}/${appName}?startapp=${code}`
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
    tg.openTelegramLink(shareUrl)
    return true
  }

  // Браузер: ссылка на сайт. Пришедший по ней попадёт на вход по почте, а код
  // приглашения доедет до сервера вместе с кодом из письма — дружба заведётся
  // сама, без отдельного шага «а теперь найдите друга».
  const webLink = `${window.location.origin}/?ref=${encodeURIComponent(code)}`

  // Родное меню «Поделиться» есть почти на всех телефонах — оно удобнее буфера,
  // потому что сразу предлагает мессенджеры.
  if (navigator.share) {
    try {
      await navigator.share({ title: 'TRPG', text, url: webLink })
      return true
    } catch (e) {
      // Человек закрыл меню — это не ошибка, молча уходим в копирование.
      if (e?.name === 'AbortError') return false
    }
  }

  try {
    await navigator.clipboard.writeText(webLink)
    window.alert(`Ссылка скопирована:\n${webLink}`)
    return true
  } catch (e) {
    window.alert(`Скопируй ссылку вручную:\n${webLink}`)
    return false
  }
}