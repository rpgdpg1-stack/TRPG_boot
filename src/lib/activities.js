/**
 * Активности (бывш. Дневной буст) — конфиг и данные окон.
 *
 * Три окна суток (Москва-сутки, сброс 03:00 МСК — как getTodayKey):
 *   🌅 Утро  08:00–11:59  (открыто с 03:00)
 *   ☀️ День  12:00–17:59  (с 12:00)
 *   🌙 Вечер 18:00–23:00  (с 18:00)
 *
 * Две дорожки в каждом окне:
 *  - РЕКОМЕНДУЕМАЯ — из пула (RECOMMENDED_POOLS ниже), детерминированно на день.
 *    Награда идёт через существующий completeQuest (+20/слот, +40 за все три).
 *  - МОЯ — своя активность (одна на окно): короткий текст + необязательное описание.
 *    За свои баллов НЕ даём; отметка «выполнено» — локально по дню.
 *
 * КОНФИГ (кросс-девайс, как настройки главной): CloudStorage + localStorage-кеш.
 *   { showRecommended, showCustom, custom: { morning, day, evening } }
 *   custom[window] = { title, benefit } | null.
 * Отметка своих «выполнено» — localStorage по дню (эфемерно, как галочки квестов).
 */

import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from './cloud-storage'
import { getTodayKey } from '../utils/dates'

export const ACTIVITY_TITLE_MAX = 40
export const ACTIVITY_BENEFIT_MAX = 60

// Окна: openBootHour — час «суток буста» от 03:00 МСК (0/9/15), как в DailyQuests.
export const WINDOWS = [
  { id: 'morning', emoji: '🌅', label: 'Утро', openBootHour: 0 },
  { id: 'day', emoji: '☀️', label: 'День', openBootHour: 9 },
  { id: 'evening', emoji: '🌙', label: 'Вечер', openBootHour: 15 }
]

const CONFIG_KEY = 'activities-config'
const CUSTOM_DONE_PREFIX = 'activities-custom-done:' // + dayKey

export const CUSTOM_PER_WINDOW_MAX = 3

const DEFAULT_CONFIG = {
  showRecommended: true,
  showCustom: false,
  custom: { morning: [], day: [], evening: [] }
}

// Своя активность → { id, title, benefit|null }. Миграция: раньше было по одной
// (объект), теперь массив до 3. Бэкфилл id для старых записей.
function normCustom(rawCustom) {
  const out = { morning: [], day: [], evening: [] }
  for (const w of ['morning', 'day', 'evening']) {
    const v = rawCustom?.[w]
    const arr = Array.isArray(v) ? v : (v && v.title ? [v] : [])
    out[w] = arr
      .map((it, i) => (it && it.title) ? {
        id: it.id || `${w}_${i}_${hashKey(String(it.title))}`,
        title: String(it.title).slice(0, ACTIVITY_TITLE_MAX),
        benefit: it.benefit ? String(it.benefit).slice(0, ACTIVITY_BENEFIT_MAX) : null
      } : null)
      .filter(Boolean)
      .slice(0, CUSTOM_PER_WINDOW_MAX)
  }
  return out
}

function normalize(cfg) {
  if (!cfg || typeof cfg !== 'object') return { showRecommended: true, showCustom: false, custom: normCustom(null) }
  return {
    showRecommended: cfg.showRecommended !== false,
    showCustom: cfg.showCustom === true,
    custom: normCustom(cfg.custom)
  }
}

/** Мгновенно из localStorage (для первого рендера без мигания). */
export function getActivitiesConfigSync() {
  try {
    const raw = localGet(CONFIG_KEY)
    return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_CONFIG }
  } catch { return { ...DEFAULT_CONFIG } }
}

/** Догнать из облака (другое устройство). Возвращает конфиг или null. */
export async function fetchActivitiesConfig() {
  try {
    const raw = await cloudGet(CONFIG_KEY)
    if (!raw) return null
    const cfg = normalize(typeof raw === 'string' ? JSON.parse(raw) : raw)
    localSet(CONFIG_KEY, JSON.stringify(cfg))
    return cfg
  } catch { return null }
}

/** Сохранить конфиг локально + в облако. */
export function saveActivitiesConfig(cfg) {
  const norm = normalize(cfg)
  const json = JSON.stringify(norm)
  localSet(CONFIG_KEY, json)
  cloudSet(CONFIG_KEY, json)
  // Уведомляем виджет на главной, чтобы он перечитал конфиг (SPA — Home не размонтируется).
  try { window.dispatchEvent(new Event('activities-changed')) } catch { /* ignore */ }
  return norm
}

// ── Текущее окно по времени (тот же расчёт, что boostHour в DailyQuests) ──
export function getBoostHour() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const msk = new Date(utcMs + 3 * 3600000)
  return (msk.getHours() - 3 + 24) % 24
}

