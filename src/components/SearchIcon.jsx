// Лупа (моно-иконка). Источник — src/assets/ui/search.svg, рендер через UiIcon.
// Слева в поле поиска — знак того, что строка ищет, а не вводит данные.
import UiIcon from './UiIcon'

export default function SearchIcon({ size = 18, color = 'var(--color-text-secondary)' }) {
  return <UiIcon name="search" size={size} color={color} />
}
