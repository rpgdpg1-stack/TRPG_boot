/**
 * Конфиг отображения секций на главной: какие показывать и в каком порядке.
 *
 * Карточка профиля и Избранное — закреплены сверху, ими не управляем (их тут нет).
 * Управляемые секции: Разделы / История / Дневной буст.
 *
 * Хранится в Telegram CloudStorage (через cloud-storage.js) → состояние одинаковое
 * на телефоне и ПК. Старт — из localStorage-кэша (мгновенно), облако догоняет.
 * Дефолт у новых пользователей: все секции видны, порядок как сейчас.
 */

import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from './cloud-storage'

const KEY = 'home-layout'

// Управляемые секции главной (профиль и избранное закреплены — их тут нет).
export const HOME_SECTIONS = [
  { key: 'categories', title: 'РАЗДЕЛЫ' },
  { key: 'history',    title: 'ИСТОРИЯ' },
  { key: 'quests',     title: 'ДНЕВНОЙ БУСТ' }
]

const DEFAULT_ORDER = HOME_SECTIONS.map(s => s.key)

// Привести произвольный объект к валидной форме { order, hidden }.
function normalize(raw) {
  const order = Array.isArray(raw?.order)
    ? raw.order.filter(k => DEFAULT_ORDER.includes(k))
    : []
  // дописать недостающие ключи в конец (на случай добавления новых секций)
  for (const k of DEFAULT_ORDER) if (!order.includes(k)) order.push(k)

  const hidden = {}
  for (const k of DEFAULT_ORDER) hidden[k] = !!raw?.hidden?.[k]

  return { order, hidden }
}

// Синхронно из localStorage (для мгновенного первого рендера).
export function readHomeLayout() {
  try { return normalize(JSON.parse(localGet(KEY))) }
  catch { return normalize(null) }
}

// Подтянуть из облака (вдруг меняли с другого устройства). null — если нет/ошибка.
export async function loadHomeLayoutFromCloud() {
  try {
    const raw = await cloudGet(KEY)
    if (raw) return normalize(JSON.parse(raw))
  } catch { /* ignore */ }
  return null
}

// Сохранить (local + cloud). Возвращает нормализованный конфиг.
export function saveHomeLayout(layout) {
  const norm = normalize(layout)
  const json = JSON.stringify(norm)
  localSet(KEY, json)
  cloudSet(KEY, json)
  return norm
}
