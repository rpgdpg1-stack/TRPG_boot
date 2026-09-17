// Булавка-закреп (моно-иконка). filled — залитая (pin-fill.svg, закреплено),
// иначе контур (pin.svg, можно закрепить). Цвет по умолчанию — акцентный зелёный.
// Источник форм — src/assets/ui/, рендер через UiIcon.
import UiIcon from './UiIcon'

export default function PinIcon({ size = 20, filled = true, color = 'var(--color-primary)' }) {
  return <UiIcon name={filled ? 'pin-fill' : 'pin'} size={size} color={color} />
}
