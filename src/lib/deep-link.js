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
 *   stats-all       → статистика, переключатель на «Всё»
 *   stats           → статистика как есть
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
  // Отдельного «года» в переключателе нет — годовая сводка ведёт на «Всё».
  if (param === 'stats-all') return { path: '/history', state: { period: 'all' } }

  // 'open' — «просто открой приложение»: бот шлёт его, когда вести некуда
  // (закреплённой программы нет или пауза больше месяца). Никуда не уводим,
  // человек остаётся на главной — это и есть нужное поведение.
  if (param === 'open') return null

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
