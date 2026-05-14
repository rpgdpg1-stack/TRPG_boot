/**
 * Обёртка над Telegram CloudStorage с фоллбэком на localStorage.
 *
 * Зачем: CloudStorage синхронизирует данные между всеми устройствами юзера
 * (закрепы, активные дни, настройки). localStorage — только на одном устройстве.
 *
 * Архитектура:
 *  - Если Telegram доступен → пишем И в Cloud И в localStorage (как быстрый кеш)
 *  - Если Telegram недоступен (dev в браузере) → только localStorage
 *  - При чтении: сначала проверяем localStorage (моментально), потом синкаем с Cloud
 *
 * Лимиты Telegram CloudStorage:
 *  - 1024 ключа на юзера
 *  - 1-128 символов в имени ключа (только A-Z, a-z, 0-9, _ и -)
 *  - 0-4096 символов в значении
 *
 * Важно: имена ключей в localStorage могут содержать ':' и другие символы,
 * для Cloud мы их санитизируем (заменяем на '-').
 */

import { localGet, localSet, localRemove } from '../utils/storage'

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

/**
 * CloudStorage доступен только в новых версиях Telegram (>=6.9).
 * Если поле отсутствует — будем работать через localStorage.
 */
function hasCloudStorage() {
  return !!(tg?.CloudStorage)
}

/**
 * Санитизирует имя ключа для CloudStorage:
 * заменяет недопустимые символы (':', '/', и т.п.) на '-'.
 *
 * Например: 'program:split:last_day' → 'program-split-last_day'
 */
function sanitizeKey(key) {
  return key.replace(/[^A-Za-z0-9_-]/g, '-')
}

/**
 * Прочитать значение по ключу.
 * Сначала пробует localStorage (моментально), параллельно синкает с Cloud.
 * Возвращает значение из localStorage сразу — Cloud догонит асинхронно.
 *
 * Если в Cloud есть, а в localStorage нет (например, юзер на новом устройстве) —
 * Promise разрешится значением из Cloud.
 */
export async function cloudGet(key) {
  // 1. Быстрая проверка localStorage
  const local = localGet(key)

  // 2. Если есть Telegram CloudStorage — пробуем его и кешируем в local
  if (hasCloudStorage()) {
    try {
      const cloudValue = await getCloudItemPromise(sanitizeKey(key))

      // Cloud возвращает '' для несуществующих ключей. Это значит "пусто".
      if (cloudValue && cloudValue.length > 0) {
        // Кешируем в localStorage чтобы в следующий раз было моментально
        if (cloudValue !== local) {
          localSet(key, cloudValue)
        }
        return cloudValue
      }

      // Если в Cloud пусто, а в local есть — заливаем local в Cloud
      // (миграция со старого устройства)
      if (local && !cloudValue) {
        setCloudItemPromise(sanitizeKey(key), local).catch(() => {})
        return local
      }
    } catch (e) {
      console.warn('[cloud-storage] cloudGet error, falling back to local:', e?.message)
    }
  }

  return local
}

/**
 * Записать значение по ключу.
 * Записываем И в localStorage (для быстрого чтения), И в Cloud (для синка).
 */
export async function cloudSet(key, value) {
  // Сначала localStorage — синхронно, моментально
  localSet(key, value)

  // Потом Cloud — асинхронно, не блокируем UI
  if (hasCloudStorage()) {
    try {
      await setCloudItemPromise(sanitizeKey(key), String(value))
    } catch (e) {
      console.warn('[cloud-storage] cloudSet error (local saved):', e?.message)
    }
  }
}

/**
 * Удалить значение по ключу из обоих хранилищ.
 */
export async function cloudRemove(key) {
  localRemove(key)

  if (hasCloudStorage()) {
    try {
      await removeCloudItemPromise(sanitizeKey(key))
    } catch (e) {
      console.warn('[cloud-storage] cloudRemove error (local removed):', e?.message)
    }
  }
}

/* ============================================ */
/* Внутренние Promise-обёртки над callback API Telegram */
/* ============================================ */

function getCloudItemPromise(key) {
  return new Promise((resolve, reject) => {
    tg.CloudStorage.getItem(key, (error, value) => {
      if (error) reject(new Error(error))
      else resolve(value || '')
    })
  })
}

function setCloudItemPromise(key, value) {
  return new Promise((resolve, reject) => {
    tg.CloudStorage.setItem(key, value, (error, success) => {
      if (error) reject(new Error(error))
      else resolve(success)
    })
  })
}

function removeCloudItemPromise(key) {
  return new Promise((resolve, reject) => {
    tg.CloudStorage.removeItem(key, (error, success) => {
      if (error) reject(new Error(error))
      else resolve(success)
    })
  })
}