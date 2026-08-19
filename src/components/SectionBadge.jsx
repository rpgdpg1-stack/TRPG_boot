import UiIcon from './UiIcon'

/**
 * Значок раздела тренировки: чёрная иконка на цветном скруглённом квадрате.
 *
 * Единый вид во всей истории — ячейка дня в календаре, сводка месяца, попап
 * дня, список показателей. Раньше был двумя одинаковыми копиями в
 * HistoryCalendar и HistoryStats, отличавшимися только размерами по умолчанию.
 *
 * Цвет иконки всегда --accent-on (почти чёрный): подложка у значка яркая
 * и разная по разделам, и только тёмная иконка читается на всех.
 */
export default function SectionBadge({ iconName, color, size = 20, icon = 12 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 'var(--radius-xs)', background: color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <UiIcon name={iconName} size={icon} color="var(--accent-on)" />
    </span>
  )
}
