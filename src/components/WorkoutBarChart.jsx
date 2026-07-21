import { useMemo, useState } from 'react'
import { mskParts, workoutCategoryMeta, workoutMinutes, formatHours } from '../utils/history'
import UiIcon from './UiIcon'

/**
 * График тренировок на экране «Статистика» (под календарём). Стиль — как сводка
 * трат в Т-Банке: по умолчанию КОЛЬЦО (доли категорий) + чипы категорий снизу;
 * переключатель справа меняет вид на СТОЛБЦЫ (распределение по времени).
 *
 * Две категории в акцентных цветах: силовая (зелёный), плавание (синий).
 * Период задаётся ТОЛЬКО верхним тумблером Неделя/Месяц/Год/Всё и календарём —
 * своих переключателей периода у графика нет. Кольцо/столбцы — только вид.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_INITIALS = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д']
const STRENGTH = { key: 'strength', label: 'Силовая', color: 'var(--cat-gym)', icon: 'power' }
const POOL = { key: 'pool', label: 'Плавание', color: 'var(--cat-pool)', icon: 'swimming' }

function mskTodayParts() {
  const s = new Date(Date.now() + 3 * 3600 * 1000)
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() }
}

const seriesOf = (w) => (workoutCategoryMeta(w).key === 'pool' ? 'pool' : 'strength')

function buildBuckets(workouts, period, view) {
  const mk = (label) => ({ label, strength: { count: 0, min: 0 }, pool: { count: 0, min: 0 } })
  let buckets = []
  let indexOf = () => -1

  if (period === 'week') {
    const t = mskTodayParts()
    const dow = (new Date(Date.UTC(t.y, t.m, t.d)).getUTCDay() + 6) % 7
    const base = Date.UTC(t.y, t.m, t.d) - dow * 86400000
    buckets = WEEKDAYS.map(mk)
    indexOf = (p) => {
      const i = Math.round((Date.UTC(p.y, p.m, p.d) - base) / 86400000)
      return i >= 0 && i <= 6 ? i : -1
    }
  } else if (period === 'month') {
    const daysIn = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
    const marks = new Set([1, 5, 10, 15, 20, 25, daysIn])
    buckets = Array.from({ length: daysIn }, (_, i) => mk(marks.has(i + 1) ? String(i + 1) : ''))
    indexOf = (p) => (p.y === view.year && p.m === view.month ? p.d - 1 : -1)
  } else if (period === 'year') {
    buckets = MONTH_INITIALS.map(mk)
    indexOf = (p) => (p.y === view.year ? p.m : -1)
  } else {
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
  const [chartView, setChartView] = useState('ring') // 'ring' | 'bars'

  const buckets = useMemo(() => buildBuckets(workouts, period, view), [workouts, period, view])
  const totals = useMemo(() => {
    const t = { strength: { count: 0, min: 0 }, pool: { count: 0, min: 0 } }
    for (const b of buckets) {
      t.strength.count += b.strength.count; t.strength.min += b.strength.min
      t.pool.count += b.pool.count; t.pool.min += b.pool.min
    }
    return t
  }, [buckets])

  const items = [
    { ...STRENGTH, ...totals.strength },
    { ...POOL, ...totals.pool }
  ].filter(x => x.count > 0)
  const hasData = items.length > 0

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div style={styles.title}>ТРЕНИРОВКИ</div>
        <div style={styles.toggle}>
          <ViewBtn active={chartView === 'ring'} onClick={() => setChartView('ring')} aria="Кольцо"><RingIcon /></ViewBtn>
          <ViewBtn active={chartView === 'bars'} onClick={() => setChartView('bars')} aria="Столбцы"><BarsIcon /></ViewBtn>
        </div>
      </div>

      {!hasData ? (
        <div style={styles.empty}>Нет тренировок за этот период.</div>
      ) : (
        <>
          {chartView === 'ring' ? <Donut items={items} /> : <Bars buckets={buckets} />}
          <div style={styles.chips}>
            {items.map(it => (
              <span key={it.key} style={styles.chip}>
                <span style={{ ...styles.chipBadge, background: it.color }}>
                  <UiIcon name={it.icon} size={13} color="#0D0C0C" />
                </span>
                <span style={styles.chipLabel}>{it.label}</span>
                <span style={styles.chipValue}>{it.count} · {formatHours(it.min)}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ViewBtn({ active, onClick, aria, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      style={{ ...styles.viewBtn, ...(active ? styles.viewBtnActive : {}), color: active ? 'var(--color-text)' : 'var(--color-text-inactive)' }}
    >{children}</button>
  )
}
function RingIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3.2" /></svg>
}
function BarsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="11" width="4" height="9" rx="1" /><rect x="10" y="6" width="4" height="14" rx="1" /><rect x="16" y="14" width="4" height="6" rx="1" />
    </svg>
  )
}

/** Кольцевая диаграмма долей категорий (силовая/плавание) с иконками и %. */
function Donut({ items }) {
  const S = 210, cx = S / 2, cy = S / 2, r = 78, sw = 22
  const total = items.reduce((s, x) => s + x.count, 0)

  // Проценты с коррекцией округления до 100.
  const pcts = items.map(it => Math.round((it.count / total) * 100))
  pcts[pcts.length - 1] += 100 - pcts.reduce((a, b) => a + b, 0)

  const polar = (rad, frac) => {
    const a = (frac * 360 - 90) * Math.PI / 180
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
  }
  const arcPath = (rr, s, e) => {
    const [x1, y1] = polar(rr, s), [x2, y2] = polar(rr, e)
    const large = (e - s) > 0.5 ? 1 : 0
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${rr} ${rr} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }

  const single = items.length === 1
  const gap = single ? 0 : 0.02
  let acc = 0
  const segs = items.map((it, i) => {
    const frac = it.count / total
    const seg = { ...it, frac, start: acc, mid: acc + frac / 2, end: acc + frac, pct: pcts[i] }
    acc += frac
    return seg
  })

  return (
    <div style={styles.donutWrap}>
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ display: 'block', maxWidth: '210px' }}>
        {/* Дуги категорий */}
        {single ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={segs[0].color} strokeWidth={sw} />
        ) : (
          segs.map((s, i) => (
            <path key={i} d={arcPath(r, s.start + gap / 2, s.end - gap / 2)} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round" />
          ))
        )}

        {/* Центр: всего тренировок */}
        <text x={cx} y={cy - 4} textAnchor="middle" style={styles.donutCenterValue}>{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" style={styles.donutCenterLabel}>трен.</text>

        {/* % снаружи каждой дуги, в цвете категории (когда категорий 2) */}
        {!single && segs.map((s, i) => {
          const [px, py] = polar(r + sw / 2 + 12, s.mid)
          return (
            <text key={`m${i}`} x={px} y={py + 4} textAnchor="middle" style={{ ...styles.donutPct, fill: s.color }}>{s.pct}%</text>
          )
        })}
      </svg>
    </div>
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
            {b.strength.count > 0 && <rect x={left} y={sy} width={barW} height={sH} rx="2" fill={STRENGTH.color} />}
            {b.pool.count > 0 && <rect x={left} y={py} width={barW} height={pH} rx="2" fill={POOL.color} />}
            {showCounts && total > 0 && <text x={cx} y={py - 5} textAnchor="middle" style={styles.svgCount}>{total}</text>}
            {b.label && <text x={cx} y={H - 6} textAnchor="middle" style={styles.svgTick}>{b.label}</text>}
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
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  title: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '12px', letterSpacing: '2px', color: 'var(--color-text-secondary)' },
  toggle: {
    display: 'flex', gap: 0, padding: '3px',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)'
  },
  viewBtn: {
    width: '34px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', transition: 'background 0.18s ease, color 0.18s ease'
  },
  viewBtnActive: { background: 'var(--color-surface-active)' },

  donutWrap: { display: 'flex', justifyContent: 'center', padding: '4px 0 2px' },
  donutCenterValue: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '30px', fill: 'var(--color-text)' },
  donutCenterLabel: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, fill: 'var(--color-text-secondary)' },
  donutPct: { fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 700 },

  chips: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '14px' },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    padding: '7px 12px 7px 8px', borderRadius: 'var(--radius-pill)',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)'
  },
  chipBadge: { width: '22px', height: '22px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipLabel: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' },
  chipValue: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-secondary)' },

  svgCount: { fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 800, fill: 'var(--color-text)' },
  svgTick: { fontFamily: 'var(--font-manrope)', fontSize: '9px', fontWeight: 600, fill: 'var(--color-text-secondary)' },
  empty: { fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '24px 8px' }
}
