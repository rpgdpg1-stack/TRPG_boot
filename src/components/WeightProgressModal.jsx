import { useEffect, useMemo, useState } from 'react'
import { getWeightHistory } from '../features/exercises/api'

/**
 * Модалка «Прогресс веса» — линейный график рабочего веса упражнения во времени
 * (как в трейдинге: время по X, кг по Y). Открывается иконкой прогресса из
 * модалки упражнения (ExerciseActionMenu). Одна точка в день (данные из БД,
 * пишет триггер record_weight_point). История копится с момента внедрения —
 * задним числом данных нет.
 *
 * Состояния:
 *  - загрузка: скелетон
 *  - 0 точек: подсказка «поставь вес»
 *  - 1 точка: одиночная точка + подсказка «линия появится со второй»
 *  - 2+ точки: линия + заливка + сетка + подписи осей
 */

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

// 'YYYY-MM-DD' → { d, m, y } (без часовых поясов — строка уже день по Москве).
function parseDay(str) {
  const [y, m, d] = String(str).split('-').map(n => parseInt(n, 10))
  return { y, m: m - 1, d }
}

// '2026-07-05' → '5 июл' (+ год, если график пересекает годы).
function formatAxisDate(str, withYear) {
  const { d, m, y } = parseDay(str)
  const base = `${d} ${SHORT_MONTHS[m] || ''}`
  return withYear ? `${base} ’${String(y).slice(-2)}` : base
}

// Разница в целых днях между двумя 'YYYY-MM-DD'.
function daysBetween(a, b) {
  const pa = parseDay(a), pb = parseDay(b)
  const ua = Date.UTC(pa.y, pa.m, pa.d)
  const ub = Date.UTC(pb.y, pb.m, pb.d)
  return Math.round((ub - ua) / 86400000)
}

function pluralDays(n) {
  const last = n % 10, lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дня'
  return 'дней'
}

// Форматируем кг для подписей оси: без хвостовых нулей (60 / 62.5).
function fmtKg(n) {
  const r = Math.round(n * 10) / 10
  return (r % 1 === 0 ? String(r) : r.toFixed(1)).replace('.', ',')
}

export default function WeightProgressModal({ exerciseId, exerciseName, accent, currentWeight, onClose }) {
  const [points, setPoints] = useState(null) // null = грузим

  useEffect(() => {
    let cancelled = false
    getWeightHistory(exerciseId).then(list => {
      if (!cancelled) setPoints(list || [])
    })
    return () => { cancelled = true }
  }, [exerciseId])

  const line = accent || 'var(--color-primary)'

  const stats = useMemo(() => {
    if (!points || points.length === 0) return null
    const first = points[0]
    const last = points[points.length - 1]
    const delta = last.weight - first.weight
    const span = daysBetween(first.day, last.day)
    return { first, last, delta, span }
  }, [points])

  return (
    <div style={styles.overlay} onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.titleRow}>
            <span style={styles.eyebrow}>ПРОГРЕСС ВЕСА</span>
          </div>
          <div style={styles.name}>{exerciseName}</div>

          {/* Текущий вес + дельта за период */}
          <div style={styles.bigRow}>
            <span style={{ ...styles.bigValue, color: line }}>
              {fmtKg(currentWeight || (stats?.last?.weight ?? 0))}
              <span style={styles.bigUnit}>кг</span>
            </span>
            {stats && stats.span > 0 && (
              <span style={{
                ...styles.delta,
                color: stats.delta > 0 ? 'var(--color-primary)' : stats.delta < 0 ? 'var(--color-text-secondary)' : 'var(--color-text-secondary)'
              }}>
                {stats.delta > 0 ? '+' : stats.delta < 0 ? '−' : ''}{fmtKg(Math.abs(stats.delta))} кг
                <span style={styles.deltaSub}> · {stats.span} {pluralDays(stats.span)}</span>
              </span>
            )}
          </div>
        </div>

        <div style={styles.chartWrap}>
          {points === null ? (
            <div style={styles.skeleton} />
          ) : points.length === 0 ? (
            <Empty text={'Пока нет данных.\nПоставь рабочий вес — и точка появится здесь.'} />
          ) : (
            <Chart points={points} line={line} />
          )}
        </div>

        {points && points.length === 1 && (
          <div style={styles.hint}>
            Копим историю — линия появится, когда изменишь вес в другой день.
          </div>
        )}

        <button onClick={onClose} style={styles.closeBtn}>ЗАКРЫТЬ</button>
      </div>
    </div>
  )
}

