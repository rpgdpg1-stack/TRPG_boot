/**
 * Обёртка над Telegram Web App SDK.
 * Если что-то меняется в API Телеги — правим только этот файл.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

/**
 * Инициализация — вызвать один раз при старте приложения
 */
export function initTelegram() {
  if (!tg) {
    console.warn('Telegram WebApp SDK не загружен (вне Телеграма?)')
    return
  }

  tg.ready()

  // Раскрываем приложение на полный экран (старый API)
  tg.expand()

  // Запрашиваем fullscreen (новый API, Bot API 8.0+).
  // Если метод отсутствует — игнорируем, ошибки не будет.
  try {
    if (typeof tg.requestFullscreen === 'function') {
      tg.requestFullscreen()
    }
  } catch (e) {
    // На старых версиях метод может бросать ошибку — глотаем
    console.log('requestFullscreen недоступен:', e?.message)
  }

  // Запрещаем сворачивание свайпом вниз
  if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes()
  }
}

/**
 * Данные текущего пользователя
 */
export function getUser() {
  return tg?.initDataUnsafe?.user || null
}

/**
 * Тактильная отдача (вибрация на телефоне)
 */
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
 * Управление кнопкой "Назад" в шапке Телеграма
 */
export const backButton = {
  show: (onClick) => {
    if (!tg?.BackButton) return
    tg.BackButton.show()
    tg.BackButton.onClick(onClick)
  },
  hide: () => {
    if (!tg?.BackButton) return
    tg.BackButton.hide()
    tg.BackButton.offClick()
  }
}

/**
 * Главная кнопка снизу (зелёная нативная)
 */
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
