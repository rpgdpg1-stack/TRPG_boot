/**
 * Настройки напоминаний.
 *
 * Лежат в базе, а не в Telegram CloudStorage, как остальные предпочтения:
 * рассылку делает бот со стороны сервера, а в CloudStorage он заглянуть не
 * может — это хранилище видно только самому приложению.
 *
 * localStorage используется как кеш: экран должен открываться с готовыми
 * тумблерами, а не перещёлкивать их вторым кадром, когда придёт ответ базы.
 */

import { supabase } from './supabase'
import { localGet, localSet } from '../utils/storage'

const CACHE_KEY = 'notification-settings'

/** Обоим напоминаниям по умолчанию «включено»: человек их не просил, но и не
 *  отказывался, а молчащий бот выглядит как сломанный. Выключить — один тап. */
export const DEFAULTS = { digest: true, nudge: true }

/** Мгновенное чтение из кеша — для первого кадра экрана. */
export function getCachedSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localGet(CACHE_KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Чтение из базы. Ошибка сети — возвращаем кеш, экран не должен падать. */
export async function fetchSettings() {
  const { data, error } = await supabase.rpc('api_get_notification_settings')
  if (error || !data?.length) {
    if (error) console.error('[notifications] fetch error:', error)
    return getCachedSettings()
  }
  const settings = { digest: !!data[0].notify_digest, nudge: !!data[0].notify_nudge }
  localSet(CACHE_KEY, JSON.stringify(settings))
  return settings
}

/** Сохранение. Кеш пишем сразу — тумблер обязан реагировать без задержки. */
export async function saveSettings(settings) {
  localSet(CACHE_KEY, JSON.stringify(settings))
  const { error } = await supabase.rpc('api_set_notification_settings', {
    p_digest: settings.digest,
    p_nudge: settings.nudge
  })
  if (error) console.error('[notifications] save error:', error)
  return !error
}

/**
 * Отметка захода в приложение.
 *
 * По ней бот отличает «человек увидел пинок и вернулся» от «пишем в пустоту»:
 * после трёх пинков подряд без единого захода рассылка притихает. Заодно
 * обнуляет счётчик — на стороне базы, одним запросом.
 */
export async function touchLastSeen() {
  const { error } = await supabase.rpc('api_touch_last_seen')
  if (error) console.error('[notifications] touch error:', error)
}
