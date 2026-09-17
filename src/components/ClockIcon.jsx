/**
 * Иконка часов (тонкий контур, моно-иконка). Источник формы —
 * src/assets/ui/clock.svg, рендер через UiIcon. Единый источник для оценки
 * длительности и таймера (шапка дня, карточки главной/избранного).
 */
import UiIcon from './UiIcon'

export default function ClockIcon({ size = 13, color = 'currentColor' }) {
  return <UiIcon name="clock" size={size} color={color} />
}