function Empty({ text }) {
  return (
    <div style={styles.empty}>
      <span style={styles.emptyIcon}>📈</span>
      {text.split('\n').map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}

/**
 * SVG-график. X — равномерно по индексу точек (чтобы редкие ранние точки не
 * слипались), подписи X — реальные даты (первая/последняя). Y — кг с небольшим
 * запасом сверху/снизу. Одна точка → просто маркер по центру.
 */
function Chart({ points, line }) {
  const W = 340, H = 200
  const padL = 38, padR = 14, padT = 16, padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const weights = points.map(p => p.weight)
  let min = Math.min(...weights)
  let max = Math.max(...weights)
  if (min === max) { min -= 1; max += 1 } // плоская линия → раздвигаем, чтобы не липла к краю
  else {
    const pad = (max - min) * 0.15
    min -= pad; max += pad
  }

  const n = points.length
  const xAt = (i) => n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1)
  const yAt = (w) => padT + (1 - (w - min) / (max - min)) * plotH

  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.weight), ...p }))

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const areaPath = n > 1
    ? `${linePath} L${coords[n - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
    : ''

  // 3 линии сетки Y: max, середина, min.
  const yTicks = [max, (max + min) / 2, min]
  // Год в подписях, если история пересекает разные годы.
  const withYear = parseDay(points[0].day).y !== parseDay(points[n - 1].day).y
  const gid = 'wpg-grad'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={line} stopOpacity="0.28" />
          <stop offset="100%" stopColor={line} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Сетка + подписи кг */}
      {yTicks.map((t, i) => {
        const y = yAt(t)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" style={styles.svgTickY}>{fmtKg(t)}</text>
          </g>
        )
      })}

      {/* Заливка под линией */}
      {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}

      {/* Линия */}
      {n > 1 && <path d={linePath} fill="none" stroke={line} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

      {/* Точки: промежуточные мелкие, последняя — крупнее */}
      {coords.map((c, i) => {
        const isLast = i === n - 1
        return (
          <circle
            key={i}
            cx={c.x} cy={c.y}
            r={isLast ? 4.5 : 3}
            fill={isLast ? line : 'var(--color-bg)'}
            stroke={line}
            strokeWidth={isLast ? 0 : 2}
          />
        )
      })}

      {/* Подписи X: первая и последняя дата */}
      <text x={coords[0].x} y={H - 8} textAnchor={n === 1 ? 'middle' : 'start'} style={styles.svgTickX}>
        {formatAxisDate(points[0].day, withYear)}
      </text>
      {n > 1 && (
        <text x={coords[n - 1].x} y={H - 8} textAnchor="end" style={styles.svgTickX}>
          {formatAxisDate(points[n - 1].day, withYear)}
        </text>
      )}
    </svg>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 'calc(env(safe-area-inset-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 20px)',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  panel: {
    position: 'relative',
    width: '100%',
    maxWidth: '380px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '28px',
    padding: '22px 18px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  header: { display: 'flex', flexDirection: 'column', gap: '4px' },
  titleRow: { display: 'flex', alignItems: 'center' },
  eyebrow: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '11px',
    letterSpacing: '2px',
    color: 'var(--color-text-secondary)'
  },
  name: {
    fontFamily: 'var(--font-geist, var(--font-manrope))',
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1.25
  },
  bigRow: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginTop: '2px' },
  bigValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '30px',
    lineHeight: 1,
    letterSpacing: '0.5px'
  },
  bigUnit: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 700,
    marginLeft: '4px',
    opacity: 0.7
  },
  delta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 700
  },
  deltaSub: { color: 'var(--color-text-secondary)', fontWeight: 500 },

  chartWrap: {
    width: '100%',
    background: 'rgba(0, 0, 0, 0.22)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '10px 8px 4px',
    minHeight: '160px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  skeleton: {
    width: '100%',
    height: '180px',
    borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.04)'
  },
  empty: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.6,
    padding: '30px 12px'
  },
  emptyIcon: { fontSize: '30px', display: 'block', marginBottom: '10px', opacity: 0.8 },

  svgTickY: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    fontWeight: 600,
    fill: 'var(--color-text-secondary)'
  },
  svgTickX: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    fontWeight: 600,
    fill: 'var(--color-text-secondary)'
  },

  hint: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    padding: '0 6px'
  },
  closeBtn: {
    marginTop: '2px',
    width: '100%',
    padding: '13px',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: 'var(--radius-pill)',
    border: 'none',
    cursor: 'pointer'
  }
}
