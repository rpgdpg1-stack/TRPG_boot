/**
 * Обёртка над Telegram Web App SDK.
 * Если что-то меняется в API Телеги — правим только этот файл.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

// Наш фон приложения. Должен совпадать с --color-bg в index.css
const APP_BG = '#0D0C0C'

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

  paintTelegramChrome()
  lockVerticalSwipes()
}

export function paintTelegramChrome() {
  if (!tg) return

  try {
    if (typeof tg.setHeaderColor === 'function') {
      tg.setHeaderColor(APP_BG)
    }
  } catch (e) { /* ignore */ }

  try {
    if (typeof tg.setBackgroundColor === 'function') {
      tg.setBackgroundColor(APP_BG)
    }
  } catch (e) { /* ignore */ }

  try {
    if (typeof tg.setBottomBarColor === 'function') {
      tg.setBottomBarColor(APP_BG)
    }
  } catch (e) { /* ignore */ }
}

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

/**
 * Управление кнопкой шестерёнки в шапке Telegram (рядом с кнопкой назад).
 * Показывается на всех экранах и ведёт в настройки приложения.
 *
 * Юзер тапнул шестерёнку в любом месте → попал прямо в Settings,
 * не теряя контекст текущего экрана (можно потом вернуться кнопкой Назад).
 */
export const settingsButton = {
  show: (onClick) => {
    if (!tg?.SettingsButton) return
    try {
      tg.SettingsButton.onClick(onClick)
      tg.SettingsButton.show()
    } catch (e) {
      console.warn('[telegram] SettingsButton not supported:', e?.message)
    }
  },
  hide: () => {
    if (!tg?.SettingsButton) return
    try {
      tg.SettingsButton.hide()
      tg.SettingsButton.offClick()
    } catch (e) { /* ignore */ }
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

/**
 * Нативный диалог подтверждения Telegram.
 * Выглядит как системная iOS/Android модалка, более "телеграмно" чем window.confirm().
 *
 * Возвращает Promise<boolean>: true если юзер подтвердил, false если отменил.
 *
 * Фоллбэк на window.confirm() для случая когда Telegram SDK недоступен (dev в браузере).
 */
export function confirm(message) {
  return new Promise((resolve) => {
    if (tg && typeof tg.showConfirm === 'function') {
      try {
        tg.showConfirm(message, (confirmed) => resolve(!!confirmed))
        return
      } catch (e) {
        console.warn('[telegram] showConfirm error, using fallback:', e?.message)
      }
    }
    resolve(window.confirm(message))
  })
}

export function closeApp() {
  tg?.close()
}

export const webApp = tg