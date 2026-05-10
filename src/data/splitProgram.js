/**
 * Структура программы Сплит — захардкожена в коде, не из БД.
 * Это надёжнее: данные программы стабильные, меняются редко,
 * и БД не нужна чтобы их прочитать.
 *
 * 29 слотов: A=10, B=9, C=10
 */

export const SPLIT_PROGRAM = {
  id: 'split',
  title: 'СПЛИТ',
  days: {
    A: [
      { order_num: 1,  muscle_group: 'back',     sub_group: 'lats',              type: 'base' },
      { order_num: 2,  muscle_group: 'back',     sub_group: 'lats',              type: 'base' },
      { order_num: 3,  muscle_group: 'back',     sub_group: 'thickness',         type: 'base' },
      { order_num: 4,  muscle_group: 'arms',     sub_group: 'biceps',            type: 'isolation' },
      { order_num: 5,  muscle_group: 'arms',     sub_group: 'biceps',            type: 'isolation' },
      { order_num: 6,  muscle_group: 'forearms', sub_group: 'forearm_flexors',   type: 'accessory' },
      { order_num: 7,  muscle_group: 'forearms', sub_group: 'forearm_extensors', type: 'accessory' },
      { order_num: 8,  muscle_group: 'neck',     sub_group: 'neck_flexors',      type: 'accessory' },
      { order_num: 9,  muscle_group: 'neck',     sub_group: 'neck_extensors',    type: 'accessory' },
      { order_num: 10, muscle_group: 'back',     sub_group: 'extensors',         type: 'accessory' }
    ],
    B: [
      { order_num: 1,  muscle_group: 'chest',    sub_group: 'chest_middle',      type: 'base' },
      { order_num: 2,  muscle_group: 'chest',    sub_group: 'chest_upper',       type: 'isolation' },
      { order_num: 3,  muscle_group: 'shoulders',sub_group: 'shoulders_front',   type: 'isolation' },
      { order_num: 4,  muscle_group: 'shoulders',sub_group: 'shoulders_side',    type: 'isolation' },
      { order_num: 5,  muscle_group: 'shoulders',sub_group: 'shoulders_rear',    type: 'isolation' },
      { order_num: 6,  muscle_group: 'arms',     sub_group: 'triceps',           type: 'isolation' },
      { order_num: 7,  muscle_group: 'arms',     sub_group: 'triceps',           type: 'isolation' },
      { order_num: 8,  muscle_group: 'abs',      sub_group: 'abs_upper',         type: 'accessory' },
      { order_num: 9,  muscle_group: 'abs',      sub_group: 'abs_lower',         type: 'accessory' }
    ],
    C: [
      { order_num: 1,  muscle_group: 'legs',     sub_group: 'quads',             type: 'base' },
      { order_num: 2,  muscle_group: 'legs',     sub_group: 'hamstrings',        type: 'base' },
      { order_num: 3,  muscle_group: 'legs',     sub_group: 'quads',             type: 'isolation' },
      { order_num: 4,  muscle_group: 'legs',     sub_group: 'hamstrings',        type: 'isolation' },
      { order_num: 5,  muscle_group: 'glutes',   sub_group: 'glutes',            type: 'isolation' },
      { order_num: 6,  muscle_group: 'legs',     sub_group: 'calves',            type: 'accessory' },
      { order_num: 7,  muscle_group: 'legs',     sub_group: 'calves',            type: 'accessory' },
      { order_num: 8,  muscle_group: 'abs',      sub_group: 'abs_upper',         type: 'accessory' },
      { order_num: 9,  muscle_group: 'abs',      sub_group: 'abs_obliques',      type: 'accessory' },
      { order_num: 10, muscle_group: 'abs',      sub_group: 'abs_lower',         type: 'accessory' }
    ]
  }
}

/**
 * Получить слоты дня программы.
 * @param {string} programId - 'split'
 * @param {string} day - 'A' / 'B' / 'C'
 */
export function getProgramDaySlots(programId, day) {
  if (programId === 'split') {
    return SPLIT_PROGRAM.days[day] || []
  }
  // В будущем сюда добавим другие программы (PPL, A/B/C hybrid и т.д.)
  return []
}
