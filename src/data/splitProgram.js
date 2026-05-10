/**
 * Структура программы Сплит — захардкожена в коде.
 * Источник истины: таблица program_days в Supabase (на момент 2026-05-10).
 *
 * Каждый слот описывается:
 *   - order_num: порядок в дне (1, 2, 3...)
 *   - muscle_group: основная группа мышц (для sticky-заголовка)
 *   - sub_group: подгруппа (для подбора упражнений)
 *   - type: тип упражнения (base / isolation / accessory)
 *   - default_exercise_id: (TODO) конкретное упражнение по умолчанию
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
      { order_num: 1, muscle_group: 'chest',     sub_group: 'chest',             type: 'base' },
      { order_num: 2, muscle_group: 'chest',     sub_group: 'chest_upper',       type: 'base' },
      { order_num: 3, muscle_group: 'chest',     sub_group: 'chest',             type: 'isolation' },
      { order_num: 4, muscle_group: 'shoulders', sub_group: 'front_delt',        type: 'base' },
      { order_num: 5, muscle_group: 'shoulders', sub_group: 'mid_delt',          type: 'isolation' },
      { order_num: 6, muscle_group: 'shoulders', sub_group: 'rear_delt',         type: 'isolation' },
      { order_num: 7, muscle_group: 'arms',      sub_group: 'triceps',           type: 'isolation' },
      { order_num: 8, muscle_group: 'arms',      sub_group: 'triceps',           type: 'isolation' },
      { order_num: 9, muscle_group: 'abs',       sub_group: 'abs_upper',         type: 'isolation' }
    ],
    C: [
      { order_num: 1,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'base' },
      { order_num: 2,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'base' },
      { order_num: 3,  muscle_group: 'legs', sub_group: 'hamstrings', type: 'base' },
      { order_num: 4,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'isolation' },
      { order_num: 5,  muscle_group: 'legs', sub_group: 'hamstrings', type: 'isolation' },
      { order_num: 6,  muscle_group: 'legs', sub_group: 'glutes',     type: 'base' },
      { order_num: 7,  muscle_group: 'legs', sub_group: 'adductors',  type: 'accessory' },
      { order_num: 8,  muscle_group: 'legs', sub_group: 'abductors',  type: 'accessory' },
      { order_num: 9,  muscle_group: 'legs', sub_group: 'calves',     type: 'accessory' },
      { order_num: 10, muscle_group: 'abs',  sub_group: 'abs_lower',  type: 'isolation' }
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
  // В будущем сюда добавим другие программы
  return []
}
