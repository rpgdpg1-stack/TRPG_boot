import UiIcon from './UiIcon'

/**
 * Иконка мускулов (бицепс) — замена эмодзи 💪 во всём приложении.
 * Файл лежит в src/assets/ui/muscles.svg, рендерится через UiIcon (currentColor).
 *
 * Принцип цвета:
 *  - earned/активно → зелёный (primary)
 *  - ещё не получено → серый
 * Передавай color явно где нужен особый цвет (ранг/лига).
 *
 * earned (bool) — короткий способ выбрать зелёный/серый без ручного color.
 */
export default function MuscleIcon({ size = 16, color, earned = true, style }) {
  const finalColor = color || (earned ? '#FADFBE' : 'var(--color-text-secondary)')
  return <UiIcon name="muscles" size={size} color={finalColor} style={style} />
}