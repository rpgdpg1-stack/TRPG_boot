/**
 * Обёртка над Telegram Web App SDK
 * Если что-то меняется в API Телеги — правим только этот файл
 */

// Достаём объект WebApp из глобального Telegram (он подключен в index.html)
const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

/**
 * Инициализация — вызвать один раз при старте приложения
 */
export function initTelegram() {
  if (!tg) {
    console.warn('Telegram WebApp SDK не загружен (вне Телеграма?)')
    return
  }

  // Сообщаем Телеге что мы готовы — он скрывает свой лоадер
  tg.ready()

  // Раскрываем приложение на полный экран
  tg.expand()

  // Запрещаем сворачивание свайпом вниз (чтобы не закрывалось случайно)
  if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes()
  }
}

/**
 * Данные текущего пользователя (имя, id, username, аватарка)
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
 * Главная кнопка снизу (зелёная нативная кнопка Телеги)
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

/**
 * Закрыть мини-приложение
 */
export function closeApp() {
  tg?.close()
}

/**
 * Сырой доступ к объекту Telegram.WebApp если нужно что-то особенное
 */
export const webApp = tg
