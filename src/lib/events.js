/**
 * Централизованные имена и хелперы для событий.
 *
 * Правка #5: раньше события рассыпались по коду как window.dispatchEvent(new CustomEvent('xp-updated')).
 * Опечатка в имени — баг. Теперь все имена тут.
 *
 * Также объединили user-updated и xp-updated в одно событие USER_CHANGED,
 * потому что они всегда слушались вместе (xp = одно из полей юзера).
 */

export const EVENTS = {
  /**
   * Авторизация прошла успешно — currentUser теперь доступен.
   * Шлётся один раз за сессию, после ensureAuth().
   * Детали в evt.detail: объект пользователя.
   */
  USER_READY: 'user-ready',

  /**
   * Данные пользователя изменились: мускулы, стрик, имя и т.п.
   * Заменяет старые 'user-updated' и 'xp-updated'.
   * Детали в evt.detail: новый объект пользователя.
   */
  USER_CHANGED: 'user-changed'
}

/**
 * Отправить событие.
 * Пример: emit(EVENTS.USER_CHANGED, user)
 */
export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/**
 * Подписаться на событие. Возвращает функцию отписки —
 * её удобно возвращать из useEffect cleanup.
 *
 * Пример:
 *   useEffect(() => {
 *     return on(EVENTS.USER_CHANGED, () => reload())
 *   }, [])
 */
export function on(name, handler) {
  window.addEventListener(name, handler)
  return () => window.removeEventListener(name, handler)
}