/**
 * Цвета мышечных групп для визуального разделения карточек упражнений.
 *
 * Используются в трёх местах:
 *  - ExerciseCard: цвет цифры веса (число) + фон тега группы
 *  - WorkoutDay: цвет заголовка раздела (СПИНА, ГРУДЬ, НОГИ...)
 *  - В будущем: для статистики и графиков
 *
 * Два цвета на группу:
 *  - tag    — приглушённый, для фона тега на карточке (контраст с белым текстом)
 *  - accent — яркий, для цифры веса и заголовка группы (выделяется на чёрном)
 *
 * Если в коде встретилась группа которой тут нет — fallback на серый,
 * чтобы карточка не сломалась.
 */

export const MUSCLE_GROUP_COLORS = {
  back:      { tag: '#914633', accent: '#C6624A' },
  chest:     { tag: '#9B6D45', accent: '#DA9439' },
  arms:      { tag: '#4B90C9', accent: '#4B90C9' },
  biceps:    { tag: '#3D6FA3', accent: '#4B90C9' },
  triceps:   { tag: '#3D6FA3', accent: '#4B90C9' },
  shoulders: { tag: '#31ABB7', accent: '#31ABB7' },
  legs:      { tag: '#46C85D', accent: '#46C85D' },
  glutes:    { tag: '#607345', accent: '#9ED153' },
  abs:       { tag: '#58436B', accent: '#8F67B4' },
  forearms:  { tag: '#835B76', accent: '#B07EA0' },
  neck:      { tag: '#4F443B', accent: '#A79586' }
}

const FALLBACK = { tag: '#3A3A3A', accent: '#888888' }

/**
 * Безопасный геттер: всегда возвращает объект { tag, accent }.
 * Если группы нет в карте — отдаст серые цвета.
 */
export function getMuscleGroupColors(muscleGroup) {
  return MUSCLE_GROUP_COLORS[muscleGroup] || FALLBACK
}