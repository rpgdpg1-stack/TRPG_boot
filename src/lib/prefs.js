/**
 * Личные настройки аккаунта: закреплённые программы и прочее в том же духе.
 *
 * ПОЧЕМУ НЕ CloudStorage. Раньше такие вещи хранились в CloudStorage Telegram,
 * и пока вход был один, это работало. С браузерной версией правило сломалось
 * сразу дважды: в браузере CloudStorage не существует, а ключ в localStorage
 * общий на устройство — и человек, открывший СВОЙ аккаунт в том же браузере,
 * видел ЧУЖИЕ закрепы. Поэтому источник правды переехал в базу, к аккаунту.
 *
 * КАК ЧИТАЕТСЯ. Три уровня, от быстрого к правдивому:
 *   1. память — в пределах сеанса;
 *   2. localStorage под ключом С ID ЧЕЛОВЕКА — чтобы первый кадр рисовался
 *      мгновенно и чтобы соседний аккаунт не подсунул своё;
 *   3. база — настоящий источник, подтягивается сразу после входа.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { localGet, localSet } from '../utils/storage'
import { EVENTS, emit } from './events'

let memory = null
let loadedForUser = null

function diskKey(userId) {
  return `prefs:${userId}`
}

function readDisk(userId) {
  try {
    const raw = localGet(diskKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed : null
  } catch { return null }
}

function writeDisk(userId, all) {
  try { localSet(diskKey(userId), JSON.stringify(all)) } catch { /* переполнен — не беда */ }
}

/**
 * Все настройки СИНХРОННО — для первого кадра. Возвращает {} если ничего
 * не известно: пустая карта честнее, чем ожидание.
 */
export function getPrefsSync() {
  const user = getCurrentUser()
  if (!user) return {}
  if (memory && loadedForUser === user.id) return memory
  const disk = readDisk(user.id)
  if (disk) { memory = disk; loadedForUser = user.id; return disk }
  return {}
}

export function getPrefSync(key, fallback = null) {
  const all = getPrefsSync()
  return key in all ? all[key] : fallback
}

/**
 * Подтянуть настройки из базы. Зовётся один раз после входа; результат
 * оседает и в памяти, и на диске.
 */
export async function loadPrefs() {
  const user = getCurrentUser()
  if (!user) return {}

  try {
    const { data, error } = await supabase.rpc('api_get_my_prefs')
    if (error) {
      console.warn('[prefs] не смогли прочитать из базы:', error)
      return getPrefsSync()
    }
    const all = (data && typeof data === 'object') ? data : {}
    memory = all
    loadedForUser = user.id
    writeDisk(user.id, all)
    emit(EVENTS.PREFS_CHANGED, all)
    return all
  } catch (e) {
    console.warn('[prefs] исключение при чтении:', e)
    return getPrefsSync()
  }
}

/**
 * Записать настройку. Сначала локально (чтобы интерфейс ответил мгновенно),
 * потом в базу. Если база не ответит, локальное значение останется — при
 * следующем входе его перезапишет настоящее, и это правильный размен:
 * закреп важнее не потерять сейчас, чем идеально синхронизировать потом.
 */
export async function setPref(key, value) {
  const user = getCurrentUser()
  if (!user) return false

  const all = { ...getPrefsSync(), [key]: value }
  memory = all
  loadedForUser = user.id
  writeDisk(user.id, all)
  emit(EVENTS.PREFS_CHANGED, all)

  try {
    const { error } = await supabase.rpc('api_set_my_pref', { p_key: key, p_value: value })
    if (error) { console.warn('[prefs] не сохранилось в базе:', error); return false }
    return true
  } catch (e) {
    console.warn('[prefs] исключение при записи:', e)
    return false
  }
}

/** Сбросить кеш (смена аккаунта, выход). */
export function resetPrefs() {
  memory = null
  loadedForUser = null
}
