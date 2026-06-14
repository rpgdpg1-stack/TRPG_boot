/**
 * Обёртка над Telegram Web App SDK.
 * Если что-то меняется в API Телеги — правим только этот файл.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

const APP_BG = '#0D0C0C'

// Текущие обработчики кнопок — нужны чтобы корректно их удалять при смене.
// offClick() без аргумента в новых версиях Telegram может не работать —
// он удаляет все обработчики, но не всегда корректно.
// Передавая конкретную функцию — гарантированно удаляем именно её.
let currentBackHandler = null
let currentSettingsHandler = null

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
  bindSafeArea()
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

/**
 * Адаптивный верхний safe-area отступ для контента.
 *
 * Пишет в CSS-переменную --tg-safe-top реальную высоту, которую занимают
 * сверху: вырез/статусбар устройства (safeAreaInset) + шапка Telegram с
 * кнопками (contentSafeAreaInset) + запас 8px. Обновляется на события
 * Telegram (поворот, вход/выход из фуллскрина).
 *
 * Если поля недоступны (старый клиент Telegram до Bot API 8.0) — переменную
 * не трогаем, и работает хардкод-фолбэк 116px из index.css.
 */
export function bindSafeArea() {
  if (!tg) return

  const apply = () => {
    const sys = tg.safeAreaInset?.top ?? 0          // вырез / статус-бар устройства
    const ui  = tg.contentSafeAreaInset?.top ?? 0   // шапка Telegram (Назад / …)

    // Если оба поля отсутствуют (старый клиент) — не трогаем переменную,
    // пусть остаётся фолбэк 116px из CSS. Иначе ставим реальную высоту + запас.
    if (tg.safeAreaInset == null && tg.contentSafeAreaInset == null) return

    document.documentElement.style.setProperty('--tg-safe-top', `${sys + ui + 8}px`)
  }

  apply()

  try {
    if (typeof tg.onEvent === 'function') {
      tg.onEvent('safeAreaChanged', apply)
      tg.onEvent('contentSafeAreaChanged', apply)
      tg.onEvent('fullscreenChanged', apply)
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
 * Кнопка "Назад" в шапке Telegram.
 *
 * setHandler — главный метод. При смене обработчика:
 *  1. Удаляем СТАРЫЙ конкретный handler через offClick(currentBackHandler)
 *  2. Сохраняем новый в currentBackHandler
 *  3. Регистрируем новый через onClick(newHandler)
 *  4. Показываем кнопку
 *
 * Это решает баг: раньше offClick() без аргумента в новых версиях SDK
 * не всегда удалял обработчик, и при тапе срабатывали ОБА — старый
 * (из предыдущего экрана) и новый. Из-за этого Назад вёл "не туда"
 * или приходилось тапать несколько раз.
 */
export const backButton = {
  show: (onClick) => {
    if (!tg?.BackButton) return
    if (currentBackHandler) {
      try { tg.BackButton.offClick(currentBackHandler) } catch (e) { /* ignore */ }
    }
    currentBackHandler = onClick
    tg.BackButton.onClick(onClick)
    tg.BackButton.show()
  },
  setHandler: (onClick) => {
    if (!tg?.BackButton) return
    if (currentBackHandler) {
      try { tg.BackButton.offClick(currentBackHandler) } catch (e) { /* ignore */ }
    }
    currentBackHandler = onClick
    tg.BackButton.onClick(onClick)
    tg.BackButton.show()
  },
  hide: () => {
    if (!tg?.BackButton) return
    tg.BackButton.hide()
    if (currentBackHandler) {
      try { tg.BackButton.offClick(currentBackHandler) } catch (e) { /* ignore */ }
      currentBackHandler = null
    }
  }
}

/**
 * Кнопка-шестерёнка в шапке Telegram.
 * Аналогично backButton — храним конкретный handler чтобы корректно удалять.
 */
export const settingsButton = {
  show: (onClick) => {
    if (!tg?.SettingsButton) return
    try {
      if (currentSettingsHandler) {
        try { tg.SettingsButton.offClick(currentSettingsHandler) } catch (e) { /* ignore */ }
      }
      currentSettingsHandler = onClick
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
      if (currentSettingsHandler) {
        try { tg.SettingsButton.offClick(currentSettingsHandler) } catch (e) { /* ignore */ }
        currentSettingsHandler = null
      }
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
 * Возвращает Promise<boolean>: true если подтвердил, false если отменил.
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