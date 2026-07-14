import UiIcon from './UiIcon'
import ClockIcon from './ClockIcon'
import { formatDuration, formatMeters, CATEGORY_ORDER } from '../utils/history'

/**
 * Сводка тренировок за период.
 *   Сверху — общие показатели (Тренировок · Время) по ВСЕМ типам.
 *   Тонкий разделитель.
 *   Ниже — список видов активности, которые БЫЛИ в периоде: прямоугольный бейдж
 *   (чёрная иконка на цветном фоне, единый вид с календарём) + название + число
 *   тренировок в цвет вида; у плавания/бега рядом — дистанция в скобках, тоже в
 *   цвет. Отсутствующие виды не выводим — список сам растёт под новые типы.
 *   Нет тренировок → мотивирующая заглушка.
 * `summary` — результат `summarizeWorkouts` (`{ count, minutes, byType }`).
 */

// Прямоугольный бейдж с чёрной иконкой (единый вид с ячейками/сводкой календаря).
function Badge({ iconName, color, size = 22, icon = 13 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '6px', background: color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <UiIcon name={iconName} size={icon} color="#0D0C0C" />
    </span>
  )
}

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
          icon={<UiIcon name="muscles-line" size={16} color="var(--color-text-secondary)" />}
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
          const showDist = m.metric === 'distance' && b.distance > 0
          return (
            <div key={k} style={styles.row}>
              <Badge iconName={m.icon} color={m.color} />
              <span style={styles.rowLabel}>{m.label}</span>
              <span style={{ ...styles.rowCount, color: m.color }}>{b.count}</span>
              {showDist && (
                <span style={styles.rowDist}>({formatMeters(b.distance)})</span>
              )}
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
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
    // Чуть менее контрастно — чтобы главной оставалась цифра, а не подпись.
    opacity: 0.82
  },
  divider: { height: '1px', background: 'var(--border-hairline)', margin: '14px 0' },

  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: { display: 'flex', alignItems: 'center', gap: '9px' },
  rowLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)'
  },
  // Число тренировок — в цвет вида; дистанция в скобках — серая (не спорит с числом).
  rowCount: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px', letterSpacing: '0.2px'
  },
  rowDist: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600,
    color: 'var(--color-text-secondary)', marginLeft: '-2px'
  },

  empty: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', padding: '4px 0', lineHeight: 1.4
  }
}
