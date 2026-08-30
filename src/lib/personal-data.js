/**
 * Личные данные аккаунта: пол, рост, год рождения.
 *
 * ГДЕ ЖИВУТ. Источник правды — таблица users, чтобы данные не терялись при
 * входе с другого устройства. Рядом лежит копия в localStorage под ключом
 * С ID ЧЕЛОВЕКА: она нужна, чтобы первый кадр рисовался мгновенно и чтобы
 * сосед, открывший свой аккаунт в том же браузере, не увидел чужое.
 *
 * ПОЧЕМУ ГОД РОЖДЕНИЯ, А НЕ ВОЗРАСТ. Возраст протухает в каждый день рождения:
 * записанные однажды «31» через год станут враньём. Год рождения не меняется
 * никогда, а сколько лет — считаем в момент показа.
 *
 * ПОЛ решает, чью гифку показывать у упражнения (см. gender-media.js).
 * Не выбран — показываем мужские, так было до появления выбора.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { localGet, localSet } from '../utils/storage'
import { EVENTS, emit } from './events'

const ПОЛЯ = ['sex', 'height_cm', 'birth_year']

let memory = null
let loadedFor = null

function diskKey(userId) { return `personal:${userId}` }

function readDisk(userId) {
  try {
    const raw = localGet(diskKey(userId))
    const parsed = raw ? JSON.parse(raw) : null
    return (parsed && typeof parsed === 'object') ? parsed : null
  } catch { return null }
}

function writeDisk(userId, data) {
  try { localSet(diskKey(userId), JSON.stringify(data)) } catch { /* переполнен — переживём */ }
}

function отобрать(row) {
  const out = {}
  ПОЛЯ.forEach(k => { out[k] = row?.[k] ?? null })
  return out
}

/** Синхронно — для первого кадра. Пусто, если ничего не известно. */
export function getPersonalSync() {
  const user = getCurrentUser()
  if (!user) return { sex: null, height_cm: null, birth_year: null }
  if (memory && loadedFor === user.id) return memory
  const disk = readDisk(user.id)
  if (disk) { memory = disk; loadedFor = user.id; return disk }
  // У свежего аккаунта данные уже могли приехать вместе с профилем
  const fromUser = отобрать(user)
  memory = fromUser; loadedFor = user.id
  return fromUser
}

/** Прочитать из базы и обновить копии. */
export async function loadPersonal() {
  const user = getCurrentUser()
  if (!user) return { sex: null, height_cm: null, birth_year: null }
  // Через функцию, а не прямым select: у роли authenticated на users только
  // чтение своей строки, и правила там же — пусть источник будет один.
  const { data, error } = await supabase.rpc('api_get_personal_data')
  if (error) {
    console.error('[personal] load failed:', error.message)
    return getPersonalSync()
  }
  const свежее = отобрать(Array.isArray(data) ? data[0] : data)
  memory = свежее; loadedFor = user.id
  writeDisk(user.id, свежее)
  return свежее
}

/**
 * Сохранить. Пишем разом все поля — экран отдаёт их вместе, по кнопке.
 * Локальную копию обновляем сразу, чтобы экран не ждал сеть.
 */
export async function savePersonal(patch) {
  const user = getCurrentUser()
  if (!user) return false
  const следующее = { ...getPersonalSync(), ...отобрать({ ...getPersonalSync(), ...patch }) }
  memory = следующее; loadedFor = user.id
  writeDisk(user.id, следующее)
  emit(EVENTS.PERSONAL_CHANGED, следующее)

  // Прямой update таблице закрыт грантами — пишем через функцию, как это
  // делают остальные настройки профиля.
  const { error } = await supabase.rpc('api_set_personal_data', {
    p_sex: следующее.sex,
    p_height_cm: следующее.height_cm,
    p_birth_year: следующее.birth_year
  })
  if (error) { console.error('[personal] save failed:', error.message); return false }
  return true
}

/**
 * Сколько лет — по году рождения. Точный день рождения не спрашиваем, поэтому
 * считаем по году: в год рождения человеку 0, дальше по разнице.
 */
export function ageFromBirthYear(year) {
  const y = Number(year)
  if (!y || y < 1900) return null
  const возраст = new Date().getFullYear() - y
  return (возраст >= 0 && возраст <= 120) ? возраст : null
}
