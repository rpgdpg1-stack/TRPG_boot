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
import { cloudGet, cloudKeys } from './cloud-storage'
import { EVENTS, emit } from './events'
import { canReadServer, canTrust } from './session'

let memory = null
let loadedForUser = null
// Загружено ИЗ БАЗЫ для этого человека. Отдельно от loadedForUser: тот
// выставляется и при чтении с диска, а диск — ещё не правда.
let fetchedForUser = null
// Активная загрузка: параллельные вызовы обслуживает один запрос.
let inflight = null
// Ключи, чья запись ещё летит в базу. Ответ на чтение может обогнать запись
// и вернуть старое значение — эти ключи кладём поверх ответа.
const pending = new Map()

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
 * Подтянуть настройки из базы.
 *
 * Ходит в базу ОДИН раз на человека: дальше отдаёт то, что уже знает.
 * Раньше запрос слал каждый вызов, а зовёт его любая карточка программы при
 * появлении — при листании разделов запросы и записи шли вперемешку, ответы
 * возвращались не в том порядке, и карусель отбрасывало на прошлый раздел.
 * `force: true` — когда обновление правда нужно.
 */
export async function loadPrefs({ force = false } = {}) {
  const user = getCurrentUser()
  if (!user) return {}

  if (!force && fetchedForUser === user.id) return memory || {}
  if (inflight) return inflight

  inflight = fetchPrefs(user.id).finally(() => { inflight = null })
  return inflight
}

async function fetchPrefs(userId) {
  // Без сети или без сессии база отдаёт пустые настройки (человека она узнаёт
  // по подписи сессии) — и раньше эта пустота уезжала на диск, снося закрепы.
  if (!canReadServer()) return getPrefsSync()
  try {
    const { data, error } = await supabase.rpc('api_get_my_prefs')
    if (!canTrust(error)) {
      if (error) console.warn('[prefs] не смогли прочитать из базы:', error)
      return getPrefsSync()
    }
    const fromDb = (data && typeof data === 'object') ? data : {}
    // Свои ещё не подтверждённые правки — поверх ответа: пока запись летит,
    // база честно отдаёт старое значение, и без этого слоя интерфейс откатывался.
    const all = pending.size ? { ...fromDb, ...Object.fromEntries(pending) } : fromDb
    const changed = JSON.stringify(all) !== JSON.stringify(memory)
    memory = all
    loadedForUser = userId
    fetchedForUser = userId
    writeDisk(userId, all)
    // Событие — только на реальное изменение: холостые рассылки заставляли
    // экраны перечитываться и перерисовываться на ровном месте.
    if (changed) emit(EVENTS.PREFS_CHANGED, all)
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

  pending.set(key, value)
  try {
    const { error } = await supabase.rpc('api_set_my_pref', { p_key: key, p_value: value })
    if (error) { console.warn('[prefs] не сохранилось в базе:', error); return false }
    return true
  } catch (e) {
    console.warn('[prefs] исключение при записи:', e)
    return false
  } finally {
    // Снимаем пометку, только если поверх не легла более свежая правка того же ключа.
    if (pending.get(key) === value) pending.delete(key)
  }
}

/** Сбросить кеш (смена аккаунта, выход). */
export function resetPrefs() {
  memory = null
  loadedForUser = null
  fetchedForUser = null
  inflight = null
  pending.clear()
}

/**
 * РАЗОВЫЙ ПЕРЕЕЗД старых данных из облака Telegram в настройки аккаунта.
 *
 * До браузерной версии здесь жили выбранный раздел, активный день программы
 * и наборы быстрой тренировки. Просто бросить их нельзя: у людей, которые уже
 * пользуются приложением, цикл A/B/C начался бы заново, а короткие версии дней
 * исчезли бы. Поэтому при первом запуске после обновления забираем всё разом.
 *
 * Работает только внутри Telegram (в браузере облака нет) и только когда
 * настройки аккаунта ещё пусты — то есть ровно один раз.
 */
export async function migrateFromCloud() {
  const user = getCurrentUser()
  if (!user) return

  const already = getPrefsSync()
  if (Object.keys(already).length > 0) return

  const keys = await cloudKeys()
  if (!keys.length) return

  // Переносим только знакомое. Мусор и чужие ключи в аккаунт не тащим.
  const wanted = keys.filter(k =>
    k === 'favorite_programs' ||
    k === 'category-swiper-last' ||
    k.startsWith('program:') ||
    k.startsWith('quick-set:') ||
    k.startsWith('quick-on:') ||
    // Заплыв: число кругов и длина бассейна. Раньше в список не входили и
    // оставались только в CloudStorage — то есть жили внутри Telegram и в
    // браузер не доезжали (UX-007). Источник правды один: настройки аккаунта.
    k.startsWith('swim-reps:') ||
    k.startsWith('swim-pool:')
  )
  if (!wanted.length) return

  const collected = {}
  for (const key of wanted) {
    const raw = await cloudGet(key)
    if (raw === null || raw === undefined || raw === '') continue

    // Значения приезжают строками — приводим к тому виду, в котором их теперь
    // читает приложение, иначе «1» не станет включённой ракетой.
    if (key.startsWith('quick-on:')) collected[key] = raw === '1'
    else if (key.startsWith('swim-reps:') || key.startsWith('swim-pool:')) {
      const n = parseInt(raw, 10)
      if (Number.isFinite(n)) collected[key] = n
    }
    else if (key.startsWith('quick-set:') || key === 'favorite_programs') {
      try { collected[key] = JSON.parse(raw) } catch { /* битое — пропускаем */ }
    } else collected[key] = raw
  }

  const entries = Object.entries(collected)
  if (!entries.length) return

  for (const [key, value] of entries) await setPref(key, value)
  console.info(`[prefs] перенесено из облака Telegram: ${entries.length}`)
}
