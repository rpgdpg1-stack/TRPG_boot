/**
 * Persistent-кеш в localStorage с TTL.
 *
 * Отличие от cache.js: тот живёт в памяти вкладки и пропадает когда Telegram
 * сворачивает Mini App надолго (WebView пересоздаётся). Этот — в localStorage,
 * переживает перезапуск. Нужен чтобы в зале БЕЗ СЕТИ открыть день тренировки
 * с нуля (упражнения + последние веса), даже после того как приложение
 * полностью закрывали.
 *
 * Используется как ВТОРОЙ уровень кеша в getWorkoutDay:
 *   память (cache.js) → localStorage (этот файл) → сеть (Supabase)
 *
 * Формат хранения: ключ 'pcache:{key}', значение JSON { data, expiresAt }.
 *
 * TTL большой (7 дней) — данные упражнений и веса меняются редко, а в зале
 * без сети лучше показать чуть устаревшее чем пустой экран.
 */

import { localGet, localSet, localRemove } from '../utils/storage'

const PREFIX = 'pcache:'

// 7 дней — упражнения/веса меняются редко, оффлайн в зале важнее свежести
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Прочитать из persistent-кеша. Возвращает данные или null если нет/протухло.
 */
export function pcacheGet(key) {
  const raw = localGet(PREFIX + key)
  if (!raw) return null

  try {
    const entry = JSON.parse(raw)
    if (!entry || typeof entry !== 'object') return null

    // Протухло — удаляем и возвращаем null
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      localRemove(PREFIX + key)
      return null
    }

    return entry.data
  } catch {
    return null
  }
}

/**
 * Записать в persistent-кеш с TTL.
 */
export function pcacheSet(key, data, ttlMs = DEFAULT_TTL_MS) {
  const entry = {
    data,
    expiresAt: Date.now() + ttlMs
  }
  localSet(PREFIX + key, JSON.stringify(entry))
}

/**
 * Удалить один ключ.
 */
export function pcacheDelete(key) {
  localRemove(PREFIX + key)
}

/**
 * Удалить все ключи persistent-кеша (при сбросе прогресса).
 * localStorage не даёт перебор по префиксу напрямую — идём по всем ключам.
 */
export function pcacheClear() {
  try {
    const toRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) toRemove.push(k)
    }
    toRemove.forEach(k => {
      try { localStorage.removeItem(k) } catch { /* ignore */ }
    })
  } catch {
    /* localStorage недоступен — ничего не делаем */
  }
}