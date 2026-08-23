/**
 * Переход по ссылке из бота.
 *
 * Telegram отдаёт то, что стояло после `startapp=` в ссылке, в start_param.
 * Кнопка «Начать» в напоминании должна открыть не главную, а конкретную
 * тренировку — иначе человеку после тапа снова искать, куда идти, и весь
 * смысл напоминания теряется.
 *
 * Формат параметра (разделитель — дефис; слаги программ используют
 * подчёркивание, так что они не разъедутся):
 *   w-<slug>-<day>  → день силовой программы
 *   s-<slug>        → плавание
 *   stats-week      → статистика, переключатель на неделе
 *   stats-month     → статистика, переключатель на месяце
 *   stats-year      → статистика, переключатель на годе
 *   stats           → статистика как есть
 *   open-w2 / open-m / open-np → главная; хвост говорит, какое именно
 *                     напоминание сработало (две недели, месяц, нет закрепов)
 *   open            → просто главная
 *
 * Экран только ОТКРЫВАЕТСЯ. Тренировка не стартует: решение начать человек
 * принимает сам, а не по факту нажатия кнопки в мессенджере.
 */

import { webApp as tg } from './telegram'

/**
 * Во что превратить start_param.
 *
 * Возвращает { path, state } либо null, если параметр не про переход
 * (например, приглашение 'share_...' — у него свой обработчик).
 *
 * Период статистики приходит в state, а не сохраняется в настройки: сводка
 * за неделю должна открыть неделю, но выбор человека на главной при этом
 * трогать нельзя — он там свой.
 */
export function routeFromStartParam(param) {
  if (!param) return null

  if (param === 'stats') return { path: '/history' }
  if (param === 'stats-week') return { path: '/history', state: { period: 'week' } }
  if (param === 'stats-month') return { path: '/history', state: { period: 'month' } }
  if (param === 'stats-year') return { path: '/history', state: { period: 'year' } }

  // 'open*' — «просто открой приложение»: бот шлёт это, когда вести некуда
  // (закреплённой программы нет или пауза больше месяца). Никуда не уводим,
  // человек остаётся на главной — это и есть нужное поведение. Хвост после
  // дефиса нужен только аналитике, маршрут от него не зависит.
  if (param === 'open' || param.startsWith('open-')) return null

  const parts = param.split('-')

  if (parts[0] === 'w' && parts.length === 3) {
    const [, slug, day] = parts
    if (!slug || !day) return null
    return { path: `/workout/${slug}/${day}` }
  }

  if (parts[0] === 's' && parts.length === 2) {
    const [, slug] = parts
    if (!slug) return null
    return { path: `/swim/${slug}` }
  }

  return null
}

/** Переход для текущего запуска приложения, либо null. */
export function getStartRoute() {
  return routeFromStartParam(tg?.initDataUnsafe?.start_param)
}

/**
 * Какое напоминание привело человека в приложение.
 *
 * Отправку считает сам бот, но дошёл ли человек до приложения — видно только
 * отсюда. Без этого невозможно понять, работают ли пинки вообще и какой из них
 * работает лучше.
 *
 * Тип выводится из самого параметра: у каждого сообщения он свой, и заводить
 * ради этого второй механизм не понадобилось.
 */
export function notificationTypeFromStartParam(param) {
  if (!param) return null

  const MAP = {
    'stats-week': 'weekly',
    'stats-month': 'monthly',
    'stats-year': 'yearly',
    'open-w2': 'nudge_2w',
    'open-m': 'nudge_month',
    'open-np': 'nudge_nopin'
  }
  if (MAP[param]) return MAP[param]

  // Ссылка прямо в программу бывает только у недельного пинка.
  if (param.startsWith('w-') || param.startsWith('s-')) return 'nudge_week'
  if (param === 'open') return 'nudge'

  return null
}

/** Тип напоминания для текущего запуска, либо null. */
export function getNotificationType() {
  return notificationTypeFromStartParam(tg?.initDataUnsafe?.start_param)
}
