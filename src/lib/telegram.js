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

// Обработчики, реально привязанные сейчас к нативным кнопкам. Отличаются от
// currentBackHandler/currentSettingsHandler («желаемых»): снимать через offClick
// нужно именно ПРИВЯЗАННЫЙ, иначе при смене обработчика старый не удаляется и
// они копятся — «Назад» начинает дёргать стопку устаревших колбэков и ведёт
// не туда / не реагирует.
let registeredBackHandler = null
let registeredSettingsHandler = null

// «Желаемое» состояние кнопок шапки. Нужно, чтобы переустановить его после
// пробуждения свёрнутого приложения: Telegram при сворачивании усыпляет webview
// и при возврате нативный мост к кнопкам ломается — старый обработчик
// отвязывается, а команды show/hide до нативной кнопки не доходят. Из-за этого
// «Назад» зависала видимой, ни на что не реагировала и помогало только полное
// закрытие приложения. Храним намерение и заново применяем его в resync.
let backVisible = false
let settingsVisible = false

function applyBackButton() {
  if (!tg?.BackButton) return
  // Сначала снимаем ИМЕННО привязанный обработчик (а не желаемый), иначе старые
  // копятся. Идемпотентно: при resync переустановит тот же без дублей.
  if (registeredBackHandler) {
    try { tg.BackButton.offClick(registeredBackHandler) } catch (e) { /* ignore */ }
    registeredBackHandler = null
  }
  if (backVisible && currentBackHandler) {
    tg.BackButton.onClick(currentBackHandler)
    registeredBackHandler = currentBackHandler
    tg.BackButton.show()
  } else {
    tg.BackButton.hide()
  }
}

function applySettingsButton() {
  if (!tg?.SettingsButton) return
  try {
    if (registeredSettingsHandler) {
      try { tg.SettingsButton.offClick(registeredSettingsHandler) } catch (e) { /* ignore */ }
      registeredSettingsHandler = null
    }
    if (settingsVisible && currentSettingsHandler) {
      tg.SettingsButton.onClick(currentSettingsHandler)
      registeredSettingsHandler = currentSettingsHandler
      tg.SettingsButton.show()
    } else {
      tg.SettingsButton.hide()
    }
  } catch (e) { /* ignore */ }
}

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
  bindLifecycle()
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
 * кнопками (contentSafeAreaInset) + запас 8px. Запас подобран так, чтобы
 * ЧИСТЫЙ var(--tg-safe-top) давал ровно 16px ниже кнопок Telegram до первого
 * элемента (Telegram резервирует в contentSafeAreaInset ещё ~8px ниже видимых
 * кнопок). Единое правило: первый элемент экрана БЕЗ своего верхнего отступа +
 * paddingTop: var(--tg-safe-top) = всегда 16px сверху. Обновляется на события
 * Telegram (поворот, вход/выход из фуллскрина).
 *
 * Если поля недоступны (старый клиент Telegram до Bot API 8.0) — переменную
 * не трогаем, и работает хардкод-фолбэк 108px из index.css.
 */
export function bindSafeArea() {
  if (!tg) return

  const apply = () => {
    const sys = tg.safeAreaInset?.top ?? 0          // вырез / статус-бар устройства
    const ui  = tg.contentSafeAreaInset?.top ?? 0   // шапка Telegram (Назад / …)

    // Если оба поля отсутствуют (старый клиент) — не трогаем переменную,
    // пусть остаётся фолбэк 108px из CSS. Иначе ставим реальную высоту + запас.
    if (tg.safeAreaInset == null && tg.contentSafeAreaInset == null) return

    document.documentElement.style.setProperty('--tg-safe-top', `${sys + ui + 8}px`)
    // Полоса системных кнопок Telegram (Назад / …): от низа выреза устройства
    // (sys) высотой ui. По центру этой полосы выравниваем заголовок-навбар
    // (ScreenTitle), чтобы он встал в одну линию с кнопками. Контент при этом
    // по-прежнему идёт ниже (paddingTop = var(--tg-safe-top)).
    document.documentElement.style.setProperty('--tg-nav-top', `${sys}px`)
    document.documentElement.style.setProperty('--tg-nav-height', `${ui}px`)
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
 * setHandler/show/hide лишь записывают «желаемое» состояние (видимость +
 * обработчик), а фактическую привязку делает applyBackButton: снимает РАНЕЕ
 * привязанный handler (registeredBackHandler) и ставит новый. Так обработчики
 * не копятся при частой смене (напр. в конструкторе на каждое изменение) и
 * состояние можно переустановить после пробуждения приложения (resync).
 *
 * Раньше offClick() без аргумента в новых версиях SDK не всегда удалял
 * обработчик, поэтому удаляем строго конкретную функцию.
 */
export const backButton = {
  show: (onClick) => {
    if (!tg?.BackButton) return
    currentBackHandler = onClick
    backVisible = true
    applyBackButton()
  },
  setHandler: (onClick) => {
    if (!tg?.BackButton) return
    currentBackHandler = onClick
    backVisible = true
    applyBackButton()
  },
  hide: () => {
    if (!tg?.BackButton) return
    backVisible = false
    currentBackHandler = null
    applyBackButton() // снимет привязанный обработчик и спрячет кнопку
  }
}

/**
 * Кнопка-шестерёнка в шапке Telegram.
 * Аналогично backButton — храним конкретный handler чтобы корректно удалять.
 */
export const settingsButton = {
  show: (onClick) => {
    if (!tg?.SettingsButton) return
    currentSettingsHandler = onClick
    settingsVisible = true
    applySettingsButton()
  },
  hide: () => {
    if (!tg?.SettingsButton) return
    settingsVisible = false
    currentSettingsHandler = null
    applySettingsButton()
  }
}

/**
 * Переустановка состояния шапки после пробуждения свёрнутого приложения.
 *
 * Telegram при сворачивании усыпляет webview; при возврате (через минуты)
 * нативный мост к кнопкам может «протухнуть»: команды не доходят, а обработчик
 * «Назад» отвязан. Заново дёргаем ready() (поднимаем мост) и переустанавливаем
 * желаемое состояние кнопок и цвета шапки. Вызывается на activated /
 * возврат видимости вкладки (см. bindLifecycle).
 */
export function resyncTelegramChrome() {
  if (!tg) return
  try { tg.ready() } catch (e) { /* ignore */ }
  applyBackButton()
  applySettingsButton()
  paintTelegramChrome()
}

/**
 * Подписка на жизненный цикл: когда приложение снова становится активным
 * (Telegram-событие activated, Bot API 8.0) или вкладка снова видима —
 * переустанавливаем состояние шапки. Без этого после сворачивания «Назад»
 * зависала и не реагировала до полного перезапуска приложения.
 */
export function bindLifecycle() {
  if (!tg) return

  try {
    if (typeof tg.onEvent === 'function') {
      tg.onEvent('activated', resyncTelegramChrome)
    }
  } catch (e) { /* ignore */ }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resyncTelegramChrome()
    })
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