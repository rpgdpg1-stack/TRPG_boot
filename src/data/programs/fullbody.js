/**
 * Программа «ФУЛБАДИ» — два дня, каждый на всё тело.
 *
 * Этот файл — ЧИСТЫЕ ДАННЫЕ, без логики (как split.js).
 * Регистрируется в src/features/programs/registry.js под slug 'fullbody'
 * и dbId 'prog_002'.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ПРОГРАММА, А НЕ СКЛЕЙКА ДНЕЙ СПЛИТА
 * Сплит бьёт каждую мышцу раз в неделю. При двух тренировках это мало, поэтому
 * дни собраны заново: в КАЖДОМ есть ноги, жим, тяга, плечи, руки и пресс —
 * значит каждая мышца получает нагрузку дважды в неделю, и каждый раз под
 * другим углом (см. таблицу ниже).
 *
 *   Мышца          День A                    День B
 *   квадрицепс     приседания (база)         жим ногами (база)
 *   задняя цепь    румынская тяга            мостик + сгибания ног
 *   грудь          наклонный жим гантелей    сведение (бабочка)
 *   спина          подтягивания + гориз.тяга верхний блок + face pull
 *   плечи          жим гантелей (передняя)   махи (средняя) + face pull (задняя)
 *   бицепс         супинированный хват       нейтральный хват (молотки)
 *   трицепс        разгибание вниз           разгибание вверх
 *   пресс          низ (подъём ног)          верх (скручивания)
 *
 * ПОРЯДОК ВНУТРИ ДНЯ
 * От большого к малому: базы на крупные мышцы идут первыми, пока свежий; руки,
 * приводящие/отводящие, икры и пресс — в конец, где усталость уже не мешает.
 * Тяжёлые ноги намеренно не идут подряд: между ними вклинено упражнение на
 * грудь, чтобы ноги успели отдышаться. Пресс всегда последний — забитый пресс
 * разваливает технику приседаний и жимов.
 *
 * Последние 3-4 упражнения дня (руки, приводящие/отводящие, икры, пресс)
 * лёгкие — их удобно объединять в суперсеты, чтобы уложиться по времени.
 *
 * СОСТАВ: 24 упражнения = 2 дня × 12. Взято из каталога сплита. Не вошли:
 * жим штанги лёжа (убран из проекта), сгибания/разгибания запястий (предплечья
 * грузятся хватом во всех тягах и молотках) и шея (травмоопасно, кому надо —
 * добавит в свою программу).
 */

export const FULLBODY_PROGRAM = {
  days: {
    A: [
      { order_num: 1,  muscle_group: 'legs',      sub_group: 'quadriceps',  type: 'base',      default_exercise_id: 'ex_031' },
      { order_num: 2,  muscle_group: 'chest',     sub_group: 'chest_upper', type: 'base',      default_exercise_id: 'ex_024' },
      { order_num: 3,  muscle_group: 'legs',      sub_group: 'hamstrings',  type: 'base',      default_exercise_id: 'ex_039' },
      { order_num: 4,  muscle_group: 'back',      sub_group: 'lats',        type: 'base',      default_exercise_id: 'ex_001' },
      { order_num: 5,  muscle_group: 'shoulders', sub_group: 'front_delt',  type: 'base',      default_exercise_id: 'ex_055' },
      { order_num: 6,  muscle_group: 'back',      sub_group: 'thickness',   type: 'base',      default_exercise_id: 'ex_008' },
      { order_num: 7,  muscle_group: 'legs',      sub_group: 'quadriceps',  type: 'isolation', default_exercise_id: 'ex_036' },
      { order_num: 8,  muscle_group: 'biceps',    sub_group: 'biceps',      type: 'isolation', default_exercise_id: 'ex_063' },
      { order_num: 9,  muscle_group: 'triceps',   sub_group: 'triceps',     type: 'isolation', default_exercise_id: 'ex_070' },
      { order_num: 10, muscle_group: 'back',      sub_group: 'extensors',   type: 'accessory', default_exercise_id: 'ex_013' },
      { order_num: 11, muscle_group: 'legs',      sub_group: 'calves',      type: 'isolation', default_exercise_id: 'ex_051' },
      { order_num: 12, muscle_group: 'abs',       sub_group: 'abs_lower',   type: 'isolation', default_exercise_id: 'ex_081' }
    ],
    B: [
      { order_num: 1,  muscle_group: 'legs',      sub_group: 'quadriceps',  type: 'base',      default_exercise_id: 'ex_032' },
      { order_num: 2,  muscle_group: 'chest',     sub_group: 'chest',       type: 'isolation', default_exercise_id: 'ex_022' },
      { order_num: 3,  muscle_group: 'legs',      sub_group: 'glutes',      type: 'base',      default_exercise_id: 'ex_042' },
      { order_num: 4,  muscle_group: 'back',      sub_group: 'lats',        type: 'base',      default_exercise_id: 'ex_004' },
      { order_num: 5,  muscle_group: 'shoulders', sub_group: 'mid_delt',    type: 'isolation', default_exercise_id: 'ex_058' },
      { order_num: 6,  muscle_group: 'shoulders', sub_group: 'rear_delt',   type: 'isolation', default_exercise_id: 'ex_059' },
      { order_num: 7,  muscle_group: 'legs',      sub_group: 'hamstrings',  type: 'isolation', default_exercise_id: 'ex_040' },
      { order_num: 8,  muscle_group: 'biceps',    sub_group: 'biceps',      type: 'isolation', default_exercise_id: 'ex_066' },
      { order_num: 9,  muscle_group: 'triceps',   sub_group: 'triceps',     type: 'isolation', default_exercise_id: 'ex_071' },
      { order_num: 10, muscle_group: 'legs',      sub_group: 'adductors',   type: 'accessory', default_exercise_id: 'ex_050' },
      { order_num: 11, muscle_group: 'legs',      sub_group: 'abductors',   type: 'accessory', default_exercise_id: 'ex_049' },
      { order_num: 12, muscle_group: 'abs',       sub_group: 'abs_upper',   type: 'isolation', default_exercise_id: 'ex_078' }
    ]
  }
}
