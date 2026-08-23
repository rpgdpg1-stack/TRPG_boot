/**
 * Тексты напоминаний. Вынесены отдельно от отправки, чтобы их можно было
 * прогнать тестом без базы и без Telegram: копирайт правится чаще всего,
 * и каждая правка не должна требовать живой рассылки для проверки.
 *
 * Тон задан осознанно: никаких восклицательных знаков, обращений «чемпион»
 * и оценок вроде «маловато». Человек, пропустивший неделю, и так это знает —
 * приложение, которое его этим корит, выключают вместе с уведомлениями.
 */

const CATEGORY_TITLE = {
  strength: 'Силовые',
  pool: 'Плавание',
  cardio: 'Кардио',
  stretch: 'Растяжка'
}

// Порядок разделов — как в статистике приложения.
const CATEGORY_ORDER = ['strength', 'pool', 'cardio', 'stretch']

const MONTHS_NOMINATIVE = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GENITIVE = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

/** «1 тренировка» / «3 тренировки» / «12 тренировок». */
export function pluralWorkouts(n) {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return `${n} тренировок`
  if (mod10 === 1) return `${n} тренировка`
  if (mod10 >= 2 && mod10 <= 4) return `${n} тренировки`
  return `${n} тренировок`
}

/** «48 мин» / «2 ч 15 мин» / «2 ч». */
export function formatMinutes(min) {
  if (!min || min < 1) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} мин`
  if (!m) return `${h} ч`
  return `${h} ч ${m} мин`
}

/** «2,25 км» — как в статистике: километры через запятую, метры целыми. */
export function formatDistance(meters) {
  if (!meters) return null
  if (meters < 1000) return `${meters} м`
  return `${(meters / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} км`
}

/**
 * Строка разбивки по видам: «Силовые 2 · Плавание 1 (2,25 км)».
 *
 * Возвращает null, когда разбивка ничего не добавляет: один-единственный вид
 * уже назван общим числом строкой выше, и повторять его — шум.
 */
export function breakdownLine(breakdown, totalCount) {
  const entries = CATEGORY_ORDER
    .filter((key) => breakdown?.[key]?.count > 0)
    .map((key) => {
      const { count, meters } = breakdown[key]
      const distance = key === 'pool' ? formatDistance(meters) : null
      return `${CATEGORY_TITLE[key]} ${count}` + (distance ? ` (${distance})` : '')
    })

  if (entries.length === 0) return null

  // Единственный вид, и он же весь итог — строка была бы пересказом строки
  // выше. Исключение — плавание: ради метража в скобках её оставляем.
  if (entries.length === 1) {
    const onlyKey = CATEGORY_ORDER.find((k) => breakdown?.[k]?.count > 0)
    if (onlyKey !== 'pool' && breakdown[onlyKey].count === totalCount) return null
  }

  return entries.join(' · ')
}

/** Итоги недели. */
export function weeklyDigest({ totalCount, totalMinutes, breakdown }) {
  const time = formatMinutes(totalMinutes)
  const head = time
    ? `${pluralWorkouts(totalCount)} · ${time}`
    : pluralWorkouts(totalCount)
  const lines = ['<b>Неделя закрыта</b>', '', head]
  const detail = breakdownLine(breakdown, totalCount)
  if (detail) lines.push(detail)
  return lines.join('\n')
}

/**
 * Средний режим за месяц: «В среднем 3 тренировки в неделю».
 *
 * Меньше одной в неделю переводим в месячную частоту — «0,7 тренировки
 * в неделю» звучит как отчёт бухгалтерии, а не как факт о себе.
 */
export function averageLine(totalCount, daysInMonth) {
  const perWeek = totalCount / (daysInMonth / 7)
  if (perWeek < 1) return `В среднем ${pluralWorkouts(totalCount)} в месяц.`
  const rounded = Math.round(perWeek)
  if (rounded === 1) return 'В среднем раз в неделю.'
  return `В среднем ${pluralWorkouts(rounded)} в неделю.`
}

/** Итоги месяца. */
export function monthlyDigest({ monthIndex, totalCount, totalMinutes, breakdown, prevCount, daysInMonth }) {
  const time = formatMinutes(totalMinutes)
  const head = time
    ? `${pluralWorkouts(totalCount)} · ${time}`
    : pluralWorkouts(totalCount)

  const lines = [`<b>${MONTHS_NOMINATIVE[monthIndex]}</b>`, '', head]
  const detail = breakdownLine(breakdown, totalCount)
  if (detail) lines.push(detail)

  // Сравнение — только когда в плюс. «На 5 меньше, чем в июле» — тот самый
  // укор, ради отсутствия которого всё и затевалось. Стало хуже — молчим
  // и показываем средний режим.
  const diff = totalCount - (prevCount || 0)
  const prevMonthIndex = (monthIndex + 11) % 12
  lines.push('')
  if (prevCount > 0 && diff > 0) {
    lines.push(`На ${pluralWorkouts(diff)} больше, чем в ${MONTHS_GENITIVE[prevMonthIndex]}.`)
  } else {
    lines.push(averageLine(totalCount, daysInMonth))
  }
  return lines.join('\n')
}

/**
 * «Неделя» / «Две недели» / «Три недели» / «Месяц».
 *
 * Все четыре построены одинаково: срок и «без тренировок». Слово «прошлая»
 * в первом ломало этот ряд и добавляло оттенок упрёка, которого в остальных нет.
 */
function pauseTitle(days) {
  if (days >= 28) return 'Месяц без тренировок'
  const weeks = Math.floor(days / 7)
  if (weeks >= 3) return 'Три недели без тренировок'
  if (weeks === 2) return 'Две недели без тренировок'
  return 'Неделя без тренировок'
}

/**
 * Показывать ли оценку времени.
 *
 * Если число уже стоит в названии программы («ЗАПЛЫВ 45»), вторая цифра рядом
 * читается как разнобой. Правило то же, что в приложении.
 */
function showEstimate(programName) {
  return !!programName && !/\d/.test(programName)
}

/** Название программы как на карточках: СПЛИТ → Сплит. */
function prettyName(name) {
  if (!name) return null
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

/**
 * Пинок. Три градации по длительности паузы — человеку через неделю и через
 * месяц нужны разные вещи: первому напомнить, последнему разрешить начать
 * заново, не считая пропуск провалом.
 */
export function nudge({ daysSince, programName, category, lastDay, estMinutes }) {
  const title = pauseTitle(daysSince)

  // Месяц и больше: ни программы, ни дня, ни минут. Всё это давит на того,
  // кто уже считает, что бросил.
  if (daysSince >= 28) {
    return [
      `<b>${title}</b>`, '',
      'Программы тренировок на месте. Возвращайся',
      'с любого дня — начинать сначала не нужно.'
    ].join('\n')
  }

  // Две-три недели: планка входа снижается до одного упражнения, и программа
  // с днём тут не называются намеренно. Выпавшему на две недели нужен маленький
  // шаг, а конкретный день с конкретным временем — это снова полный объём.
  if (daysSince >= 14) {
    return [
      `<b>${title}</b>`, '',
      'Не нужно сразу делать всю тренировку.',
      'Начни с одного упражнения.'
    ].join('\n')
  }

  const lines = [`<b>${title}</b>`, '']
  const name = prettyName(programName)

  if (name) {
    // Программа и день — одной строкой через двойной пробел. Слова
    // «В программе:» удлиняли строку, ничего не объясняя, а запятая
    // в такой короткой строке читалась как сокращение.
    const isPool = category === 'pool'
    lines.push(isPool || !lastDay ? name : `${name}  день ${lastDay}`)
    // Формат тот же, что в шапке тренировки («1 ч 3 мин»): человек увидит
    // в приложении ровно то число, что было в сообщении. Заодно снимает
    // вопрос со склонением — «63 минут» иначе резало бы глаз.
    if (estMinutes && showEstimate(name)) {
      lines.push(`~${formatMinutes(estMinutes)}`)
    }
  } else {
    // Закреплённой программы нет — вести некуда. Выбирать за человека
    // программу мы не станем: он её не выбирал, и подстановка «Сплит»
    // выглядела бы так, будто приложение решило за него.
    lines.push('Выбери программу и начни с одной тренировки.')
  }

  return lines.join('\n').trimEnd()
}

/** Подпись кнопки под пинком. */
export function nudgeButtonLabel(daysSince) {
  if (daysSince >= 28) return 'Открыть приложение'
  return 'Начать'
}
