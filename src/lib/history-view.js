import { localGet, localSet } from '../utils/storage'

/**
 * Период статистики — один на приложение.
 *
 * Положение календаря здесь НЕ хранится: экран статистики всегда открывается на
 * текущем месяце/годе («где я сейчас» важнее, чем «где был в прошлый раз»).
 */
const PERIODS = ['week', 'month', 'year', 'all']

/**
 * Период, выбранный селектором на ГЛАВНОЙ. Он — источник правды: экран
 * `/history` открывается именно с ним, сколько бы периодов ни перелистали
 * внутри в прошлый раз. Обратно экран статистики сюда не пишет.
 */
const HOME_PERIOD_KEY = 'home-stats-period'

export function getHomeStatsPeriod() {
  const v = localGet(HOME_PERIOD_KEY)
  return PERIODS.includes(v) ? v : 'year'
}

export function setHomeStatsPeriod(period) {
  if (PERIODS.includes(period)) localSet(HOME_PERIOD_KEY, period)
}
