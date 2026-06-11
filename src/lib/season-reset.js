/**
 * Гибридная защита от пропущенного сезонного сброса.
 *
 * Архитектура (Вариант 3):
 *  - pg_cron запускает api_reset_season('cron') 1 числа марта/июня/сент/дек в 03:00 МСК.
 *    Точное время, но требует чтобы база Supabase не спала (на бесплатном тарифе
 *    база засыпает после 7 дней неактивности — тогда крон не сработает).
 *  - Этот модуль — страховка: при каждом заходе юзера фронт спрашивает
 *    "должен ли сейчас быть сброс". Если да — дёргает сброс с пометкой 'frontend'.
 *  - Защита от двойного запуска на стороне БД: season_resets_log.season_key UNIQUE.
 *    Даже если 100 юзеров одновременно зайдут — сработает только первый.
 *
 * Дебаунс на клиенте: один запрос на сессию (через sessionStorage).
 * Без этого при каждой перерисовке мы дёргали бы RPC впустую.
 */

import { supabase } from './supabase'
import { EVENTS, emit } from './events'
import { refreshCurrentUser } from './auth'
import { cacheInvalidate } from './cache'

const SESSION_FLAG_KEY = 'season-reset-checked-in-session'

/**
 * Главная функция — вызывается один раз при заходе юзера после авторизации.
 * Тихо в фоне проверяет нужен ли сброс. Если да — выполняет.
 *
 * Если сброс произошёл:
 *  - Инвалидирует все кеши лидерборда / истории
 *  - Перечитывает юзера (его мускулы могли уменьшиться)
 *  - Шлёт USER_CHANGED → главная страница обновит цифры
 *
 * Никаких UI-уведомлений тут НЕ показываем — пользователь увидит:
 *  - на главной → новые мускулы (уменьшенные)
 *  - модалку итогов сезона (SeasonEndModal по season_summaries) при следующем
 *    входе — сколько рангов прошёл, место, медаль/титул если Бессмертный топ-3
 *  - модалку NewSeasonModal — если сменился сезон в getCurrentSeason()
 */
export async function checkAndResetSeasonIfNeeded() {
  // Дебаунс: проверяем только один раз за сессию приложения
  if (typeof sessionStorage !== 'undefined') {
    if (sessionStorage.getItem(SESSION_FLAG_KEY) === '1') return
    sessionStorage.setItem(SESSION_FLAG_KEY, '1')
  }

  try {
    const { data: checkData, error: checkError } = await supabase.rpc('api_should_reset_season')
    if (checkError) {
      console.warn('[season-reset] check failed:', checkError.message)
      return
    }

    const shouldReset = checkData?.should_reset === true
    if (!shouldReset) return

    console.log('[season-reset] reset is needed, triggering api_reset_season(frontend)')

    const { data: resetData, error: resetError } = await supabase.rpc('api_reset_season', {
      p_source: 'frontend'
    })

    if (resetError) {
      console.error('[season-reset] reset failed:', resetError)
      return
    }

    // Если skipped=true — кто-то другой (крон или другой клиент) уже сделал
    // сброс между нашим check и call. Это нормально, ничего не делаем.
    if (resetData?.skipped) {
      console.log('[season-reset] reset already done by another caller:', resetData)
    } else {
      console.log('[season-reset] reset done:', resetData)
    }

    // В обоих случаях (сами сделали или кто-то ещё) кеши протухли.
    cacheInvalidate('leaderboard-')
    cacheInvalidate('my-friend-place:')
    cacheInvalidate('muscle-history:')

    // Перечитать юзера: его total_muscles мог измениться
    await refreshCurrentUser()
    emit(EVENTS.USER_CHANGED, null)
  } catch (e) {
    console.warn('[season-reset] exception:', e?.message)
  }
}