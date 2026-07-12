import UiIcon from './UiIcon'
import ClockIcon from './ClockIcon'
import { formatDuration, formatMeters, CATEGORY_ORDER } from '../utils/history'
import { pluralizeWorkouts } from '../utils/plural'

/**
 * Сводка тренировок за период.
 *   Сверху — общие показатели (Тренировок · Время) по ВСЕМ типам.
 *   Тонкий разделитель.
 *   Ниже — список видов активности, которые БЫЛИ в периоде (иконка + название
 *   слева, значение справа): силовая/растяжка — счёт тренировок, плавание/бег —
 *   дистанция. Отсутствующие виды не выводим — список сам растёт под новые типы.
 *   Нет тренировок → мотивирующая заглушка.
 * `summary` — результат `summarizeWorkouts` (`{ count, minutes, byType }`).
 */

// Вид активности: иконка/цвет/название + какая метрика (счёт или дистанция).
const TYPE_META = {
  strength: { icon: 'power', color: 'var(--color-primary)', label: 'Силовая', metric: 'count' },
  pool: { icon: 'swimming', color: 'var(--cat-pool)', label: 'Плавание', metric: 'distance' },
  cardio: { icon: 'cardio', color: 'var(--cat-cardio)', label: 'Бег', metric: 'distance' },
  stretch: { icon: 'stretching', color: 'var(--cat-stretch)', label: 'Растяжка', metric: 'count' }
}

export default function HistoryStats({ summary }) {
  if (!summary || summary.count === 0) {
    return <div style={styles.empty}>Завершите первую тренировку, чтобы увидеть статистику.</div>
  }

  const types = CATEGORY_ORDER.filter(k => summary.byType[k]?.count > 0)

  return (
    <div>
      {/* Общие показатели периода */}
      <div style={styles.totals}>
        <Total
          icon={<UiIcon name="muscles" size={15} color="var(--color-text-secondary)" />}
          value={String(summary.count)}
          label="Тренировок"
        />
        <Total
          icon={<span style={styles.clock}><ClockIcon size={14} /></span>}
          value={formatDuration(summary.minutes)}
          label="Время"
        />
      </div>

      <div style={styles.divider} aria-hidden="true" />

      {/* Виды активности, что были в периоде */}
      <div style={styles.list}>
        {types.map(k => {
          const m = TYPE_META[k]
          const b = summary.byType[k]
          const value = m.metric === 'distance'
            ? formatMeters(b.distance)
            : `${b.count} ${pluralizeWorkouts(b.count)}`
          return (
            <div key={k} style={styles.row}>
              <span style={styles.rowLeft}>
                <UiIcon name={m.icon} size={17} color={m.color} />
                <span style={styles.rowLabel}>{m.label}</span>
              </span>
              <span style={styles.rowValue}>{value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Total({ icon, value, label }) {
  return (
    <div style={styles.total}>
      <span style={styles.totalTop}>
        {icon}
        <span style={styles.totalValue}>{value}</span>
      </span>
      <span style={styles.totalLabel}>{label}</span>
    </div>
  )
}

const styles = {
  totals: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '40px' },
  total: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  totalTop: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  totalValue: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px',
    letterSpacing: '0.2px', whiteSpace: 'nowrap'
  },
  totalLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  },
  divider: { height: '1px', background: 'var(--border-hairline)', margin: '14px 0' },

  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { display: 'inline-flex', alignItems: 'center', gap: '10px' },
  rowLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)'
  },
  rowValue: {
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text)'
  },

  empty: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', padding: '4px 0', lineHeight: 1.4
  }
}
