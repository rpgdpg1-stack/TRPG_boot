/**
 * Структура программы Сплит — захардкожена в коде.
 *
 * Каждый слот:
 *   - order_num: порядок в дне
 *   - muscle_group: основная группа (для sticky-заголовка)
 *   - sub_group + type: для подбора замены через фильтр в БД
 *   - default_exercise_id: конкретное упражнение по умолчанию
 *
 * 29 слотов: A=10, B=9, C=10
 */

export const SPLIT_PROGRAM = {
  id: 'split',
  title: 'СПЛИТ',
  days: {
    A: [
      { order_num: 1,  muscle_group: 'back',     sub_group: 'lats',              type: 'base',      default_exercise_id: 'ex_001' },
      { order_num: 2,  muscle_group: 'back',     sub_group: 'lats',              type: 'base',      default_exercise_id: 'ex_002' },
      { order_num: 3,  muscle_group: 'back',     sub_group: 'thickness',         type: 'base',      default_exercise_id: 'ex_006' },
      { order_num: 4,  muscle_group: 'arms',     sub_group: 'biceps',            type: 'isolation', default_exercise_id: 'ex_063' },
      { order_num: 5,  muscle_group: 'arms',     sub_group: 'biceps',            type: 'isolation', default_exercise_id: 'ex_064' },
      { order_num: 6,  muscle_group: 'forearms', sub_group: 'forearm_flexors',   type: 'accessory', default_exercise_id: 'ex_084' },
      { order_num: 7,  muscle_group: 'forearms', sub_group: 'forearm_extensors', type: 'accessory', default_exercise_id: 'ex_085' },
      { order_num: 8,  muscle_group: 'neck',     sub_group: 'neck_flexors',      type: 'accessory', default_exercise_id: 'ex_086' },
      { order_num: 9,  muscle_group: 'neck',     sub_group: 'neck_extensors',    type: 'accessory', default_exercise_id: 'ex_087' },
      { order_num: 10, muscle_group: 'back',     sub_group: 'extensors',         type: 'accessory', default_exercise_id: 'ex_013' }
    ],
    B: [
      { order_num: 1, muscle_group: 'chest',     sub_group: 'chest',             type: 'base',      default_exercise_id: 'ex_017' },
      { order_num: 2, muscle_group: 'chest',     sub_group: 'chest_upper',       type: 'base',      default_exercise_id: 'ex_024' },
      { order_num: 3, muscle_group: 'chest',     sub_group: 'chest',             type: 'isolation', default_exercise_id: 'ex_022' },
      { order_num: 4, muscle_group: 'shoulders', sub_group: 'front_delt',        type: 'base',      default_exercise_id: 'ex_054' },
      { order_num: 5, muscle_group: 'shoulders', sub_group: 'mid_delt',          type: 'isolation', default_exercise_id: 'ex_058' },
      { order_num: 6, muscle_group: 'shoulders', sub_group: 'rear_delt',         type: 'isolation', default_exercise_id: 'ex_059' },
      { order_num: 7, muscle_group: 'arms',      sub_group: 'triceps',           type: 'isolation', default_exercise_id: 'ex_070' },
      { order_num: 8, muscle_group: 'arms',      sub_group: 'triceps',           type: 'isolation', default_exercise_id: 'ex_072' },
      { order_num: 9, muscle_group: 'abs',       sub_group: 'abs_upper',         type: 'isolation', default_exercise_id: 'ex_078' }
    ],
    C: [
      { order_num: 1,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'base',      default_exercise_id: 'ex_030' },
      { order_num: 2,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'base',      default_exercise_id: 'ex_032' },
      { order_num: 3,  muscle_group: 'legs', sub_group: 'hamstrings', type: 'base',      default_exercise_id: 'ex_037' },
      { order_num: 4,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'isolation', default_exercise_id: 'ex_036' },
      { order_num: 5,  muscle_group: 'legs', sub_group: 'hamstrings', type: 'isolation', default_exercise_id: 'ex_040' },
      { order_num: 6,  muscle_group: 'legs', sub_group: 'glutes',     type: 'base',      default_exercise_id: 'ex_042' },
      { order_num: 7,  muscle_group: 'legs', sub_group: 'adductors',  type: 'accessory', default_exercise_id: 'ex_050' },
      { order_num: 8,  muscle_group: 'legs', sub_group: 'abductors',  type: 'accessory', default_exercise_id: 'ex_049' },
      { order_num: 9,  muscle_group: 'legs', sub_group: 'calves',     type: 'accessory', default_exercise_id: 'ex_051' },
      { order_num: 10, muscle_group: 'abs',  sub_group: 'abs_lower',  type: 'isolation', default_exercise_id: 'ex_081' }
    ]
  }
}

/**
 * Получить слоты дня программы.
 */
export function getProgramDaySlots(programId, day) {
  if (programId === 'split') {
    return SPLIT_PROGRAM.days[day] || []
  }
  return []
}