/** Индекс текущего окна (0/1/2) по времени: последнее открытое окно. */
export function getCurrentWindowIndex() {
  const h = getBoostHour()
  let idx = 0
  for (let i = 0; i < WINDOWS.length; i++) {
    if (h >= WINDOWS[i].openBootHour) idx = i
  }
  return idx
}

export function isWindowOpen(win) {
  return getBoostHour() >= win.openBootHour
}

/** Время открытия окна «HH:00» (МСК) — для подписи закрытого окна. */
export function windowOpenLabel(win) {
  const mskHour = (win.openBootHour + 3) % 24
  return `${String(mskHour).padStart(2, '0')}:00`
}

// ── Пул рекомендуемых активностей (по одной на окно, детерминированно на день) ──
export const RECOMMENDED_POOLS = {
  morning: [
    { id: 'm_water',   emoji: '💧',   title: 'Выпить стакан воды',     benefit: 'запуск метаболизма' },
    { id: 'm_light',   emoji: '🌞',   title: '5 минут дневного света',  benefit: 'циркадный ритм' },
    { id: 'm_protein', emoji: '🥚',   title: 'Белок на завтрак',        benefit: 'сытость и энергия' },
    { id: 'm_pushups', emoji: '💪🏻', title: '10 отжиманий от пола',    benefit: 'разбудить мышцы' },
    { id: 'm_teeth',   emoji: '🦷',   title: 'Почистить зубы',          benefit: 'гигиена и ритуал' },
    { id: 'm_goal',    emoji: '🗒️',   title: 'Записать 1 цель на день', benefit: 'фокус внимания' },
    { id: 'm_silence', emoji: '🧘🏻', title: '5 минут тишины',          benefit: 'снять утренний шум' }
  ],
  day: [
    { id: 'd_walk',    emoji: '🚶', title: '10 минут ходьбы',         benefit: 'кровообращение' },
    { id: 'd_fruit',   emoji: '🍎', title: 'Съесть фрукт',            benefit: 'витамины' },
    { id: 'd_veggies', emoji: '🥗', title: 'Добавить овощи к еде',    benefit: 'клетчатка' },
    { id: 'd_move',    emoji: '🧍', title: 'Встать и размяться 2 мин', benefit: 'снять застой' },
    { id: 'd_squats',  emoji: '🏋️', title: '20 приседаний',           benefit: 'тонизировать ноги' },
    { id: 'd_eyes',    emoji: '👁️', title: 'Смотреть вдаль 1 мин',    benefit: 'отдых для глаз' },
    { id: 'd_water',   emoji: '💧', title: 'Выпить ещё стакан воды',  benefit: 'дневная гидратация' },
    { id: 'd_music',   emoji: '🎧', title: 'Послушать любимую песню', benefit: 'поднять настроение' }
  ],
  evening: [
    { id: 'e_stretch', emoji: '🤸',     title: '10 минут растяжки',            benefit: 'снять напряжение' },
    { id: 'e_breath',  emoji: '😮‍💨', title: '10 глубоких вдохов',           benefit: 'успокоить нервы' },
    { id: 'e_screen',  emoji: '📵',     title: 'Убрать телефон за час до сна', benefit: 'качество сна' },
    { id: 'e_sleep',   emoji: '😴',     title: 'Лечь спать вовремя',           benefit: 'восстановление' },
    { id: 'e_shower',  emoji: '🚿',     title: 'Контрастный душ',              benefit: 'тонус сосудов' },
    { id: 'e_skin',    emoji: '🧴',     title: 'Увлажнить кожу',               benefit: 'уход и ритуал' },
    { id: 'e_plank',   emoji: '📋',     title: 'Планка 30–60 сек',             benefit: 'сильный кор' }
  ]
}

export const SLOT_XP = 20

// Детерминированный хеш строки (FNV-подобный) → неотрицательное число.
function hashKey(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h)
}

/** Рекомендуемая активность окна на день (детерминированно по ключу дня). */
export function getRecommendedForWindow(windowId, dayKey = getTodayKey()) {
  const pool = RECOMMENDED_POOLS[windowId] || []
  if (!pool.length) return null
  const idx = hashKey(`${dayKey}:${windowId}`) % pool.length
  return pool[idx]
}

// ── Отметка «выполнено» для СВОИХ активностей (localStorage по дню) ──
function customDoneKey() { return CUSTOM_DONE_PREFIX + getTodayKey() }

export function getCustomDone() {
  try {
    const raw = localGet(customDoneKey())
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function setCustomDone(windowId, done) {
  const cur = getCustomDone()
  if (done) cur[windowId] = true
  else delete cur[windowId]
  try { localSet(customDoneKey(), JSON.stringify(cur)) } catch { /* ignore */ }
  return cur
}
