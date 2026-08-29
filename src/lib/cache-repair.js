/**
 * Разовая починка кешей, испорченных ответами без сессии.
 *
 * Предыстория. Пользовательские данные сервер отдаёт по подписи сессии, а не по
 * переданному id (см. lib/session.js). Пока этого не учитывали, запуск без
 * сессии — обычное дело в Telegram на плохой связи — приносил пустые ответы,
 * и они уезжали в localStorage поверх настоящих данных: заметка становилась
 * пустой строкой, веса — пустым объектом, любимые и рекорды — пустым списком.
 * Дальше приложение читало уже кеш и в сеть не шло, поэтому «пропало» держалось
 * до истечения TTL (у заметок это неделя).
 *
 * Сама причина устранена — пустые ответы больше не кешируются. Но у тех, кто
 * успел словить, испорченные записи уже лежат на диске. Их и убирает эта
 * чистка, ровно один раз (метка `cache-repair-done`).
 *
 * Осторожность в основе: удаляем ТОЛЬКО пустые записи. Непустая запись пустотой
 * появиться не могла, значит она настоящая — и её трогать нельзя, иначе человек
 * без сети останется вообще ни с чем.
 */

import { localGet, localSet } from '../utils/storage'
import { debug } from './debug'

const DONE_KEY = 'cache-repair-done'
const DONE_VALUE = 'empty-cache-purge-1'

// Что проверяем: persistent-кеши (с префиксом pcache:) и отдельные ключи,
// куда пишутся списки, приходящие с сервера.
const PREFIXES = [
  'pcache:note:',
  'pcache:user-weights:',
  'pcache:user-swaps:',
  'pcache:workout-day:',
  'pcache:my-exercises:',
  'pcache:pubprofile:',
  'friends-list:',
  'recent-workouts:',
  'prefs:'
]

const EXACT_KEYS = [
  'personal-records',
  'fav-exercises-list',
  'user-programs'
]

/** Пустое ли значение: '', [], {}, null — всё, что могло приехать «без сессии». */
function isEmptyValue(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    // Записи pcache завёрнуты в { data, expiresAt } — смотрим на данные.
    if ('data' in value && 'expiresAt' in value) return isEmptyValue(value.data)
    // Рекорды приходят объектом с тремя полями, каждое может быть null.
    const values = Object.values(value)
    if (values.length === 0) return true
    return values.every(v => v === null || v === undefined)
  }
  return false
}

function isEmptyRaw(raw) {
  if (raw === null) return false          // ключа нет — чинить нечего
  if (raw.trim() === '') return true
  try { return isEmptyValue(JSON.parse(raw)) } catch { return false }
}

/**
 * Пройтись по кешам и выбросить пустые записи. Безопасно звать при каждом
 * запуске: после первого прохода выходит сразу по метке.
 */
export function repairEmptyCaches() {
  if (localGet(DONE_KEY) === DONE_VALUE) return

  try {
    const doomed = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const watched = EXACT_KEYS.includes(key) || PREFIXES.some(p => key.startsWith(p))
      if (!watched) continue
      if (isEmptyRaw(localStorage.getItem(key))) doomed.push(key)
    }
    doomed.forEach(k => { try { localStorage.removeItem(k) } catch { /* ignore */ } })
    if (doomed.length) debug('[cache-repair] выброшено пустых записей:', doomed.length)
    localSet(DONE_KEY, DONE_VALUE)
  } catch {
    /* хранилище недоступно — чинить нечего */
  }
}
