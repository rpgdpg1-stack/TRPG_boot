/**
 * Программа «ЗАПЛЫВ» — плавание, один день, 45 минут.
 *
 * Этот файл — ЧИСТЫЕ ДАННЫЕ памятки заплыва (как split.js для силовой).
 * Регистрируется в src/features/programs/registry.js под slug 'swim' и dbId 'swim_001'.
 *
 * Принцип пересчёта 25 ↔ 50 м:
 *  - У каждого заплыва ФИКСИРОВАНА дистанция в метрах (meters).
 *  - Число бассейнов = meters ÷ длина бассейна (poolsForMeters).
 *  - Итог по метрам при переключении 25↔50 НЕ меняется (та же тренировка
 *    на N метров), меняется только число бассейнов в подписях.
 *
 * reps (опционально) — интервальный заплыв. meters = общая дистанция всех
 *   повторов. Длина одного повтора = meters / reps. Показывается как «4×50 м».
 *   Без reps — непрерывный заплыв на meters метров.
 *
 * Сумма всех meters = 1250 м (50 бассейнов по 25 м / 25 бассейнов по 50 м).
 */

export const SWIM_PROGRAM = {
  durationMin: 45,
  defaultPool: 25,
  pools: [25, 50],
  blocks: [
    {
      id: 'warmup',
      index: 1,
      title: 'Разминка',
      hint: '5–7 мин',
      swims: [
        { id: 'w1', stroke: 'breast', meters: 100, note: 'спокойно' },
        { id: 'w2', stroke: 'crawl',  meters: 50,  note: 'плавно' },
        { id: 'w3', stroke: 'back',   meters: 50,  note: 'плечи разогреть' }
      ]
    },
    {
      id: 'main',
      index: 2,
      title: 'Основа',
      hint: '≈30 мин',
      footnote: '⏸ пауза 10–15 сек между блоками',
      swims: [
        { id: 'm1', stroke: 'crawl',  meters: 200, reps: 4, note: 'средний темп' },
        { id: 'm2', stroke: 'breast', meters: 200, note: 'техника, скольжение' },
        { id: 'm3', stroke: 'mixed',  meters: 200, reps: 4, note: 'туда / обратно' },
        { id: 'm4', stroke: 'crawl',  meters: 300, note: 'быстро' }
      ]
    },
    {
      id: 'cooldown',
      index: 3,
      title: 'Заминка',
      hint: '≈5 мин',
      swims: [
        { id: 'c1', stroke: 'back',   meters: 100, note: 'расслабленно' },
        { id: 'c2', stroke: 'breast', meters: 50,  note: 'совсем легко' }
      ]
    }
  ]
}

/**
 * Стили: подпись + цвет (подтянуты ярче под тёмный фон приложения).
 * mixed (кроль/брасс) — двухцветный, рисуется двумя цветами.
 */
export const SWIM_STROKES = {
  crawl:  { label: 'Кроль',       color: '#3FA2F7' },
  breast: { label: 'Брасс',       color: '#2DD4A7' },
  back:   { label: 'Спина',       color: '#B47BFF' },
  mixed:  { label: 'Кроль/брасс', color: '#3FA2F7', color2: '#2DD4A7' }
}

/** Цвет стиля (для точки/галочки). Для mixed — первый цвет. */
export function strokeColor(stroke) {
  return SWIM_STROKES[stroke]?.color || '#888888'
}

/** Сумма всех метров программы. */
export function swimTotalMeters() {
  return SWIM_PROGRAM.blocks.reduce(
    (sum, b) => sum + b.swims.reduce((s, w) => s + w.meters, 0),
    0
  )
}

/** Сумма метров одного блока. */
export function blockMeters(block) {
  return block.swims.reduce((s, w) => s + w.meters, 0)
}

/** Сколько бассейнов составляет дистанция в выбранном бассейне. */
export function poolsForMeters(meters, poolLen) {
  return Math.round(meters / poolLen)
}

/** Склонение «бассейн / бассейна / бассейнов». */
export function pluralPools(n) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'бассейнов'
  if (last === 1) return 'бассейн'
  if (last >= 2 && last <= 4) return 'бассейна'
  return 'бассейнов'
}

/**
 * Подпись формата заплыва без числа бассейнов:
 *  - интервал: «4×50 м»
 *  - непрерывный: «100 м»
 */
export function swimFormatLabel(swim) {
  if (swim.reps && swim.reps > 1) {
    return `${swim.reps}×${swim.meters / swim.reps} м`
  }
  return `${swim.meters} м`
}