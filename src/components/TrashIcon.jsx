// Корзина «удалить» (моно-иконка) — всегда в цвете ошибки: удаление в приложении
// одно и то же действие. Источник — src/assets/ui/trash.svg, рендер через UiIcon.
import UiIcon from './UiIcon'

export default function TrashIcon({ size = 20, color = 'var(--color-error)' }) {
  return <UiIcon name="trash" size={size} color={color} />
}
