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

import { localGet, localRemove, localSet } from '../utils/storage'

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
/**
 * Версия каталога упражнений — общая для всех кешей, где он лежит.
 *
 * Каталог живёт на диске 7 дней ради оффлайна в зале. Без версии правки в базе
 * (новые упражнения, заменённые превью) доезжали бы до пользователя только
 * когда кеш протухнет сам. Номер в ключе решает: поднял — прежний кеш никто
 * больше не читает, данные перечитываются из сети при первом же открытии.
 *
 * ПОДНИМАТЬ при каждом изменении состава каталога или ссылок на медиа.
 * v2 — 27 августа 2026: +55 упражнений из лицензионного пакета, новые превью.
 * v3 — 27 августа 2026: +11 упражнений из остатков архива, 4 замены превью,
 *      ex_062 удалено, ex_034 и ex_078 убраны в архив.
 * v4 — 27 августа 2026: содержимое ex_135 и ex_139 перенесено в ex_034 и ex_078
 *      (история подходов остаётся на своём упражнении), дубли удалены.
 */
export const CATALOG_VERSION = 4

/** Ключ кеша каталога (данные RPC api_get_all_exercises). */
export const CATALOG_CACHE_KEY = `exercises:all:v${CATALOG_VERSION}`

/**
 * Выбросить кеши каталога прошлых версий.
 *
 * Версия в ключе делает старый кеш невидимым для чтения, но сама запись
 * остаётся лежать в localStorage до истечения своих 7 дней. Места немного,
 * но каталог — самая крупная запись, и держать её мёртвой неделю ни к чему.
 */
export function pcacheDropOldCatalogs() {
  const live = [CATALOG_CACHE_KEY, `constructor-catalog-v${CATALOG_VERSION}`]
  const isCatalogKey = (name) =>
    name === 'exercises:all' || name.startsWith('exercises:all:v') ||
    name === 'constructor-catalog' || name.startsWith('constructor-catalog-v')

  try {
    const stale = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(PREFIX)) continue
      const name = k.slice(PREFIX.length)
      if (isCatalogKey(name) && !live.includes(name)) stale.push(k)
    }
    stale.forEach(k => { try { localStorage.removeItem(k) } catch { /* ignore */ } })
  } catch {
    /* localStorage недоступен — не страшно, кеш протухнет сам */
  }
}
