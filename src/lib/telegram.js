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
  tg.expand()

  try {
    if (typeof tg.requestFullscreen === 'function') {
      tg.requestFullscreen()
    }
  } catch (e) {
    console.log('requestFullscreen недоступен:', e?.message)
  }

  lockVerticalSwipes()
}

/**
 * Запрещает свайп-вниз для закрытия Mini App.
 *
 * Telegram иногда сбрасывает эту настройку при переходах между страницами,
 * поэтому компоненты могут вызывать её повторно при монтировании.
 *
 * Дополнительно навешиваем preventDefault на touch-события если палец
 * случайно попал в зону где Telegram считает это свайпом-закрытием.
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
 *
 * ВАЖНО (Г8.2): hide() убран из cleanup'ов компонентов чтобы не было
 * мерцания "крестик закрытия" при переходах между экранами с навигацией.
 * Кнопка остаётся видимой пока мы не вернёмся на главную.
 *
 * setHandler заменяет обработчик клика без скрытия/показа кнопки.
 */
export const backButton = {
  show: (onClick) => {
    if (!tg?.BackButton) return
    tg.BackButton.show()
    tg.BackButton.onClick(onClick)
  },
  /**
   * Сменить обработчик БЕЗ скрытия кнопки.
   * Используется когда переходим между экранами одного потока.
   */
  setHandler: (onClick) => {
    if (!tg?.BackButton) return
    // Сначала отписываемся от всех старых обработчиков, потом ставим новый
    tg.BackButton.offClick()
    tg.BackButton.onClick(onClick)
    // На всякий случай — если кнопка скрыта, покажем
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
