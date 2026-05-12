/**
 * Безопасные обёртки над localStorage.
 * Не падают если хранилище недоступно (приватный режим в Safari и т.п.).
 */

export function localGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function localSet(key, value) {
  try { localStorage.setItem(key, String(value)); return true } catch { return false }
}

export function localRemove(key) {
  try { localStorage.removeItem(key); return true } catch { return false }
}