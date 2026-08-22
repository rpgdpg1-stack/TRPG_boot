import { debug } from './debug'
/**
 * Обёртка над Telegram Web App SDK.
 * Если что-то меняется в API Телеги — правим только этот файл.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

const APP_BG = '#0A0A0B'

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
    debug('requestFullscreen недоступен:', e?.message)
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
      // Нативный фон вебвью — всегда тёмный APP_BG (зону резинки акцентом не красим).
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
/**
 * Мы правда внутри Telegram?
 *
 * Проверять только наличие window.Telegram нельзя: его скрипт создаёт заглушку
 * в любом браузере, и она бодро отвечает на вопросы про вырез экрана — нулями.
 * Приложение этим нулям верило и прижимало шапку к самому краю.
 *
 * Признак двойной: подписанные данные ИЛИ параметры Telegram в адресе. Второе
 * важно потому, что на плохой связи initData бывает пустым и внутри Telegram.
 */
export function isTelegramEnv() {
  try {
    if (tg?.initData) return true
    return String(window.location.href || '').indexOf('tgWebApp') !== -1
  } catch (e) {
    return false
  }
}

export function bindSafeArea() {
  // В браузере величины шапки задаёт CSS (:root.in-browser в base.css) —
  // здесь нельзя трогать их вовсе, иначе inline-стиль перебьёт правила.
  if (!tg || !isTelegramEnv()) return

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

/**
 * Один безопасный вызов хаптики.
 *
 * Telegram НЕ игнорирует методы, которых нет в версии клиента, — он бросает
 * исключение (то же самое видно на CloudStorage в старых сборках). А хаптика
 * почти везде стоит ПЕРВОЙ строкой обработчика, перед setState: один бросок
 * рвал обработчик целиком, и на старом клиенте кнопка просто переставала
 * работать — без единой видимой ошибки.
 *
 * Вибрация — украшение, её отсутствие не должно ничего ломать. Вызываем через
 * сам объект HapticFeedback (не выдёргивая метод), иначе теряется `this`.
 */
const buzz = (method, arg) => {
  try {
    tg?.HapticFeedback?.[method]?.(arg)
  } catch { /* старый клиент без хаптики — молча пропускаем */ }
}

export const haptic = {
  light: () => buzz('impactOccurred', 'light'),
  medium: () => buzz('impactOccurred', 'medium'),
  heavy: () => buzz('impactOccurred', 'heavy'),
  soft: () => buzz('impactOccurred', 'soft'),
  rigid: () => buzz('impactOccurred', 'rigid'),
  success: () => buzz('notificationOccurred', 'success'),
  warning: () => buzz('notificationOccurred', 'warning'),
  error: () => buzz('notificationOccurred', 'error'),
  selection: () => buzz('selectionChanged')
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
/**
 * Кто хочет знать о состоянии кнопки «Назад». Нужно браузерной версии: там
 * системной кнопки Telegram нет, и её рисуем мы сами — но поведение должно
 * быть ТЕМ ЖЕ. Экраны как ставили обработчик, так и ставят; отличается только
 * то, кто показывает кнопку на экране.
 */
const backListeners = new Set()
function notifyBack() {
  backListeners.forEach(fn => { try { fn(backVisible) } catch (e) { /* ignore */ } })
}

export const backButton = {
  show: (onClick) => {
    // Состояние запоминаем ВСЕГДА, даже когда Telegram недоступен: раньше
    // функция выходила первой строкой, и в браузере приложение просто не знало,
    // что кнопка должна быть.
    currentBackHandler = onClick
    backVisible = true
    applyBackButton()
    notifyBack()
  },
  setHandler: (onClick) => {
    currentBackHandler = onClick
    backVisible = true
    applyBackButton()
    notifyBack()
  },
  hide: () => {
    backVisible = false
    currentBackHandler = null
    applyBackButton() // снимет привязанный обработчик и спрячет кнопку
    notifyBack()
  },

  /** Подписка для браузерной кнопки. Возвращает функцию отписки. */
  subscribe: (fn) => {
    backListeners.add(fn)
    fn(backVisible)
    return () => backListeners.delete(fn)
  },

  /** Нажатие браузерной кнопки — тот же обработчик, что у системной. */
  trigger: () => { try { currentBackHandler?.() } catch (e) { console.error(e) } }
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

/**
 * Нативный диалог подтверждения Telegram.
 * Возвращает Promise<boolean>: true если подтвердил, false если отменил.
 */
export function confirm(message) {
  return new Promise((resolve) => {
    // В браузере спрашиваем сразу средствами браузера. Заглушка Telegram там
    // тоже отвечает на вызов — но может промолчать вместо ответа, и тогда
    // обещание не разрешится никогда: диалог не появится, а действие повиснет.
    if (!isTelegramEnv()) { resolve(window.confirm(message)); return }

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

export const webApp = tg