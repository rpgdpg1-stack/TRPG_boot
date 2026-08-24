/**
 * Тексты напоминаний. Вынесены отдельно от отправки, чтобы их можно было
 * прогнать тестом без базы и без Telegram: копирайт правится чаще всего,
 * и каждая правка не должна требовать живой рассылки для проверки.
 *
 * Тон задан осознанно: никаких восклицательных знаков, обращений «чемпион»
 * и оценок вроде «маловато». Человек, пропустивший неделю, и так это знает —
 * приложение, которое его этим корит, выключают вместе с уведомлениями.
 */

/**
 * Названия видов по числу: «1 Силовая», «2 Силовые», «5 Силовых».
 *
 * Те же формы, что в приложении (utils/plural.js). Число стоит вплотную
 * к слову, и несклоняемая подпись сразу режет глаз. Кардио не склоняется —
 * слово несклоняемое, это не упущение.
 */
const CATEGORY_FORMS = {
  strength: ['Силовая', 'Силовые', 'Силовых'],
  pool: ['Плавание', 'Плавания', 'Плаваний'],
  cardio: ['Кардио', 'Кардио', 'Кардио'],
  stretch: ['Растяжка', 'Растяжки', 'Растяжек']
}

/**
 * Слово «Тренировка» при ДРОБНОМ числе: «1,6 Тренировки», «2,4 Тренировки».
 *
 * Дробное всегда требует родительного единственного — «1,6 Тренировки»,
 * а не «Тренировок». Целое отдаём обычному склонению.
 */
function categoryFreeWord(n) {
  if (Number.isInteger(Number(n))) return pluralWorkouts(Number(n)).replace(/^\d+\s/, '')
  return 'Тренировки'
}

function categoryWord(key, count) {
  const forms = CATEGORY_FORMS[key]
  if (!forms) return ''
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  if (mod10 === 1) return forms[0]
  return forms[2]
}

/**
 * Эмодзи. Собраны в одном месте намеренно: разбросанные по коду, они
 * незаметно расползаются, и в соседних сообщениях одна и та же вещь
 * оказывается помечена по-разному.
 *
 * Правило: эмодзи ставится там, где он РАЗЛИЧАЕТ (силовая против плавания)
 * или НАЗЫВАЕТ (рекорд, время). Украшать им уже понятную строку — шум.
 */
const E = {
  streak: '🔥',      // серия — она у нас недельная, отсюда и место: перед числом недели
  workouts: '💪',    // тренировки за месяц и год
  time: '🕓',        // оценка длительности
  strength: '🏋️',   // силовая
  pool: '🏊',        // плавание
  cardio: '🏃',
  stretch: '🤸',
  record: '🏆',      // рекорд, лучший результат
  stats: '📈',       // кнопка статистики
  start: '▶️',       // кнопка старта
  choose: '👆',      // кнопка выбора программы
  back: '↩️'         // кнопка возврата на главную
}

