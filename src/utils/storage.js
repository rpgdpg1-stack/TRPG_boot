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

/**
 * Снести все ключи с данным началом. Нужно при выходе из аккаунта: кеши
 * настроек, друзей и данных лежат под ключами, куда входит id человека, —
 * перечислить их поимённо нельзя, а оставить чужому нельзя тем более.
 */
export function localRemoveByPrefix(prefix) {
  try {
    const doomed = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) doomed.push(key)
    }
    doomed.forEach(key => localStorage.removeItem(key))
  } catch { /* приватный режим — просто нечего чистить */ }
}
