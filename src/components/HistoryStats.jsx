import UiIcon from './UiIcon'
import ClockIcon from './ClockIcon'
import { formatHours, formatMeters, CATEGORY_ORDER } from '../utils/history'
import SectionBadge from './SectionBadge'

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
      {/* Период — ОТДЕЛЬНЫМ уровнем над цифрами, по центру и тихо. Так цифры
          остаются просто метриками и не конкурируют с подписью, а «за какой
          отрезок» читается один раз сверху. */}
      {periodLabel && <div style={styles.periodLabel}>{periodLabel}</div>}

      {/* Общие показатели периода. Единицы («трен», «ч») стоят рядом с числом —
          тот же вид, что в карточке на главной. */}
      <div style={styles.totals}>
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
      </div>

      <div style={styles.divider} aria-hidden="true" />

      <div style={styles.list}>
        {types.map(k => {
          const m = TYPE_META[k]
          const b = summary.byType[k]
          const showDist = m.metric === 'distance' && b.distance > 0
          return (
            <div key={k} style={styles.row}>
              <SectionBadge iconName={m.icon} color={m.color} />
              <span style={{ ...styles.rowCount, color: m.color }}>{b.count}</span>
              <span style={styles.rowLabel}>{m.label}</span>
              {showDist && (
                <span style={styles.rowDist}>
                  (<Distance meters={b.distance} color={m.color} inherit />)
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
/**
 * Пара «число + единица» — ОДИН вид на весь проект: цифра акцентом (Geist 800,
 * title-размер), единица тише и мельче (Manrope 700, label-размер, серым).
 *
 * Раньше единица наследовала кегль родителя, и «км» в дистанции выходил заметно
 * крупнее «кг» в весе — рядом это читалось как разнобой.
 */
export function MetricValue({ num, unit, color = 'var(--color-primary)', inherit = false }) {
  // inherit — значение внутри уже размеченной строки (дистанция в скобках рядом
  // с числом вида): свой кегль там навязывать нельзя, иначе «2,25 км» выходит
  // крупнее соседней «8». Наследуем размер и вес от родителя, задаём только цвет.
  if (inherit) {
    return (
      <>
        <span style={{ color }}>{num}</span>
        {unit && <span> {unit}</span>}
      </>
    )
  }
  return (
    <>
      <span style={{ ...styles.totalValue, color }}>{num}</span>
      {unit && <span style={styles.totalUnit}> {unit}</span>}
    </>
  )
}

export function Distance({ meters, color, inherit = false }) {
  const text = formatMeters(meters)
  const i = text.lastIndexOf(' ')
  return (
    <MetricValue
      num={i > 0 ? text.slice(0, i) : text}
      unit={i > 0 ? text.slice(i + 1) : ''}
      color={color}
      inherit={inherit}
    />
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
      <MetricValue num={num} unit={u} />
    </span>
  )
}

const styles = {
  totals: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-6)' },
  // Подпись периода — отдельная строка над цифрами, по центру, тихим серым.
  periodLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', textAlign: 'center',
    marginBottom: 'var(--space-2)'
  },
  totalTop: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-15)' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  // Цифра — акцентная зелёная (главное в показателе).
  totalValue: {
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)',
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
  // Строка вида — на ступень тише тоталов: это разбивка, а не главный показатель.
  // Каждый следующий элемент мельче предыдущего (число → название → дистанция).
  rowCount: {
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-button-size)', letterSpacing: '0.2px'
  },
  rowLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--text-label)'
  },
  // Дистанция в скобках — тем же кеглем, что число слева: это второй показатель
  // той же строки, а не сноска. Тише только цветом.
  rowDist: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700,
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
