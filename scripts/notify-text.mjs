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
// Предложный — для оборота «больше, чем в июле».
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']
// Родительный — для заголовка «Итоги августа».
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

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
  const lines = ['<b>Итоги недели</b>', '', head]
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

  // «Итоги августа», а не просто «Август»: все три сводки построены одинаково,
  // и в ленте они читаются как один ряд, а не как три разные рассылки.
  const lines = [`<b>Итоги ${MONTHS_GEN[monthIndex]}</b>`, '', head]
  const detail = breakdownLine(breakdown, totalCount)
  if (detail) lines.push(detail)

  // Сравнение — только когда в плюс. «На 5 меньше, чем в июле» — тот самый
  // укор, ради отсутствия которого всё и затевалось. Стало хуже — молчим
  // и показываем средний режим.
  const diff = totalCount - (prevCount || 0)
  const prevMonthIndex = (monthIndex + 11) % 12
  lines.push('')
  if (prevCount > 0 && diff > 0) {
    lines.push(`На ${pluralWorkouts(diff)} больше, чем в ${MONTHS_PREP[prevMonthIndex]}.`)
  } else {
    lines.push(averageLine(totalCount, daysInMonth))
  }
  return lines.join('\n')
}

/** «Тяга блока — 105 кг»: вес без лишних нулей. */
function formatWeight(kg) {
  const n = Number(kg)
  if (!n) return null
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} кг`
}

/**
 * Итоги года. Шлётся 1 января — единственное сообщение, которое человек может
 * захотеть перечитать, поэтому кроме счётчиков в нём лучший месяц и рекорды.
 *
 * Всё за прошедший год, а не за всё время: «рекорд года» с достижением
 * трёхлетней давности был бы обманом.
 */
export function yearlyDigest({
  year, totalCount, totalMinutes, breakdown,
  bestMonth, bestMonthCount, recExercise, recWeight, recSwimM
}) {
  const time = formatMinutes(totalMinutes)
  const head = time
    ? `${pluralWorkouts(totalCount)} · ${time}`
    : pluralWorkouts(totalCount)

  const lines = [`<b>Итоги ${year} года</b>`, '', head]
  const detail = breakdownLine(breakdown, totalCount)
  if (detail) lines.push(detail)

  // Лучший месяц называем, только если он и правда выделяется. Когда весь год
  // уместился в один-два раза, «лучший месяц — март, 1 тренировка» звучит
  // насмешкой.
  if (bestMonthCount >= 2 && bestMonth !== null && bestMonth !== undefined) {
    lines.push('')
    // Именительный падеж, а не предложный: «Лучший месяц — июнь», не «июне».
    // MONTHS_GENITIVE здесь не годится, он для оборота «больше, чем в июне».
    const monthName = MONTHS_NOMINATIVE[bestMonth].toLowerCase()
    lines.push(`Лучший месяц — ${monthName}, ${pluralWorkouts(bestMonthCount)}.`)
  }

  const records = []
  const weight = formatWeight(recWeight)
  if (recExercise && weight) records.push(`${recExercise} — ${weight}`)
  if (recSwimM) records.push(`Заплыв — ${formatDistance(recSwimM)}`)

  if (records.length) {
    lines.push('')
    lines.push('<b>Лучшие результаты</b>')
    for (const r of records) lines.push(r)
  }

  return lines.join('\n')
}

/** «5 человек» / «21 человек» / «22 человека». */
function pluralPeople(n) {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return `${n} человек`
  if (mod10 === 1) return `${n} человек`
  if (mod10 >= 2 && mod10 <= 4) return `${n} человека`
  return `${n} человек`
}

/**
 * Владельческий отчёт за месяц. Приходит только владельцу, пользователи его
 * не видят.
 *
 * Раз в месяц, а не в неделю: на наших объёмах недельные числа скачут от одного
 * человека, и в них видно шум, а не тенденцию. Разбивка по неделям внутри
 * месяца показывает ровность, и её достаточно.
 */
export function ownerReport(r) {
  const CATEGORY_TITLE_LOCAL = { strength: 'силовых', pool: 'плавание', cardio: 'кардио', stretch: 'растяжка' }

  const lines = [`<b>Отчёт · ${MONTHS_NOMINATIVE[r.monthIndex]}</b>`, '']

  // Северный показатель первым: всё остальное — расшифровка к нему.
  // Дробное число по-русски пишется через запятую.
  const perWeek = String(r.perActiveWeek).replace('.', ',')
  lines.push(`<b>${perWeek}</b> тренировки на активного в неделю`)
  lines.push('')

  lines.push(`Людей всего: ${r.people}` + (r.newPeople ? ` (+${r.newPeople} за месяц)` : ''))
  lines.push(`Тренировались: ${pluralPeople(r.active)}`)
  lines.push(`Спят: ${pluralPeople(r.sleeping)}`)
  lines.push('')

  const types = Object.entries(r.byType || {})
    .map(([k, n]) => `${CATEGORY_TITLE_LOCAL[k] || k} ${n}`)
    .join(' · ')
  lines.push(`Тренировок: ${r.workouts}` + (types ? ` — ${types}` : ''))

  if (r.weeks?.length) {
    lines.push('')
    lines.push('<b>По неделям</b>')
    for (const w of r.weeks) {
      lines.push(`${w.from} — ${w.workouts} трен., ${w.people} чел.`)
    }
  }

  // Пинки показываем, только если они вообще уходили: строка «0 из 0»
  // в отчёте — мусор, а не информация.
  if (r.nudged > 0) {
    lines.push('')
    lines.push('<b>Пинки</b>')
    lines.push(`Отправлено: ${r.nudged}, вернулись: ${r.reactivated}`)
  }

  if (r.notifyOff > 0) {
    lines.push(`Отключили уведомления: ${r.notifyOff}`)
  }

  return lines.join('\n')
}

/**
 * Заголовок по длине паузы.
 *
 * Все построены одинаково: срок и «без тренировок». Слово «прошлая» в первом
 * ломало этот ряд и добавляло оттенок упрёка, которого в остальных нет.
 *
 * Пороги подогнаны под расписание рассылки (неделя → месяц → три месяца),
 * чтобы заголовок не повторялся дважды подряд: пинок за 56-й день должен
 * сказать «два месяца», а не второй раз «месяц».
 *
 * Дальше четырёх месяцев срок не называем вовсе. «Год без тренировок» звучит
 * как приговор, а точная цифра там уже ничего не добавляет: человеку важно,
 * что его данные целы, а не сколько именно он отсутствовал.
 */
function pauseTitle(days) {
  if (days >= 112) return 'Давно без тренировок'
  if (days >= 84) return 'Три месяца без тренировок'
  if (days >= 56) return 'Два месяца без тренировок'
  if (days >= 28) return 'Месяц без тренировок'
  const weeks = Math.floor(days / 7)
  if (weeks >= 3) return 'Три недели без тренировок'
  if (weeks === 2) return 'Две недели без тренировок'
  return 'Неделя без тренировок'
}

/**
 * Показывать ли оценку времени.
 *
 * Только для силовых. У плавания длительность заложена в само название
 * («Заплыв 45»), и вторая цифра рядом читается как разнобой.
 *
 * Первая версия правила смотрела на любую цифру в названии — и молча съедала
 * оценку у «Сплита 2»: цифра там есть, но она про номер программы, а не про
 * минуты. Категория надёжнее догадок по тексту.
 */
function showEstimate(category) {
  return category !== 'pool'
}

/**
 * Название программы как на карточках: СПЛИТ → Сплит.
 *
 * У встроенных название в базе короче, чем в приложении («Заплыв» против
 * «Заплыв 45»): в базе оно служебное. В сообщении показываем то, что человек
 * видит на карточке, иначе он не узнает свою программу.
 */
const BUILTIN_TITLES = { swim: 'Заплыв 45' }

function prettyName(name, slug) {
  if (BUILTIN_TITLES[slug]) return BUILTIN_TITLES[slug]
  if (!name) return null
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

/** Строка одной программы: «Сплит 2  день A» либо просто «Заплыв 45». */
export function programLine(p) {
  const name = prettyName(p.name, p.slug)
  if (!name) return null
  // У плавания дней нет, у силовой день обязателен. Разделитель — двойной
  // пробел: точка или запятая в такой короткой строке читались как сокращение.
  const isPool = p.category === 'pool'
  return isPool || !p.lastDay ? name : `${name}  день ${p.lastDay}`
}

/**
 * Пинок. Три градации по длительности паузы — человеку через неделю и через
 * месяц нужны разные вещи: первому напомнить, последнему разрешить начать
 * заново, не считая пропуск провалом.
 *
 * `programs` — закреплённые программы человека (может быть пусто, одна или
 * несколько: силовая и плавание закрепляются независимо).
 */
export function nudge({ daysSince, programs = [] }) {
  const title = pauseTitle(daysSince)

  // Очень долгая пауза. Здесь важно только одно: человек боится, что за это
  // время всё обнулилось. Поэтому перечисляем именно то, что цело.
  if (daysSince >= 112) {
    return [
      `<b>${title}</b>`, '',
      'Программы, рабочие веса и вся история на месте —',
      'ничего не пропало. Возвращайся, когда захочешь.'
    ].join('\n')
  }

  // Месяц и больше: ни программ, ни дней, ни минут. Всё это давит на того,
  // кто уже считает, что бросил. Формулировка нарочно не про «дни»: у плавания
  // дней нет, и «вернись с любого дня» для него бессмысленно.
  if (daysSince >= 28) {
    return [
      `<b>${title}</b>`, '',
      'Программы тренировок на месте.',
      'Возвращайся и продолжи любую свою тренировку.'
    ].join('\n')
  }

  // Две-три недели: планка входа снижается, программы не называются. Выпавшему
  // нужен маленький шаг, а конкретный день с конкретным временем — это снова
  // полный объём. Про «одно упражнение» тут не говорим: тренировкой может быть
  // и заплыв, где упражнений нет.
  if (daysSince >= 14) {
    return [
      `<b>${title}</b>`, '',
      'Выбери любую свою тренировку и продолжай.'
    ].join('\n')
  }

  const lines = [`<b>${title}</b>`, '']

  if (programs.length === 0) {
    // Закреплённых программ нет — вести некуда. Выбирать за человека мы
    // не станем: он ничего не закреплял, и подстановка «Сплита» выглядела бы
    // так, будто приложение решило за него.
    lines.push('Выбери программу и начни с одной тренировки.')
  } else if (programs.length === 1) {
    const p = programs[0]
    lines.push(programLine(p))
    // Оценка времени — только когда программа одна. Со списком сообщение
    // работает как меню: там важен выбор, а не план на ближайший час.
    if (p.estMinutes && showEstimate(p.category)) {
      lines.push(`~${formatMinutes(p.estMinutes)}`)
    }
  } else {
    // Несколько закрепов — названия уходят на кнопки, в тексте их нет.
    // Раньше они стояли и там и там: человек читал «Сплит 2» дважды подряд,
    // и сообщение выглядело так, будто в нём сбой.
    lines.push('Начать:')
  }

  return lines.join('\n').trimEnd()
}

/**
 * Цвет кнопки.
 *
 * Telegram даёт ровно три готовых стиля (появились в Bot API 9.4, февраль
 * 2026) — свой #9ED153 туда не подставить. Но раскладка ложится на наши
 * цвета почти один в один: зелёный совпадает с акцентом, синий — с цветом
 * плавания. Красный не используем нигде: он означает опасное действие,
 * а у нас все кнопки зовут тренироваться.
 */
export const BTN_STYLE = {
  ACCENT: 'success',  // зелёный — акцент приложения
  POOL: 'primary'     // синий — цвет плавания
}

/**
 * Кнопки под пинком.
 *
 * Одна программа — одна кнопка «Начать»: выбирать не из чего, и называть
 * программу второй раз незачем. Несколько — по кнопке на каждую, подписанные
 * названиями: сообщение превращается в выбор, и подпись обязана говорить,
 * куда именно ведёт нажатие.
 *
 * Возвращает [{ label, param }], где param — start_param для ссылки.
 */
export function nudgeButtons({ daysSince, programs = [] }) {
  // Везде, где кнопка ведёт на главную, она и подписана «Открыть приложение».
  // «Начать» обещает готовую тренировку по нажатию — а там ещё выбирать.
  // Хвост у параметра разный, хотя ведут все три на главную: по нему потом
  // видно, КАКОЕ напоминание вернуло человека. Без этого пинки неразличимы.
  const toApp = (param) => [{ label: 'Открыть приложение', param, style: BTN_STYLE.ACCENT }]

  if (daysSince >= 28) return toApp('open-m')
  if (daysSince >= 14) return toApp('open-w2')
  // Закрепов нет — на главной человека ждёт именно выбор программы,
  // так кнопку и подписываем: она обещает ровно то, что произойдёт.
  if (programs.length === 0) {
    return [{ label: 'Выбрать программу', param: 'open-np', style: BTN_STYLE.ACCENT }]
  }

  const paramFor = (p) => p.category === 'pool'
    ? `s-${p.slug}`
    : `w-${p.slug}-${p.lastDay || 'A'}`
  const styleFor = (p) => p.category === 'pool' ? BTN_STYLE.POOL : BTN_STYLE.ACCENT

  if (programs.length === 1) {
    return [{ label: 'Начать', param: paramFor(programs[0]), style: styleFor(programs[0]) }]
  }
  return programs.map((p) => ({
    label: prettyName(p.name, p.slug),
    param: paramFor(p),
    style: styleFor(p)
  }))
}