const CATEGORY_EMOJI = {
  strength: E.strength, pool: E.pool, cardio: E.cardio, stretch: E.stretch
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

/**
 * «1 Тренировка» / «3 Тренировки» / «12 Тренировок».
 *
 * С заглавной намеренно: это главный показатель во всех сводках, и заглавная
 * буква поднимает его над остальным текстом так же, как это делает жирность.
 */
export function pluralWorkouts(n) {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return `${n} Тренировок`
  if (mod10 === 1) return `${n} Тренировка`
  if (mod10 >= 2 && mod10 <= 4) return `${n} Тренировки`
  return `${n} Тренировок`
}

/**
 * «46 мин» · «1 ч 20 мин» · «2 ч 06 мин» · «3 ч 00 мин».
 *
 * Один в один с formatStatTime из utils/history.js: цифра в сообщении обязана
 * совпасть с цифрой на экране статистики, иначе человек решит, что где-то
 * ошибка. При часах минуты двузначные и не пропадают — так столбик времён
 * читается как на секундомере.
 */
export function formatMinutes(min) {
  const total = Math.max(0, Math.round(min || 0))
  if (total < 1) return null
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} мин`
  return `${h} ч ${String(m).padStart(2, '0')} мин`
}

/** «2,25 км» — как в статистике: километры через запятую, метры целыми. */
export function formatDistance(meters) {
  if (!meters) return null
  if (meters < 1000) return `${meters} м`
  return `${(meters / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} км`
}

/**
 * Разбивка по видам — отдельными строками под «Подробнее».
 *
 * Число стоит ПЕРЕД названием: глаз читает сводку по цифрам, и они должны
 * выстраиваться в столбик, а не прятаться в конце разной длины строк.
 */
export function breakdownLines(breakdown) {
  return CATEGORY_ORDER
    .filter((key) => breakdown?.[key]?.count > 0)
    .map((key) => {
      const { count, meters } = breakdown[key]
      const distance = key === 'pool' ? formatDistance(meters) : null
      return `${CATEGORY_EMOJI[key]} ${count} ${categoryWord(key, count)}`
        + (distance ? ` (${distance})` : '')
    })
}

/**
 * Главная строка сводки: «🔥 3 тренировки (2 ч 15 мин)».
 *
 * Время в скобках, а не через точку: скобки читаются как уточнение, точка —
 * как второй равноправный показатель. Число тренировок тут главное.
 */
function headLine(emoji, count, minutes) {
  const time = formatMinutes(minutes)
  // Жирным — только число тренировок: это главное в сводке. Время в скобках
  // остаётся обычным, иначе жирными окажется вся строка и выделять станет
  // нечего.
  return `${emoji} <b>${pluralWorkouts(count)}</b>` + (time ? ` (${time})` : '')
}

/**
 * Итоги недели.
 *
 * Огонёк перед числом — это серия: у нас она недельная, и «сколько раз
 * за неделю» и есть её значение. Отдельной строки про серию не нужно.
 */
export function weeklyDigest({ totalCount, totalMinutes, breakdown }) {
  const lines = ['<b>Итоги недели</b>', '', headLine(E.streak, totalCount, totalMinutes), '']
  return lines.concat(breakdownLines(breakdown)).join('\n').trimEnd()
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

/** Строка сравнения с прошлым месяцем — только когда в плюс, иначе null. */
export function comparisonLine(monthIndex, totalCount, prevCount) {
  const diff = totalCount - (prevCount || 0)
  if (!(prevCount > 0 && diff > 0)) return null
  const prevMonthIndex = (monthIndex + 11) % 12
  return `На ${E.workouts} ${pluralWorkouts(diff)} больше, чем в ${MONTHS_PREP[prevMonthIndex]}.`
}

/**
 * Итоги месяца.
 *
 * «Итоги августа», а не просто «Август»: все три сводки построены одинаково,
 * и в ленте читаются как один ряд, а не как три разные рассылки.
 *
 * Сравнение показываем только когда в плюс. «На 5 меньше, чем в июле» — тот
 * самый укор, ради отсутствия которого всё и затевалось; когда хуже, вместо
 * него идёт спокойный средний режим.
 */
export function monthlyDigest({ monthIndex, totalCount, totalMinutes, breakdown, prevCount, daysInMonth, isRecord }) {
  const lines = [`<b>Итоги ${MONTHS_GEN[monthIndex]}</b>`, '']
  if (isRecord) lines.push(`${E.record} <b>Новый лучший месяц!</b>`, '')
  lines.push(headLine(E.workouts, totalCount, totalMinutes), '')
  lines.push(...breakdownLines(breakdown))
  lines.push('')
  lines.push(comparisonLine(monthIndex, totalCount, prevCount)
    || averageLine(totalCount, daysInMonth))
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
  bestMonth, bestMonthCount, bestMonthMinutes, recExercise, recWeight, recSwimM
}) {
  const head = headLine(E.workouts, totalCount, totalMinutes)

  const lines = [`<b>Итоги ${year} года</b>`, '', head, '']
  lines.push(...breakdownLines(breakdown))

  // Лучший месяц называем, только если он и правда выделяется. Когда весь год
  // уместился в один-два раза, «лучший месяц — март, 1 тренировка» звучит
  // насмешкой.
  if (bestMonthCount >= 2 && bestMonth !== null && bestMonth !== undefined) {
    lines.push('')
    lines.push(`${E.record} <b>Лучший месяц</b>`)
    // Именительный падеж: «Июнь», не «июне» — это подпись, а не оборот.
    const monthName = MONTHS_NOMINATIVE[bestMonth]
    lines.push(`${monthName}, ${E.workouts} ${pluralWorkouts(bestMonthCount)}`
      + (bestMonthMinutes ? ` (${formatMinutes(bestMonthMinutes)})` : ''))
  }

  // Каждый рекорд с подписью, ЧТО именно рекорд: «105 кг» само по себе
  // ничего не говорит, а «самый большой рабочий вес» — говорит.
  // Сначала ЧТО за результат, потом сам результат. Голое «105 кг» ничего
  // не говорит, а «самый большой рабочий вес» — говорит, и подпись стоит
  // впереди, потому что читают её первой.
  const records = []
  const weight = formatWeight(recWeight)
  if (recExercise && weight) {
    records.push('Самый большой рабочий вес в силовых тренировках:',
      `${recExercise} — ${weight}`)
  }
  if (recSwimM) {
    records.push('Самая длинная дистанция в плавании:',
      `Заплыв — ${formatDistance(recSwimM)}`)
  }

  if (records.length) {
    lines.push('')
    lines.push(`${E.record} <b>Лучшие результаты</b>`)
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
 * Собран по тем же правилам, что и пользовательские сводки: заголовок «Отчёт
 * за июль» в один ряд с «Итоги июля», числа с заглавной, виды склоняются.
 * Отчёт читают вперемешку со сводками, и разнобой в цифрах заставлял бы
 * каждый раз перестраиваться.
 *
 * Раз в месяц, а не в неделю: на наших объёмах недельные числа скачут от
 * одного человека — виден шум, а не тенденция. Разбивка по неделям внутри
 * месяца показывает ровность, и её достаточно.
 */
export function ownerReport(r) {
  // «за июль», а не «за июля»: после предлога «за» винительный падеж.
  // Родительный (MONTHS_GEN) годится только для «Итоги июля».
  const month = MONTHS_NOMINATIVE[r.monthIndex].toLowerCase()
  const lines = [`<b>Отчёт за ${month}</b>`, '']

  // Северный показатель первым: всё остальное — расшифровка к нему.
  const perWeek = String(r.perActiveWeek).replace('.', ',')
  lines.push(`${E.workouts} <b>${perWeek} ${categoryFreeWord(r.perActiveWeek)}</b> на активного в неделю`)
  lines.push('')

  lines.push(`Людей: ${r.people}` + (r.newPeople ? ` (+${r.newPeople} за месяц)` : ''))
  lines.push(`Тренировались: ${pluralPeople(r.active)}`)
  lines.push(`Спят: ${pluralPeople(r.sleeping)}`)
  lines.push('')

  lines.push(`${E.workouts} <b>${pluralWorkouts(r.workouts)}</b> за месяц`)
  for (const [key, n] of Object.entries(r.byType || {})) {
    if (!CATEGORY_FORMS[key]) continue
    lines.push(`${CATEGORY_EMOJI[key]} ${n} ${categoryWord(key, n)}`)
  }

  if (r.weeks?.length) {
    lines.push('')
    lines.push('<b>По неделям</b>')
    for (const w of r.weeks) {
      lines.push(`${w.from} — ${pluralWorkouts(w.workouts)}, ${pluralPeople(w.people)}`)
    }
  }

  // Пинки показываем, только если они вообще уходили: строка «0 из 0» —
  // мусор, а не информация.
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
 * Заголовок по длине паузы. Ступеней ровно три — столько же, сколько пинков.
 *
 * Промежуточных («две недели», «два месяца») больше нет: они дробили одно
 * и то же сообщение на семь почти одинаковых и превращали напоминание
 * в назойливость.
 *
 * У последней ступени срок не назван намеренно. «Три месяца без тренировок»
 * звучит приговором, а точная цифра там уже ничего не добавляет: человеку
 * важно, что данные целы, а не сколько именно он отсутствовал.
 */
function pauseTitle(days) {
  if (days >= 90) return 'Давно без тренировок'
  if (days >= 30) return 'Месяц без тренировок'
  return 'Неделя без тренировок'
}

/**
 * Оценку времени показываем везде, где её есть откуда взять.
 *
 * Раньше плавание исключалось: считалось, что «45» в названии и есть время.
 * Но человек сам выставляет число кругов, и настоящее время от названия
 * отличается — показать его честнее, чем прятать за старым числом в имени.
 */
function showEstimate() {
  return true
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
/**
 * Строка программы: «🏋️ Сплит 2 (день A)» или «🏊 Заплыв 45 (750 м)».
 *
 * В скобках — то, что уточняет: у силовой день цикла, у плавания метраж,
 * который человек выставил себе сам. Название жирным, уточнение обычным.
 */
export function programLine(p) {
  const name = prettyName(p.name, p.slug)
  if (!name) return null
  const isPool = p.category === 'pool'
  const emoji = CATEGORY_EMOJI[isPool ? 'pool' : 'strength']
  const detail = isPool
    ? (p.meters ? formatDistance(p.meters) : null)
    : (p.lastDay ? `день ${p.lastDay}` : null)
  return `${emoji} <b>${name}</b>` + (detail ? ` (${detail})` : '')
}

/**
 * Пинок. Три градации по длительности паузы — человеку через неделю и через
 * месяц нужны разные вещи: первому напомнить, последнему разрешить начать
 * заново, не считая пропуск провалом.
 *
 * `programs` — закреплённые программы человека (может быть пусто, одна или
 * несколько: силовая и плавание закрепляются независимо).
 */
/**
 * Строка «лучший результат за месяц» — для длинных пауз.
 *
 * Напоминание о том, на что человек способен, работает лучше уговоров:
 * это его собственный результат, а не обещание. В rich-варианте цифры
 * спрятаны под спойлер — раскрыть их тапом приятнее, чем прочитать сразу.
 */
export function bestMonthLine(bestCount, bestMinutes) {
  if (!bestCount) return null
  const time = formatMinutes(bestMinutes)
  return `${E.workouts} <b>${pluralWorkouts(bestCount)}</b>` + (time ? ` (${time})` : '')
}

export function nudge({ daysSince, programs = [], bestCount, bestMinutes }) {
  const title = pauseTitle(daysSince)

  // Очень долгая пауза. Здесь важно только одно: человек боится, что за это
  // время всё обнулилось. Поэтому перечисляем именно то, что цело.
  if (daysSince >= 90) {
    const lines = [
      `<b>${title}</b>`, '',
      'Программы, рабочие веса и вся история на месте —',
      'ничего не пропало. Возвращайся, когда захочешь.'
    ]
    const best = bestMonthLine(bestCount, bestMinutes)
    if (best) lines.push('', `${E.record} Твой лучший результат за месяц: ${best}`)
    return lines.join('\n')
  }

  // Месяц и больше: ни программ, ни дней, ни минут. Всё это давит на того,
  // кто уже считает, что бросил. Формулировка нарочно не про «дни»: у плавания
  // дней нет, и «вернись с любого дня» для него бессмысленно.
  if (daysSince >= 30) {
    const lines = [
      `<b>${title}</b>`, '',
      'Программы тренировок на месте.',
      'Возвращайся и продолжи любую свою тренировку.'
    ]
    const best = bestMonthLine(bestCount, bestMinutes)
    if (best) lines.push('', `${E.record} Твой лучший результат за месяц: ${best}`)
    return lines.join('\n')
  }

  // Недели: две и три отличаются от одной только заголовком. Форма одна —
  // вопрос, программа, кнопка: человек, пропустивший две недели, знает свою
  // программу не хуже того, кто пропустил одну.
  const lines = [`<b>${title}</b>`, '', 'Продолжим?']

  if (programs.length === 0) {
    // Закреплённых программ нет — вести некуда. Выбирать за человека мы
    // не станем: он ничего не закреплял, и подстановка «Сплита» выглядела бы
    // так, будто приложение решило за него.
    lines.push('Выбери программу и начни с одной тренировки.')
  } else if (programs.length === 1) {
    const p = programs[0]
    lines.push('', programLine(p))
    // Оценка времени — только когда программа одна. Со списком сообщение
    // работает как меню: там важен выбор, а не план на ближайший час.
    if (p.estMinutes && showEstimate()) {
      lines.push(`${E.time} ~${formatMinutes(p.estMinutes)}`)
    }
  } else {
    // Несколько закрепов — названия уходят на кнопки, в тексте их нет.
    // Раньше они стояли и там и там: человек читал «Сплит 2» дважды подряд,
    // и сообщение выглядело так, будто в нём сбой.
    lines.push('Начни любую свою тренировку:')
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
  const toApp = (param) => [{ label: `${E.back} Вернуться к тренировкам`, param, style: BTN_STYLE.ACCENT }]

  if (daysSince >= 30) return toApp('open-m')
  // Закрепов нет — на главной человека ждёт именно выбор программы,
  // так кнопку и подписываем: она обещает ровно то, что произойдёт.
  if (programs.length === 0) {
    return [{ label: `${E.choose} Выбрать программу`, param: 'open-np', style: BTN_STYLE.ACCENT }]
  }

  const paramFor = (p) => p.category === 'pool'
    ? `s-${p.slug}`
    : `w-${p.slug}-${p.lastDay || 'A'}`
  const styleFor = (p) => p.category === 'pool' ? BTN_STYLE.POOL : BTN_STYLE.ACCENT

  if (programs.length === 1) {
    return [{ label: `${E.start} Начать`, param: paramFor(programs[0]), style: styleFor(programs[0]) }]
  }
  return programs.map((p) => ({
    label: `${CATEGORY_EMOJI[p.category === 'pool' ? 'pool' : 'strength']} ${prettyName(p.name, p.slug)}`,
    param: paramFor(p),
    style: styleFor(p)
  }))
}
