import { useMemo } from 'react'
import { mskParts, workoutCategoryMeta, workoutMinutes, formatHours } from '../utils/history'

/**
 * Столбчатая диаграмма количества тренировок по периодам — под календарём на
 * экране «Статистика». Управляется тем же верхним тумблером Неделя/Месяц/Год/Всё
 * (и выбранным в календаре месяцем/годом): своих переключателей у графика НЕТ.
 *
 * Две категории (стек в акцентных цветах): силовая (зелёный) снизу, плавание
 * (синий) сверху. По Y — число тренировок, по X — корзины периода:
 *   Неделя → 7 дней (Пн–Вс), Месяц → дни месяца, Год → 12 месяцев,
 *   Всё время → годы.
 * Легенда снизу — число тренировок и часы по каждой категории за период.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_INITIALS = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д']
const STRENGTH_COLOR = 'var(--cat-gym)'
const POOL_COLOR = 'var(--cat-pool)'

function mskTodayParts() {
  const s = new Date(Date.now() + 3 * 3600 * 1000)
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() }
}

// Категория тренировки → серия графика: плавание отдельно, всё прочее — силовая.
function seriesOf(w) {
  return workoutCategoryMeta(w).key === 'pool' ? 'pool' : 'strength'
}

function buildBuckets(workouts, period, view) {
  const mk = (label) => ({ label, strength: { count: 0, min: 0 }, pool: { count: 0, min: 0 } })
  let buckets = []
  let indexOf = () => -1

  if (period === 'week') {
    const t = mskTodayParts()
    const dow = (new Date(Date.UTC(t.y, t.m, t.d)).getUTCDay() + 6) % 7 // Пн=0
    const base = Date.UTC(t.y, t.m, t.d) - dow * 86400000
    buckets = WEEKDAYS.map(mk)
    indexOf = (p) => {
      const i = Math.round((Date.UTC(p.y, p.m, p.d) - base) / 86400000)
      return i >= 0 && i <= 6 ? i : -1
    }
  } else if (period === 'month') {
    const daysIn = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
    // Подписи только у опорных дней, чтобы ось не пестрила.
    const marks = new Set([1, 5, 10, 15, 20, 25, daysIn])
    buckets = Array.from({ length: daysIn }, (_, i) => mk(marks.has(i + 1) ? String(i + 1) : ''))
    indexOf = (p) => (p.y === view.year && p.m === view.month ? p.d - 1 : -1)
  } else if (period === 'year') {
    buckets = MONTH_INITIALS.map(mk)
    indexOf = (p) => (p.y === view.year ? p.m : -1)
  } else { // all
    let minY = mskTodayParts().y
    for (const w of workouts || []) {
      if (!w.finished_at) continue
      const y = mskParts(w.finished_at).y
      if (y < minY) minY = y
    }
    const maxY = mskTodayParts().y
    buckets = []
    for (let y = minY; y <= maxY; y++) buckets.push(mk(String(y)))
    indexOf = (p) => (p.y >= minY && p.y <= maxY ? p.y - minY : -1)
  }

  for (const w of workouts || []) {
    if (!w.finished_at) continue
    const i = indexOf(mskParts(w.finished_at))
    if (i < 0 || i >= buckets.length) continue
    const s = buckets[i][seriesOf(w)]
    s.count++
    s.min += workoutMinutes(w)
  }
  return buckets
}

export default function WorkoutBarChart({ workouts, period, view }) {
  const buckets = useMemo(() => buildBuckets(workouts, period, view), [workouts, period, view])

  const totals = useMemo(() => {
    const t = { strength: { count: 0, min: 0 }, pool: { count: 0, min: 0 } }
    for (const b of buckets) {
      t.strength.count += b.strength.count; t.strength.min += b.strength.min
      t.pool.count += b.pool.count; t.pool.min += b.pool.min
    }
    return t
  }, [buckets])

  const hasData = totals.strength.count + totals.pool.count > 0

  return (
    <div style={styles.card}>
      <div style={styles.title}>ТРЕНИРОВКИ</div>
      {hasData ? (
        <>
          <Bars buckets={buckets} />
          <div style={styles.legend}>
            {totals.strength.count > 0 && (
              <LegendItem color={STRENGTH_COLOR} label="Силовая" count={totals.strength.count} min={totals.strength.min} />
            )}
            {totals.pool.count > 0 && (
              <LegendItem color={POOL_COLOR} label="Плавание" count={totals.pool.count} min={totals.pool.min} />
            )}
          </div>
        </>
      ) : (
        <div style={styles.empty}>Нет тренировок за этот период.</div>
      )}
    </div>
  )
}

function LegendItem({ color, label, count, min }) {
  return (
    <span style={styles.legendItem}>
      <span style={{ ...styles.legendDot, background: color }} />
      <span style={styles.legendLabel}>{label}</span>
      <span style={styles.legendValue}>{count} · {formatHours(min)}</span>
    </span>
  )
}

function Bars({ buckets }) {
  const W = 320, H = 168
  const padL = 6, padR = 6, padT = 20, padB = 20
  const plotW = W - padL - padR, plotH = H - padT - padB
  const yBase = padT + plotH

  const n = buckets.length
  const slot = plotW / n
  const barW = Math.max(3, Math.min(slot * 0.62, 22))
  const maxTotal = Math.max(1, ...buckets.map(b => b.strength.count + b.pool.count))
  const showCounts = n <= 14

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
      {/* Базовая линия */}
      <line x1={padL} y1={yBase} x2={W - padR} y2={yBase} stroke="var(--border-hairline)" strokeWidth="1" />

      {buckets.map((b, i) => {
        const cx = padL + i * slot + slot / 2
        const left = cx - barW / 2
        const total = b.strength.count + b.pool.count
        const sH = (b.strength.count / maxTotal) * plotH
        const pH = (b.pool.count / maxTotal) * plotH
        const sy = yBase - sH
        const py = sy - pH
        return (
          <g key={i}>
            {b.strength.count > 0 && (
              <rect x={left} y={sy} width={barW} height={sH} rx="2" fill={STRENGTH_COLOR} />
            )}
            {b.pool.count > 0 && (
              <rect x={left} y={py} width={barW} height={pH} rx="2" fill={POOL_COLOR} />
            )}
            {showCounts && total > 0 && (
              <text x={cx} y={py - 5} textAnchor="middle" style={styles.svgCount}>{total}</text>
            )}
            {b.label && (
              <text x={cx} y={H - 6} textAnchor="middle" style={styles.svgTick}>{b.label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '16px'
  },
  title: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '12px',
    letterSpacing: '2px', color: 'var(--color-text-secondary)', marginBottom: '14px'
  },
  legend: {
    display: 'flex', flexWrap: 'wrap', gap: '16px',
    marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)'
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: '7px' },
  legendDot: { width: '10px', height: '10px', borderRadius: '3px', flexShrink: 0 },
  legendLabel: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' },
  legendValue: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-secondary)' },
  svgCount: { fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 800, fill: 'var(--color-text)' },
  svgTick: { fontFamily: 'var(--font-manrope)', fontSize: '9px', fontWeight: 600, fill: 'var(--color-text-secondary)' },
  empty: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)',
    textAlign: 'center', padding: '24px 8px'
  }
}
