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
  back:      { tag: 'var(--muscle-back-tag)', accent: 'var(--muscle-back-accent)' },
  chest:     { tag: 'var(--muscle-chest-tag)', accent: 'var(--muscle-chest-accent)' },
  arms:      { tag: 'var(--muscle-arms-tag)', accent: 'var(--muscle-arms-accent)' },
  biceps:    { tag: 'var(--muscle-biceps-tag)', accent: 'var(--muscle-biceps-accent)' },
  triceps:   { tag: 'var(--muscle-triceps-tag)', accent: 'var(--muscle-triceps-accent)' },
  shoulders: { tag: 'var(--muscle-shoulders-tag)', accent: 'var(--muscle-shoulders-accent)' },
  legs:      { tag: 'var(--muscle-legs-tag)', accent: 'var(--muscle-legs-accent)' },
  glutes:    { tag: 'var(--muscle-glutes-tag)', accent: 'var(--muscle-glutes-accent)' },
  abs:       { tag: 'var(--muscle-abs-tag)', accent: 'var(--muscle-abs-accent)' },
  forearms:  { tag: 'var(--muscle-forearms-tag)', accent: 'var(--muscle-forearms-accent)' },
  neck:      { tag: 'var(--muscle-neck-tag)', accent: 'var(--muscle-neck-accent)' }
}

// Сами цвета — в styles/tokens.css (--muscle-*): одно место на все цвета проекта.
const FALLBACK = { tag: 'var(--muscle-fallback-tag)', accent: 'var(--muscle-fallback-accent)' }

/**
 * Своё упражнение с придуманной группой («Кроссфит», «Растяжка») — цвета этой
 * группы взять неоткуда. Красим в акцентный, приглушённый до плотности
 * остальных тегов: это читается как «моё», а не как «сломанная группа», в
 * которую превращал серый фолбэк.
 *
 * Если же человек выбрал существующую группу из списка — работают её цвета,
 * своё упражнение встаёт в общий строй.
 */
const CUSTOM = { tag: 'var(--green-700)', accent: 'var(--color-primary)' }

/**
 * Безопасный геттер: всегда возвращает объект { tag, accent }.
 * Если группы нет в карте — серые цвета, а для своего упражнения (`custom`) —
 * акцентные.
 */
export function getMuscleGroupColors(muscleGroup, custom = false) {
  return MUSCLE_GROUP_COLORS[muscleGroup] || (custom ? CUSTOM : FALLBACK)
}