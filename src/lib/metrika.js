/**
 * Яндекс Метрика.
 *
 * Включается только в боевой сборке: локальные заходы и прогоны разработки
 * иначе смешались бы с настоящими и испортили бы всю статистику.
 *
 * Приложение одностраничное — Метрика сама видит только ПЕРВЫЙ заход и без
 * посторонней помощи решит, что все сидят на главной. Переходы между экранами
 * ей сообщаются вручную (hit), цели — отдельно (goal).
 */

const COUNTER_ID = 111872872

let ready = false

/**
 * Загрузка счётчика.
 *
 * Из стандартного кода Яндекса убраны два параметра: ssr (у нас нет серверного
 * рендеринга) и ecommerce (нет магазина). Оба только тянули бы лишнее.
 */
export function initMetrika() {
  if (!import.meta.env.PROD) return
  if (ready) return

  const w = window
  w.ym = w.ym || function () { (w.ym.a = w.ym.a || []).push(arguments) }
  w.ym.l = 1 * new Date()

  const src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`
  if (![...document.scripts].some((s) => s.src === src)) {
    const script = document.createElement('script')
    script.async = true
    script.src = src
    document.head.appendChild(script)
  }

  w.ym(COUNTER_ID, 'init', {
    webvisor: true,        // записи сессий — главное, ради чего это ставилось
    clickmap: true,        // карта кликов
    trackLinks: true,
    accurateTrackBounce: true
  })

  ready = true
}

/** Переход на другой экран. Адрес передаём явно — Метрика его сама не увидит. */
export function hit(url) {
  if (!ready || !window.ym) return
  window.ym(COUNTER_ID, 'hit', url, { referer: document.referrer })
}

/**
 * Цель — то, ради чего человек пришёл. Названия латиницей и без пробелов:
 * такими они попадают в интерфейс Метрики, и переименовать их потом, не потеряв
 * накопленные данные, нельзя. Меняем список осознанно.
 */
export function goal(name, params) {
  if (!ready || !window.ym) return
  window.ym(COUNTER_ID, 'reachGoal', name, params)
}

export const GOALS = {
  // Ядро продукта: начал → довёл до конца. Разница между этими двумя целями
  // и есть доля брошенных тренировок — главная продуктовая цифра, которую
  // не увидеть никаким другим способом.
  WORKOUT_START: 'workout_start',
  WORKOUT_FINISH: 'workout_finish',

  // Механики внутри тренировки: пользуются ли ими вообще.
  EXERCISE_SWAP: 'exercise_swap',      // заменил упражнение
  WEIGHT_CHANGE: 'weight_change',      // поменял рабочий вес

  // Разделы, про которые нужно понять, нужны ли они.
  STATS_OPEN: 'stats_open',
  FRIENDS_OPEN: 'friends_open',
  FRIEND_INVITE: 'friend_invite',      // поделился ссылкой-приглашением

  // Дорогие в разработке фичи: окупаются ли.
  PROGRAM_PIN: 'program_pin',          // закрепил программу в разделе
  PROGRAM_CREATE: 'program_create'     // собрал свою в конструкторе
}
