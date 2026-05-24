/**
 * Централизованные имена и хелперы для событий.
 *
 * BADGE_EARNED — новое событие, шлётся когда RPC начисления мускулов
 * вернула new_badge_rank_index != null. Слушает RewardsQueueController в App.jsx,
 * чтобы СРАЗУ показать модалку значка лиги, не дожидаясь следующего входа.
 *
 * Изоляция: BADGE_EARNED шлётся ТОЛЬКО для свежевыданных значков. Старые
 * накопленные значки (если юзер давно не заходил) приходят через
 * getPendingRewards при старте.
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
   * Юзер прямо сейчас получил новый значок лиги.
   * Детали в evt.detail: { rank_index: число }.
   * RewardsQueueController подхватывает и добавляет в очередь модалок,
   * чтобы модалка появилась мгновенно, а не при следующем заходе.
   */
  BADGE_EARNED: 'badge-earned'
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