/**
 * Человекочитаемые названия мышечных групп и подгрупп.
 * Используется на экране дня тренировки для заголовков секций и карточек.
 */

export const MUSCLE_GROUP_LABELS = {
  back: 'СПИНА',
  chest: 'ГРУДЬ',
  legs: 'НОГИ',
  glutes: 'ЯГОДИЦЫ',
  shoulders: 'ПЛЕЧИ',
  arms: 'РУКИ',
  biceps: 'БИЦЕПС',
  triceps: 'ТРИЦЕПС',
  abs: 'ПРЕСС',
  forearms: 'ПРЕДПЛЕЧЬЯ',
  neck: 'ШЕЯ',
  warmup: 'РАЗМИНКА'
}

/**
 * Подгруппы — то что показывается на карточке упражнения мелким шрифтом сверху.
 * Например: ШИРИНА, ТОЛЩИНА, БИЦЕПС.
 *
 * Если подгруппы в данных нет — на карточке этот блок просто скрывается.
 */
export const SUB_GROUP_LABELS = {
  // back
  lats:        'ШИРИНА',
  thickness:   'ТОЛЩИНА',
  extensors:   'РАЗГИБАТЕЛИ',
  traps:       'ТРАПЕЦИИ',
  // chest
  chest:       'ГРУДЬ',
  chest_upper: 'ВЕРХ ГРУДИ',
  chest_lower: 'НИЗ ГРУДИ',
  // arms
  biceps:      'БИЦЕПС',
  triceps:     'ТРИЦЕПС',
  // shoulders
  front_delt:  'ПЕРЕДНЯЯ ДЕЛЬТА',
  mid_delt:    'СРЕДНЯЯ ДЕЛЬТА',
  rear_delt:   'ЗАДНЯЯ ДЕЛЬТА',
  rotator_cuff:'РОТАТОРНАЯ МАНЖЕТА',
  // legs
  quadriceps:  'КВАДРИЦЕПС',
  hamstrings:  'БИЦЕПС БЕДРА',
  glutes:      'ЯГОДИЦЫ',
  adductors:   'ПРИВОДЯЩИЕ',
  abductors:   'ОТВОДЯЩИЕ',
  calves:      'ИКРЫ',
  // abs
  abs_upper:   'ВЕРХ ПРЕССА',
  abs_lower:   'НИЗ ПРЕССА',
  abs_oblique: 'КОСЫЕ',
  core:        'КОР',
  // forearms
  forearm_flexors:   'СГИБАТЕЛИ ПРЕДПЛЕЧЬЯ',
  forearm_extensors: 'РАЗГИБАТЕЛИ ПРЕДПЛЕЧЬЯ',
  // neck
  neck_flexors:   'СГИБАТЕЛИ ШЕИ',
  neck_extensors: 'РАЗГИБАТЕЛИ ШЕИ',
  warmup:         'РАЗМИНКА'
}

/**
 * «СПИНА» → «Спина». Подписи групп и подгрупп хранятся капсом (так они пришли
 * из первой версии), а показываются обычным регистром — приведение живёт здесь,
 * одно на всех, чтобы копии в экранах не разъезжались.
 */
export const titleCase = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '')

/**
 * Подпись тега упражнения: «Ноги — Квадрицепс».
 *
 * Заголовков групп над карточками в приложении НЕТ — группа переехала внутрь
 * тега, поэтому подпись собирается здесь один раз на все экраны (день
 * тренировки, меню долгого нажатия, любимые, конструктор, рекорды).
 *
 * Группа и подгруппа совпали — второй половины нет: «Бицепс», а не
 * «Бицепс — Бицепс». Подгруппы нет вовсе — остаётся имя группы.
 */
export function exerciseTagLabel(muscleGroup, subGroup) {
  const group = titleCase(MUSCLE_GROUP_LABELS[muscleGroup] || muscleGroup || '')
  const sub = titleCase(SUB_GROUP_LABELS[subGroup] || subGroup || '')
  if (!sub) return group
  if (!group || group === sub) return sub
  return `${group} — ${sub}`
}
