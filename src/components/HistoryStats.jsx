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
      width: size, height: size, borderRadius: 'var(--radius-xs)', background: color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <UiIcon name={iconName} size={icon} color="var(--accent-on)" />
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

export default function HistoryStats({ summary, loading = false, periodLabel = '', emptyText = 'Заверши первую тренировку, чтобы увидеть статистику.' }) {
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
    return <div style={styles.empty}>{emptyText}</div>
  }

  const types = CATEGORY_ORDER.filter(k => summary.byType?.[k]?.count > 0)

  return (
    <div>
      {/* Общие показатели периода. Единицы («трен», «ч») стоят рядом с числом —
          тот же вид, что в карточке на главной. Справа — подпись периода. */}
      <div style={styles.totals}>
        <span style={styles.totalsMain}>
          <Total
            icon={<UiIcon name="muscles-line" size={ICON} color="var(--color-text-secondary)" />}
            value={String(summary.count)}
            unit="трен"
          />
          <Total
            icon={<span style={styles.clock}><ClockIcon size={ICON} /></span>}
            value={formatHours(summary.minutes)}
            splitUnit
          />
        </span>
        {periodLabel && <span style={styles.periodLabel}>{periodLabel}</span>}
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
// Показатель: иконка + число акцентом + тихая единица. Подписи снизу
// («Тренировок»/«Время») убраны — единица рядом с числом говорит то же самое
// и совпадает с карточкой на главной.
function Total({ icon, value, unit, splitUnit = false }) {
  const i = splitUnit ? String(value).lastIndexOf(' ') : -1
  const num = i > 0 ? String(value).slice(0, i) : value
  const u = i > 0 ? String(value).slice(i + 1) : unit
  return (
    <span style={styles.totalTop}>
      {icon}
      <span style={styles.totalValue}>{num}</span>
      {u && <span style={styles.totalUnit}>{u}</span>}
    </span>
  )
}

const styles = {
  // Строка тоталов: показатели по центру, подпись периода — справа тем же
  // тихим серым, что иконки. Ряд не переносится: подпись короткая.
  totals: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)' },
  totalsMain: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)' },
  periodLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0
  },
  totalTop: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-15)' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  // Цифра — акцентная зелёная (главное в показателе).
  totalValue: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-title-size)',
    letterSpacing: '0.2px', whiteSpace: 'nowrap', color: 'var(--color-primary)'
  },
  // Единица значения («ч») — серая и тоньше цифры.
  totalUnit: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', marginLeft: '-1px'
  },
  // Подпись метрики (secondary info) — серым, чтобы главной была цифра.
  divider: { height: '1px', background: 'var(--border-hairline)', margin: 'var(--space-4) 0' },

  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  row: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  // Число — в ЦВЕТ вида активности (силовая графитовая, плавание голубое…),
  // название — светло-серым, дистанция — тише всех.
  rowCount: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-body-size)', letterSpacing: '0.2px'
  },
  rowLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700, color: 'var(--text-label)'
  },
  rowDist: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--text-info)', marginLeft: '-2px'
  },

  empty: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--space-1) 0', lineHeight: 1.4
  },
  // Скелетоны (первый заход без кеша).
  skTotal: { width: '64px', height: '34px', borderRadius: 'var(--radius-xs)', background: 'var(--highlight-recent)' },
  skRow: { height: '22px', borderRadius: 'var(--radius-xs)', background: 'var(--layer-1)' }
}
