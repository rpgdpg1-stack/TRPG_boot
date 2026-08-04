import { supabase } from './supabase'
import { getCurrentUser } from './auth'
import { isOnline } from './network-status'

/**
 * Отметка «сейчас тренируюсь» на сервере — её видят друзья зелёной точкой
 * в своём списке.
 *
 * Активная сессия хранится в localStorage устройства (`active-workout`), и
 * сервер о ней ничего не знает. Поэтому старт и завершение отдельно проставляют
 * `users.training_since` через `api_set_training_state`.
 *
 * Отправка «в один конец»: результат никого не блокирует, ошибку глотаем.
 * Тренировка не должна падать из-за того, что не удалось обновить статус —
 * он всё равно протухает сам через 3 часа (условие в api_get_friends_list),
 * так что «вечно горящей» точки после закрытого приложения не будет.
 */
export function setTrainingState(active) {
  if (!getCurrentUser() || !isOnline()) return
  supabase
    .rpc('api_set_training_state', { p_active: !!active })
    .then(({ error }) => {
      if (error) console.warn('[training-state] не удалось обновить статус:', error.message)
    })
    .catch(() => { /* статус — не критичные данные */ })
}
