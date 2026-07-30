import UiIcon from './UiIcon'
import ClockIcon from './ClockIcon'
import { formatHours, formatMeters, CATEGORY_ORDER } from '../utils/history'

// Иконки показателей — одного размера (мускул / часы).
const ICON = 20

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
  strength: { icon: 'power', color: 'var(--cat-gym)', label: 'Силовая', metric: 'count' },
  pool: { icon: 'swimming', color: 'var(--cat-pool)', label: 'Плавание', metric: 'distance' },
  cardio: { icon: 'cardio', color: 'var(--cat-cardio)', label: 'Бег', metric: 'distance' },
  stretch: { icon: 'stretching', color: 'var(--cat-stretch)', label: 'Растяжка', metric: 'count' }
}

export default function HistoryStats({ summary, loading = false }) {
  // Первый заход без кеша — скелетон вместо мигания пустой заглушки.
  if (loading) {
    return (
      <div>
        <div style={styles.totals}>
          <span style={styles.skTotal} />
          <span style={styles.skTotal} />
        </div>
        <div style={styles.divider} aria-hidden="true" />
        <div style={styles.list}>
          {[0, 1].map(i => <span key={i} style={styles.skRow} />)}
        </div>
      </div>
    )
  }

  if (!summary || summary.count === 0) {
    return <div style={styles.empty}>Завершите первую тренировку, чтобы увидеть статистику.</div>
  }

  const types = CATEGORY_ORDER.filter(k => summary.byType?.[k]?.count > 0)

  return (
    <div>
      {/* Общие показатели периода */}
      <div style={styles.totals}>
        <Total
          icon={<UiIcon name="muscles-line" size={ICON} color="var(--color-text-secondary)" />}
          value={String(summary.count)}
          label="Тренировок"
        />
        <Total
          icon={<span style={styles.clock}><ClockIcon size={ICON} /></span>}
          value={formatHours(summary.minutes)}
          label="Время"
          splitUnit
        />
      </div>

      <div style={styles.divider} aria-hidden="true" />

      <div style={styles.list}>
        {types.map(k => {
          const m = TYPE_META[k]
          const b = summary.byType[k]
          const showDist = m.metric === 'distance' && b.distance > 0
          return (
            <div key={k} style={styles.row}>
              <Badge iconName={m.icon} color={m.color} />
              <span style={{ ...styles.rowCount, color: m.color }}>{b.count}</span>
              <span style={styles.rowLabel}>{m.label}</span>
              {showDist && (
                <span style={styles.rowDist}>
                  (<Distance meters={b.distance} color={m.color} />)
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** «2,25 км»: число — в цвет вида активности, единица — серым. */
export function Distance({ meters, color }) {
  const text = formatMeters(meters)
  const i = text.lastIndexOf(' ')
  const num = i > 0 ? text.slice(0, i) : text
  const unit = i > 0 ? text.slice(i + 1) : ''
  return (
    <>
      <span style={{ color, fontWeight: 800 }}>{num}</span>
      {unit && <span style={{ color: 'var(--color-text-secondary)' }}> {unit}</span>}
    </>
  )
}

/**
 * Показатель: иконка + цифра, снизу подпись словом.
 * `splitUnit` — у значения есть единица («3,7 ч»): цифра акцентом, единица серая
 * и тоньше (единицы вообще никогда не красим акцентом).
 */
function Total({ icon, value, label, splitUnit = false }) {
  const i = splitUnit ? String(value).lastIndexOf(' ') : -1
  const num = i > 0 ? String(value).slice(0, i) : value
  const unit = i > 0 ? String(value).slice(i + 1) : ''
  return (
    <div style={styles.total}>
      <span style={styles.totalTop}>
        {icon}
        <span style={styles.totalValue}>{num}</span>
        {unit && <span style={styles.totalUnit}>{unit}</span>}
      </span>
      <span style={styles.totalLabel}>{label}</span>
    </div>
  )
}

const styles = {
  totals: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '28px', flexWrap: 'wrap' },
  total: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  totalTop: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  // Цифра — акцентная зелёная (главное в показателе).
  totalValue: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px',
    letterSpacing: '0.2px', whiteSpace: 'nowrap', color: 'var(--color-primary)'
  },
  // Единица значения («ч») — серая и тоньше цифры.
  totalUnit: {
    fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 600,
    color: 'var(--color-text-secondary)', marginLeft: '-1px'
  },
  // Подпись метрики (secondary info) — серым, чтобы главной была цифра.
  totalLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500,
    color: 'var(--text-info)', whiteSpace: 'nowrap'
  },
  divider: { height: '1px', background: 'var(--border-hairline)', margin: '14px 0' },

  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: { display: 'flex', alignItems: 'center', gap: '9px' },
  // Число — в ЦВЕТ вида активности (силовая графитовая, плавание голубое…),
  // название — светло-серым, дистанция — тише всех.
  rowCount: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px', letterSpacing: '0.2px'
  },
  rowLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600, color: 'var(--text-label)'
  },
  rowDist: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600,
    color: 'var(--text-info)', marginLeft: '-2px'
  },

  empty: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', padding: '4px 0', lineHeight: 1.4
  },
  // Скелетоны (первый заход без кеша).
  skTotal: { width: '64px', height: '34px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)' },
  skRow: { height: '22px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }
}
