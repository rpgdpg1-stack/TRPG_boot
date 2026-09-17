// Карандаш «редактировать» (моно-иконка). Источник — src/assets/ui/pencil.svg,
// рендер через UiIcon. Цвет по умолчанию — оранжевый (для пункта меню);
// серым — как индикатор «созданная программа».
import UiIcon from './UiIcon'

export default function PencilIcon({ size = 20, color = 'var(--cat-cardio)' }) {
  return <UiIcon name="pencil" size={size} color={color} />
}
