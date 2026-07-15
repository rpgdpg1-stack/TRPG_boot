import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from './cloud-storage'

/**
 * Accent — «цвет взаимодействия» (Primary Button, активные состояния, выбор, XP).
 * Пользователь выбирает один из 10 в Настройках; выбор пишется в localStorage
 * (мгновенно) + Telegram CloudStorage (кросс-девайс). Применяется перезаписью
 * :root-переменных --accent / --accent-dark / --accent-on (см. index.css).
 *
 * Семантические цвета (мышцы, виды спорта, редкость, теги, success/error/warning)
 * от accent НЕ зависят — их не трогаем.
 *
 * Каждый акцент: value=500 (заливка), dark (рамка/pressed), on (текст на заливке —
 * подобран по контрасту: светлые заливки → тёмный текст, насыщенные → белый).
 */
export const ACCENTS = [
  { id: 'green',    name: 'Зелёный',  value: '#9ED153', dark: '#648337', on: '#0D0C0C' },
  { id: 'blue',     name: 'Синий',    value: '#0A84FF', dark: '#0060DF', on: '#FFFFFF' },
  { id: 'indigo',   name: 'Индиго',   value: '#5E5CE6', dark: '#3F3DC4', on: '#FFFFFF' },
  { id: 'violet',   name: 'Фиолет',   value: '#8B5CF6', dark: '#6D3FD4', on: '#FFFFFF' },
  { id: 'pink',     name: 'Розовый',  value: '#EC4899', dark: '#C42A76', on: '#FFFFFF' },
  { id: 'coral',    name: 'Коралл',   value: '#F43F5E', dark: '#C81E3C', on: '#FFFFFF' },
  { id: 'orange',   name: 'Оранж',    value: '#F97316', dark: '#C4550A', on: '#FFFFFF' },
  { id: 'amber',    name: 'Янтарь',   value: '#EAB308', dark: '#B4890A', on: '#0D0C0C' },
  { id: 'cyan',     name: 'Циан',     value: '#06B6D4', dark: '#0A8CA4', on: '#FFFFFF' },
  { id: 'graphite', name: 'Графит',   value: '#6B7280', dark: '#4B5058', on: '#FFFFFF' },
]

const KEY = 'accent'
const DEFAULT_ID = 'green' // текущий зелёный — дефолт, ничего не меняется пока не выберут

export function getAccentById(id) {
  return ACCENTS.find(a => a.id === id) || ACCENTS[0]
}

/** Текущий выбранный акцент из localStorage (мгновенно, для стартового состояния UI). */
export function getAccentSync() {
  return getAccentById(localGet(KEY) || DEFAULT_ID)
}

/** Применить акцент — перезаписать :root-переменные. */
export function applyAccent(accent) {
  const root = document.documentElement
  root.style.setProperty('--accent', accent.value)
  root.style.setProperty('--accent-dark', accent.dark)
  root.style.setProperty('--accent-on', accent.on)
}

/**
 * Синхронное применение из localStorage — звать в main.jsx ДО рендера, чтобы не
 * было вспышки дефолтного цвета. Если ничего не сохранено — CSS-дефолт (зелёный)
 * уже верный, ничего не делаем.
 */
export function initAccent() {
  const id = localGet(KEY)
  if (id) applyAccent(getAccentById(id))
}

/**
 * Догнать выбор с другого устройства (Telegram CloudStorage). Звать после
 * инициализации Telegram (App useEffect). Если облако отличается — применяем и
 * кэшируем локально.
 */
export function syncAccentFromCloud() {
  cloudGet(KEY).then(v => {
    if (v && getAccentById(v).id === v && v !== localGet(KEY)) {
      localSet(KEY, v)
      applyAccent(getAccentById(v))
    }
  }).catch(() => {})
}

/** Выбрать акцент (тап в Настройках): применить + сохранить локально и в облако. */
export function setAccent(id) {
  const accent = getAccentById(id)
  localSet(KEY, accent.id)
  cloudSet(KEY, accent.id)
  applyAccent(accent)
}
