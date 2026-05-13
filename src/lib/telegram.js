/**
 * Обёртка над Telegram Web App SDK.
 * Если что-то меняется в API Телеги — правим только этот файл.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

// Наш фон приложения. Должен совпадать с --color-bg в index.css
// чтобы между приложением и системным UI Telegram не было видимых "швов".
const APP_BG = '#0D0C0C'

/**
 * Инициализация — вызвать один раз при старте приложения
 */
export function initTelegram() {
  if (!tg) {
    console.warn('Telegram WebApp SDK не загружен (вне Телеграма?)')
    return
  }

  tg.ready()
  tg.expand()

  try {
    if (typeof tg.requestFullscreen === 'function') {
      tg.requestFullscreen()
    }
  } catch (e) {
    console.log('requestFullscreen недоступен:', e?.message)
  }

  // Красим системные области Telegram в наш фон — чтобы при bounce-скролле
  // и в шапке/футере не было видно "другого" чёрного от Telegram-обёртки.
  paintTelegramChrome()

  lockVerticalSwipes()
}

/**
 * Перекрашивает шапку и фон Telegram-обёртки в цвет приложения.
 * Безопасно вызывать многократно — Telegram сам игнорирует если значение то же.
 */
export function paintTelegramChrome() {
  if (!tg) return

  try {
    if (typeof tg.setHeaderColor === 'function') {
      tg.setHeaderColor(APP_BG)
    }
  } catch (e) { /* старая версия SDK — игнор */ }

  try {
    if (typeof tg.setBackgroundColor === 'function') {
      tg.setBackgroundColor(APP_BG)
    }
  } catch (e) { /* старая версия SDK — игнор */ }

  try {
    // Цвет нижней зоны (там где home indicator на iPhone)
    if (typeof tg.setBottomBarColor === 'function') {
      tg.setBottomBarColor(APP_BG)
    }
  } catch (e) { /* метод появился позже, может отсутствовать */ }
}

/**
 * Запрещает свайп-вниз для закрытия Mini App.
 *
 * Telegram иногда сбрасывает эту настройку при переходах между страницами,
 * поэтому компоненты могут вызывать её повторно при монтировании.
 */
export function lockVerticalSwipes() {
  if (!tg) return

  if (typeof tg.disableVerticalSwipes === 'function') {
    try { tg.disableVerticalSwipes() } catch (e) { /* ignore */ }
  }
}

export function getUser() {
  return tg?.initDataUnsafe?.user || null
}

export const haptic = {
  light: () => tg?.HapticFeedback?.impactOccurred('light'),
  medium: () => tg?.HapticFeedback?.impactOccurred('medium'),
  heavy: () => tg?.HapticFeedback?.impactOccurred('heavy'),
  soft: () => tg?.HapticFeedback?.impactOccurred('soft'),
  rigid: () => tg?.HapticFeedback?.impactOccurred('rigid'),
  success: () => tg?.HapticFeedback?.notificationOccurred('success'),
  warning: () => tg?.HapticFeedback?.notificationOccurred('warning'),
  error: () => tg?.HapticFeedback?.notificationOccurred('error'),
  selection: () => tg?.HapticFeedback?.selectionChanged()
}

/**
 * Управление кнопкой "Назад" в шапке Телеграма.
 */
export const backButton = {
  show: (onClick) => {
    if (!tg?.BackButton) return
    tg.BackButton.show()
    tg.BackButton.onClick(onClick)
  },
  setHandler: (onClick) => {
    if (!tg?.BackButton) return
    tg.BackButton.offClick()
    tg.BackButton.onClick(onClick)
    tg.BackButton.show()
  },
  hide: () => {
    if (!tg?.BackButton) return
    tg.BackButton.hide()
    tg.BackButton.offClick()
  }
}

export const mainButton = {
  show: (text, onClick) => {
    if (!tg?.MainButton) return
    tg.MainButton.setText(text)
    tg.MainButton.show()
    tg.MainButton.onClick(onClick)
  },
  hide: () => {
    if (!tg?.MainButton) return
    tg.MainButton.hide()
    tg.MainButton.offClick()
  }
}

export function closeApp() {
  tg?.close()
}

export const webApp = tg