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
 *
 * Если хочешь поменять упражнение в каком-то слоте —
 * просто замени default_exercise_id на нужный (например 'ex_004').
 * Список всех упражнений см. в БД: SELECT id, name FROM exercises.
 */

export const SPLIT_PROGRAM = {
  id: 'split',
  title: 'СПЛИТ',
  days: {
    A: [
      { order_num: 1,  muscle_group: 'back',     sub_group: 'lats',              type: 'base',      default_exercise_id: 'ex_001' }, // Подтягивания нейтральным хватом
      { order_num: 2,  muscle_group: 'back',     sub_group: 'lats',              type: 'base',      default_exercise_id: 'ex_004' }, // Тяга верхнего блока нейтральным хватом
      { order_num: 3,  muscle_group: 'back',     sub_group: 'thickness',         type: 'base',      default_exercise_id: 'ex_008' }, // Тяга горизонтального блока параллельным хватом
      { order_num: 4,  muscle_group: 'arms',     sub_group: 'biceps',            type: 'isolation', default_exercise_id: 'ex_063' }, // Подъём гантелей попеременно на наклонной скамье 45°
      { order_num: 5,  muscle_group: 'arms',     sub_group: 'biceps',            type: 'isolation', default_exercise_id: 'ex_066' }, // Молотковые сгибания с гантелями
      { order_num: 6,  muscle_group: 'forearms', sub_group: 'forearm_flexors',   type: 'accessory', default_exercise_id: 'ex_084' }, // Сгибания запястий
      { order_num: 7,  muscle_group: 'forearms', sub_group: 'forearm_extensors', type: 'accessory', default_exercise_id: 'ex_085' }, // Разгибание запястий
      { order_num: 8,  muscle_group: 'neck',     sub_group: 'neck_flexors',      type: 'accessory', default_exercise_id: 'ex_086' }, // Подьем блина шеей лежа на спине
      { order_num: 9,  muscle_group: 'neck',     sub_group: 'neck_extensors',    type: 'accessory', default_exercise_id: 'ex_087' }, // Подьем блина шеей лежа на животе
      { order_num: 10, muscle_group: 'back',     sub_group: 'extensors',         type: 'accessory', default_exercise_id: 'ex_013' }  // Гиперэкстензия с отягощением
    ],
    B: [
      { order_num: 1, muscle_group: 'chest',     sub_group: 'chest',             type: 'base',      default_exercise_id: 'ex_017' }, // Жим штанги лежа
      { order_num: 2, muscle_group: 'chest',     sub_group: 'chest_upper',       type: 'base',      default_exercise_id: 'ex_024' }, // Жим гантелей на наклонной 30-45°
      { order_num: 3, muscle_group: 'chest',     sub_group: 'chest',             type: 'isolation', default_exercise_id: 'ex_022' }, // Сведение рук в тренажере (Бабочка)
      { order_num: 4, muscle_group: 'shoulders', sub_group: 'front_delt',        type: 'base',      default_exercise_id: 'ex_055' }, // Жим гантелей сидя
      { order_num: 5, muscle_group: 'shoulders', sub_group: 'mid_delt',          type: 'isolation', default_exercise_id: 'ex_058' }, // Махи гантелями в стороны стоя
      { order_num: 6, muscle_group: 'shoulders', sub_group: 'rear_delt',         type: 'isolation', default_exercise_id: 'ex_059' }, // Тяга к лицу (Face Pull)
      { order_num: 7, muscle_group: 'arms',      sub_group: 'triceps',           type: 'isolation', default_exercise_id: 'ex_071' }, // Разгибание на блоке вверх (нижний блок)
      { order_num: 8, muscle_group: 'arms',      sub_group: 'triceps',           type: 'isolation', default_exercise_id: 'ex_070' }, // Разгибание на блоке вниз (верхний блок)
      { order_num: 9, muscle_group: 'abs',       sub_group: 'abs_upper',         type: 'isolation', default_exercise_id: 'ex_078' }  // Скручивания в тренажёре
    ],
    C: [
      { order_num: 1,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'base',      default_exercise_id: 'ex_031' }, // Приседания в Смите
      { order_num: 2,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'base',      default_exercise_id: 'ex_032' }, // Жим ногами в тренажёре
      { order_num: 3,  muscle_group: 'legs', sub_group: 'hamstrings', type: 'base',      default_exercise_id: 'ex_039' }, // Румынская тяга в Смите
      { order_num: 4,  muscle_group: 'legs', sub_group: 'quadriceps', type: 'isolation', default_exercise_id: 'ex_036' }, // Разгибание ног сидя в тренажере
      { order_num: 5,  muscle_group: 'legs', sub_group: 'hamstrings', type: 'isolation', default_exercise_id: 'ex_040' }, // Сгибания ног лёжа в тренажёре
      { order_num: 6,  muscle_group: 'legs', sub_group: 'glutes',     type: 'base',      default_exercise_id: 'ex_042' }, // Ягодичный мостик со штангой
      { order_num: 7,  muscle_group: 'legs', sub_group: 'adductors',  type: 'accessory', default_exercise_id: 'ex_050' }, // Сведение ног в тренажере
      { order_num: 8,  muscle_group: 'legs', sub_group: 'abductors',  type: 'accessory', default_exercise_id: 'ex_049' }, // Разведение ног в тренажере
      { order_num: 9,  muscle_group: 'legs', sub_group: 'calves',     type: 'accessory', default_exercise_id: 'ex_051' }, // Подьем на носки стоя в тренажере
      { order_num: 10, muscle_group: 'abs',  sub_group: 'abs_lower',  type: 'isolation', default_exercise_id: 'ex_081' }  // Подьем ног в висе на турнике
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
