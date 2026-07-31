import { haptic } from '../lib/telegram'
import { MONTHS_RU } from '../utils/history'

/**
 * Периоды статистики и их ЖИВЫЕ подписи: «7 дней · Август · 2026 · Всё».
 * `month`/`year` можно переопределить — на экране статистики метки показывают
 * тот месяц/год, который сейчас открыт в календаре.
 */
export function periodOptions(date = new Date(), { month, year } = {}) {
  return [
    { id: 'week', label: '7 дней' },
    { id: 'month', label: MONTHS_RU[month ?? date.getMonth()] },
    { id: 'year', label: String(year ?? date.getFullYear()) },
    { id: 'all', label: 'Всё' }
  ]
}

/**
 * Сегмент-контрол периода — один на проект: экран статистики, попап на главной,
 * модалка статистики в профиле и в карточке друга.
 *
 * Вид — пилюля-контейнер со стеклом, активный сегмент залит `--color-surface-active`
 * и подписан акцентом (как переключатель места в дне тренировки).
 *
 * @param items — [{ id, label }]
 * @param value — активный id
 * @param onChange — выбран другой период
 * @param compact — мельче (встроен в карточку главной, где мало места)
 */
export default function PeriodSwitcher({ items, value, onChange, compact = false, style }) {
  return (
    <div style={{ ...styles.group, ...(compact ? styles.groupCompact : null), ...style }} onClick={(e) => e.stopPropagation()}>
      {items.map((p, i) => {
        const active = p.id === value
        return (
          <button
            key={p.id}
            className="press-tile"
            onClick={(e) => {
              e.stopPropagation()
              if (p.id === value) return
              haptic.selection()
              onChange?.(p.id)
            }}
            style={{
              ...styles.item,
              ...(compact ? styles.itemCompact : null),
              ...(active ? styles.itemActive : null),
              marginLeft: i === 0 ? 0 : '-5px',
              zIndex: active ? 2 : 1,
              color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)'
            }}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  group: {
    display: 'flex', alignItems: 'center', gap: 0, padding: '4px',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
  },
  item: {
    position: 'relative', flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '30px', padding: '0 10px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.2px',
    cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  // Компактный — для встраивания внутрь карточки (главная).
  groupCompact: { padding: '3px' },
  itemCompact: { minHeight: '24px', padding: '0 6px', fontSize: '11px' },
  itemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  }
}
