import UiIcon from './UiIcon'
import ClockIcon from './ClockIcon'
import HeartIcon from './HeartIcon'
import { formatHours, formatMeters, CATEGORY_ORDER } from '../utils/history'

// Иконки показателей — одного размера (мускул / часы / сердце).
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

export default function HistoryStats({ summary, loading = false, totalsOnly = false, favorites = null }) {
  // Первый заход без кеша — скелетон вместо мигания пустой заглушки.
  if (loading) {
    return (
      <div>
        <div style={styles.totals}>
          <span style={styles.skTotal} />
          <span style={styles.skTotal} />
        </div>
        {!totalsOnly && <div style={styles.divider} aria-hidden="true" />}
        {!totalsOnly && (
          <div style={styles.list}>
            {[0, 1].map(i => <span key={i} style={styles.skRow} />)}
          </div>
        )}
      </div>
    )
  }

  // Тренировок нет (или статистика скрыта приватностью), но любимые есть — рисуем
  // ряд с одним показателем «❤ N упр.», а не заглушку про первую тренировку.
  const hasTotals = !!summary && summary.count > 0
  const favOnly = totalsOnly && !!favorites && !hasTotals
  if (!hasTotals && !favOnly) {
    return <div style={styles.empty}>Завершите первую тренировку, чтобы увидеть статистику.</div>
  }

  const types = hasTotals ? CATEGORY_ORDER.filter(k => summary.byType?.[k]?.count > 0) : []

  return (
    <div>
      {/* Общие показатели периода. В карточке профиля (totalsOnly) — компактный ряд
          «иконка + зелёная цифра + серая единица», подписи словами не нужны. */}
      <div style={styles.totals}>
        {hasTotals && (
          <>
            <Total
              icon={<UiIcon name="muscles-line" size={ICON} color="var(--color-text-secondary)" />}
              value={String(summary.count)}
              unit="трен."
              label="Тренировок"
              compact={totalsOnly}
            />
            <Total
              icon={<span style={styles.clock}><ClockIcon size={ICON} /></span>}
              value={formatHours(summary.minutes)}
              unit="ч."
              label="Время"
              compact={totalsOnly}
            />
          </>
        )}
        {/* Любимые — третьим в ряду; тап открывает список (модалка по центру). */}
        {totalsOnly && favorites && (
          <Total
            icon={<span style={styles.heart}><HeartIcon filled size={ICON} /></span>}
            value={String(favorites.count)}
            unit="упр."
            label="Любимые"
            compact
            onClick={favorites.onClick}
          />
        )}
      </div>

      {/* Разбивка по видам — только в полном режиме (в профиле её убираем). */}
      {!totalsOnly && <div style={styles.divider} aria-hidden="true" />}

      {!totalsOnly && (
      <div style={styles.list}>
        {types.map(k => {
          const m = TYPE_META[k]
          const b = summary.byType[k]
          const showDist = m.metric === 'distance' && b.distance > 0
          return (
            <div key={k} style={styles.row}>
              <Badge iconName={m.icon} color={m.color} />
              <span style={styles.rowCount}>{b.count}</span>
              <span style={styles.rowLabel}>{m.label}</span>
              {showDist && (
                <span style={styles.rowDist}>({formatMeters(b.distance)})</span>
              )}
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

/**
 * Показатель. Полный вид (экран статистики): иконка + цифра, снизу подпись словом.
 * Компактный (карточка профиля): иконка + цифра + единица в одну строку, без подписи.
 * `onClick` делает показатель кнопкой (любимые → список).
 */
function Total({ icon, value, unit, label, compact = false, onClick = null }) {
  const inner = (
    <>
      <span style={styles.totalTop}>
        {icon}
        {/* Полный вид: единица уже внутри значения («2,9 ч»). Компактный: цифра
            зелёным, единица отдельным серым словом справа. */}
        <span style={styles.totalValue}>{compact ? stripUnit(value) : value}</span>
        {compact && <span style={styles.totalUnit}>{unit}</span>}
      </span>
      {!compact && <span style={styles.totalLabel}>{label}</span>}
    </>
  )
  if (onClick) {
    return (
      <button style={{ ...styles.total, ...styles.totalBtn }} onClick={onClick} aria-label={label}>
        {inner}
      </button>
    )
  }
  return <div style={styles.total}>{inner}</div>
}

// «2,9 ч» → «2,9»: в компактном ряду единицу рисуем отдельным серым словом.
function stripUnit(value) {
  return String(value).replace(/\s+\D+$/, '')
}

const styles = {
  totals: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '28px', flexWrap: 'wrap' },
  total: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  // Показатель-кнопка (любимые): без вида кнопки, только тап.
  totalBtn: {
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  totalTop: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  heart: { display: 'inline-flex', color: 'var(--color-primary)' },
  // Цифра — акцентная зелёная (главное в показателе).
  totalValue: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px',
    letterSpacing: '0.2px', whiteSpace: 'nowrap', color: 'var(--color-primary)'
  },
  // Единица («трен.» / «ч» / «упр.») — серая и тоньше цифры.
  totalUnit: {
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  },
  // Подпись метрики (secondary info) — серым, чтобы главной была цифра.
  totalLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500,
    color: 'var(--text-info)', whiteSpace: 'nowrap'
  },
  divider: { height: '1px', background: 'var(--border-hairline)', margin: '14px 0' },

  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: { display: 'flex', alignItems: 'center', gap: '9px' },
  // Лестница важности: число (primary, белое) → название (85%) → пояснение (68%).
  rowCount: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px', letterSpacing: '0.2px',
    color: 'var(--color-text)'
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
