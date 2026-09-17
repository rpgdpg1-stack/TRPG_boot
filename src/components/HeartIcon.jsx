/**
 * Сердечко (моно-иконка). Состояния: filled (heart-fill.svg, залитое) и
 * контур (heart.svg, незалитое). Цвет по умолчанию: залитое — акцент,
 * контур — призрачный. Источник форм — src/assets/ui/, рендер через UiIcon.
 */
import UiIcon from './UiIcon'

export default function HeartIcon({ filled = false, size = 18, color }) {
  const c = color || (filled ? 'var(--color-primary)' : 'var(--text-ghost)')
  return <UiIcon name={filled ? 'heart-fill' : 'heart'} size={size} color={c} />
}
