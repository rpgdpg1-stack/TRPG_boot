/**
 * Централизованные имена и хелперы для событий.
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
   * Детали в evt.detail: новый объект пользователя.
   */
  USER_CHANGED: 'user-changed',

  /**
   * Очередь оффлайн-операций изменилась (добавили/схлопнули/отправили).
   * Нужно бейджу статуса: без этого он показывал счётчик, снятый в момент
   * потери сети, и правки, сделанные оффлайн, в него не попадали.
   * Детали в evt.detail: { size }.
   */
  QUEUE_CHANGED: 'queue-changed',

  /**
   * Список любимых упражнений изменился (добавили/убрали).
   * Слушают: страница «Любимые упражнения» и сердечко в мини-модалке дня.
   */
  FAVORITES_CHANGED: 'favorites-changed'
}

/**
 * Отправить событие.
 */
export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/**
 * Подписаться на событие. Возвращает функцию отписки.
 */
export function on(name, handler) {
  window.addEventListener(name, handler)
  return () => window.removeEventListener(name, handler)
}