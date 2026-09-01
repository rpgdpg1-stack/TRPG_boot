/**
 * Личные данные аккаунта: пол, рост, дата рождения.
 *
 * ГДЕ ЖИВУТ. Источник правды — таблица users, чтобы данные не терялись при
 * входе с другого устройства. Рядом лежит копия в localStorage под ключом
 * С ID ЧЕЛОВЕКА: она нужна, чтобы первый кадр рисовался мгновенно и чтобы
 * сосед, открывший свой аккаунт в том же браузере, не увидел чужое.
 *
 * ПОЧЕМУ ДАТА, А НЕ ВОЗРАСТ И НЕ ГОД. Число лет протухает в каждый день
 * рождения: записанные однажды «35» через год станут враньём. Год рождения от
 * этого спасает, но даёт возраст с точностью «плюс-минус год». Дата не
 * меняется никогда, а сколько лет — считаем в момент показа.
 *
 * ВЕС здесь тоже не живёт: он меняется постоянно и ведётся историей в
 * «Замерах тела», а не одним полем анкеты.
 *
 * ПОЛ решает, чью гифку показывать у упражнения (см. gender-media.js).
 * Не выбран — показываем мужские, так было до появления выбора.
 */

import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { localGet, localSet } from '../utils/storage'
import { EVENTS, emit } from './events'

/** Что вообще хранится. Экран сверяет по нему «есть несохранённые правки». */
export const PERSONAL_FIELDS = ['sex', 'height_cm', 'birth_date']

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
  PERSONAL_FIELDS.forEach(k => { out[k] = row?.[k] ?? null })
  return out
}

/** Синхронно — для первого кадра. Пусто, если ничего не известно. */
export function getPersonalSync() {
  const user = getCurrentUser()
  if (!user) return { sex: null, height_cm: null, birth_date: null }
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
  if (!user) return { sex: null, height_cm: null, birth_date: null }
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
    p_birth_date: следующее.birth_date
  })
  if (error) { console.error('[personal] save failed:', error.message); return false }
  return true
}

/**
 * Сколько полных лет по дате рождения (`YYYY-MM-DD`). День рождения сегодня —
 * значит год уже наступил: сравниваем месяц и число, а не только год.
 */
export function ageFromBirthDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let возраст = now.getFullYear() - d.getFullYear()
  const прошёлВЭтомГоду =
    now.getMonth() > d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate())
  if (!прошёлВЭтомГоду) возраст -= 1
  return (возраст >= 0 && возраст <= 120) ? возраст : null
}

/** Дата для показа: «12.05.1990». Хранение остаётся ISO — так его понимает база. */
export function formatBirthDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  if (!y || !m || !d) return ''
  return `${d}.${m}.${y}`
}
