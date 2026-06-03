/**
 * Программа «ЗАПЛЫВ» — плавание, один день, 45 минут.
 *
 * Чистые данные памятки (как split.js для силовой).
 * Регистрируется в registry.js под slug 'swim', dbId 'swim_001', kind 'swim'.
 *
 * Принцип 25 ↔ 50 м:
 *  - дистанция заплыва фиксирована в метрах (meters)
 *  - число бассейнов = meters ÷ длина бассейна (poolsForMeters)
 *  - итог по метрам при переключении НЕ меняется, меняется только число бассейнов
 *
 * Блок может повторяться (repeat) — основа это короткий круг ×5.
 * Метры блока = сумма meters заплывов × repeat.
 *
 * Итог: разминка 150 + основа 500 (100×5) + заминка 100 = 750 м.
 * Это 30 бассейнов по 25 м / 15 бассейнов по 50 м.
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
      hint: '≈7 мин',
      swims: [
        { id: 'w1', stroke: 'breast', meters: 50, note: 'спокойно' },
        { id: 'w2', stroke: 'crawl',  meters: 50, note: 'плавно' },
        { id: 'w3', stroke: 'back',   meters: 50, note: 'плечи разогреть' }
      ]
    },
    {
      id: 'main',
      index: 2,
      title: 'Основа',
      hint: '≈28 мин',
      repeat: 5,
      footnote: '⏸ пауза 10–15 сек между кругами',
      swims: [
        { id: 'm1', stroke: 'crawl',  meters: 50, note: 'рабочий темп' },
        { id: 'm2', stroke: 'breast', meters: 50, note: 'техника, восстановиться' }
      ]
    },
    {
      id: 'cooldown',
      index: 3,
      title: 'Заминка',
      hint: '≈5 мин',
      swims: [
        { id: 'c1', stroke: 'back',   meters: 50, note: 'расслабленно' },
        { id: 'c2', stroke: 'breast', meters: 50, note: 'совсем легко' }
      ]
    }
  ]
}

/**
 * Стили: подпись + цвет (яркие под тёмный фон).
 * Цвета используются и для иконки пловца, и для текста.
 */
export const SWIM_STROKES = {
  crawl:  { label: 'Кроль', color: '#3FA2F7' },
  breast: { label: 'Брасс', color: '#2DD4A7' },
  back:   { label: 'Спина', color: '#B47BFF' }
}

/** Цвет стиля. */
export function strokeColor(stroke) {
  return SWIM_STROKES[stroke]?.color || '#888888'
}

/** Метры одного блока (с учётом повторов). */
export function blockMeters(block) {
  const one = block.swims.reduce((s, w) => s + w.meters, 0)
  return one * (block.repeat || 1)
}

/** Сумма метров всей программы. */
export function swimTotalMeters() {
  return SWIM_PROGRAM.blocks.reduce((sum, b) => sum + blockMeters(b), 0)
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