import { getPrefSync, setPref } from './prefs'

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

// Настройка АККАУНТА, а не устройства. Раньше лежала в localStorage и потому
// не доезжала никуда: ни в браузер, ни на второй телефон. Человек выбирал
// «Месяц» в Telegram, открывал приложение в браузере — и видел «Год», как
// будто выбор не сохранился.
export function getHomeStatsPeriod() {
  const v = getPrefSync(HOME_PERIOD_KEY, null)
  return PERIODS.includes(v) ? v : 'year'
}

export function setHomeStatsPeriod(period) {
  if (PERIODS.includes(period)) setPref(HOME_PERIOD_KEY, period)
}
