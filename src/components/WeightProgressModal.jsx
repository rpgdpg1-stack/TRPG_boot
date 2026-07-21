import { useEffect, useMemo, useRef, useState } from 'react'
import { getWeightHistory } from '../features/exercises/api'
import { haptic } from '../lib/telegram'

/**
 * Модалка «Прогресс веса» — минималистичный график рабочего веса во времени
 * (паттерн «как в Тинькофф Инвестициях»):
 *  - чистая линия без точек-маркеров и без сетки;
 *  - горизонтальный ПУНКТИР на уровне текущего веса через весь график («сейчас»),
 *    масштаб Y всегда включает его — видно, на сколько выше/ниже прошлых периодов;
 *  - СКРАБ пальцем: зажал и ведёшь → вертикальный курсор + точка на линии, вверху
 *    показывается вес и дата этой точки; отпустил — вернулось к актуальному;
 *  - переключатель периода Месяц · Год · Всё время; в Месяц/Год стрелки ‹ › листают.
 *
 * Данные — из БД (одна точка в день, триггер record_weight_point). Между записями
 * линия идёт ровно (вес держался); у краёв окна вес «доносится» с последнего
 * известного, чтобы линия занимала всю ширину периода.
 */

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const PERIODS = [
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё время' }
]

/** Крестик-закрытие — единый вид со всеми модалками (как в меню упражнения). */
function CrossIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function parseDay(str) {
  const [y, m, d] = String(str).split('-').map(n => parseInt(n, 10))
  return { y, m: m - 1, d }
}
const dayToMs = (str) => { const { y, m, d } = parseDay(str); return Date.UTC(y, m, d) }

// '2026-07-25' → '25 июля 2026' (для подписи при скрабе).
function formatFullDate(str) {
  const { y, m, d } = parseDay(str)
  return `${d} ${MONTHS_GEN[m] || ''} ${y}`
}

// Кг без хвостовых нулей: 60 / 62,5.
function fmtKg(n) {
  const r = Math.round(n * 10) / 10
  return (r % 1 === 0 ? String(r) : r.toFixed(1)).replace('.', ',')
}

export default function WeightProgressModal({ exerciseId, exerciseName, accent, currentWeight, onClose }) {
  const [points, setPoints] = useState(null) // null = грузим; [] = нет данных
  const [period, setPeriod] = useState('all')
  const [offset, setOffset] = useState(0)     // 0 — текущий месяц/год; -1 — предыдущий; …
  const [scrubIdx, setScrubIdx] = useState(null)
  const chartRef = useRef(null)

  const line = accent || 'var(--color-primary)'

  useEffect(() => {
    let cancelled = false
    getWeightHistory(exerciseId).then(list => { if (!cancelled) setPoints(list || []) })
    return () => { cancelled = true }
  }, [exerciseId])

  // Сброс листания/скраба при смене типа периода.
  useEffect(() => { setOffset(0); setScrubIdx(null) }, [period])
  useEffect(() => { setScrubIdx(null) }, [offset])

  // «Сегодня» по Москве (день-ключи тоже по Москве).
  const today = useMemo(() => {
    const s = new Date(Date.now() + 3 * 3600 * 1000)
    return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() }
  }, [])
  const todayMs = Date.UTC(today.y, today.m, today.d)

  // Актуальный вес: свежий из карточки; если 0/нет — последняя точка истории.
  const currentW = (currentWeight && currentWeight > 0)
    ? currentWeight
    : (points && points.length ? points[points.length - 1].weight : 0)

  // Окно периода + серия для отрисовки.
  const win = useMemo(() => {
    if (!points || points.length === 0) return null
    const firstMs = dayToMs(points[0].day)

    let startMs, endMs, label, canLeft = false, canRight = false
    if (period === 'all') {
      startMs = firstMs; endMs = todayMs; label = 'Всё время'
    } else if (period === 'year') {
      const baseY = today.y + offset
      startMs = Date.UTC(baseY, 0, 1)
      endMs = baseY === today.y ? todayMs : Date.UTC(baseY, 11, 31)
      label = String(baseY)
      const firstY = parseDay(points[0].day).y
      canLeft = baseY > firstY
      canRight = offset < 0
    } else { // month
      const curIdx = today.y * 12 + today.m
      const idx = curIdx + offset
      const by = Math.floor(idx / 12), bm = ((idx % 12) + 12) % 12
      startMs = Date.UTC(by, bm, 1)
      endMs = (by === today.y && bm === today.m) ? todayMs : Date.UTC(by, bm + 1, 0)
      label = `${MONTHS_NOM[bm]} ${by}`
      const f = parseDay(points[0].day)
      const firstIdx = f.y * 12 + f.m
      canLeft = idx > firstIdx
      canRight = offset < 0
    }

    // Точки внутри окна + последний вес ДО окна (для «доноса» линии от края).
    const dataPts = []
    let priorWeight = null
    for (const p of points) {
      const ms = dayToMs(p.day)
      if (ms < startMs) priorWeight = p.weight
      else if (ms <= endMs) dataPts.push({ day: p.day, weight: p.weight, ms })
    }

    if (dataPts.length === 0 && priorWeight == null) {
      return { startMs, endMs, label, canLeft, canRight, empty: true }
    }

    const lastKnown = dataPts.length ? dataPts[dataPts.length - 1].weight : priorWeight
    const linePts = []
    if (priorWeight != null) linePts.push({ ms: startMs, weight: priorWeight })
    for (const dp of dataPts) linePts.push({ ms: dp.ms, weight: dp.weight })
    // Доводим линию до правого края окна текущим уровнем (вес держится до «сейчас»).
    if (linePts[linePts.length - 1].ms < endMs) linePts.push({ ms: endMs, weight: lastKnown })

    const spanMs = (endMs - startMs) || 86400000
    const nx = (ms) => Math.max(0, Math.min(1, (ms - startMs) / spanMs))
    for (const lp of linePts) lp.nx = nx(lp.ms)
    for (const dp of dataPts) dp.nx = nx(dp.ms)

    // Масштаб Y включает и линию, и текущий уровень (чтобы пунктир всегда был виден).
    const ws = linePts.map(p => p.weight).concat(currentW > 0 ? [currentW] : [])
    let yMin = Math.min(...ws), yMax = Math.max(...ws)
    if (yMin === yMax) { yMin -= 1; yMax += 1 } else { const p = (yMax - yMin) * 0.15; yMin -= p; yMax += p }

    return { startMs, endMs, label, canLeft, canRight, linePts, dataPts, yMin, yMax }
  }, [points, period, offset, today, todayMs, currentW])

  const dataPts = win && !win.empty ? win.dataPts : []

  // Скраб: палец по графику → ближайшая РЕАЛЬНАЯ точка (синтетические края не в счёт).
  const W = 340, padL = 12, padR = 12, plotW = W - padL - padR
  const handleScrub = (clientX) => {
    if (!dataPts.length || !chartRef.current) return
    const r = chartRef.current.getBoundingClientRect()
    const cx = ((clientX - r.left) / r.width) * W
    const frac = Math.max(0, Math.min(1, (cx - padL) / plotW))
    let best = 0, bestD = Infinity
    for (let i = 0; i < dataPts.length; i++) {
      const d = Math.abs(dataPts[i].nx - frac)
      if (d < bestD) { bestD = d; best = i }
    }
    setScrubIdx(prev => { if (prev !== best) haptic.selection(); return best })
  }
  const endScrub = () => setScrubIdx(null)

  const scrub = scrubIdx != null ? dataPts[scrubIdx] : null
  const topWeight = scrub ? scrub.weight : currentW
  const topSub = scrub ? formatFullDate(scrub.day) : 'сейчас'

  // Крестик-закрытие под модалкой: «растущее» нажатие с отменой при уводе пальца
  // (точь-в-точь как в ExerciseActionMenu).
  const closeBtnRef = useRef(null)
  const closeArmedRef = useRef(false)
  const [closeGrow, setCloseGrow] = useState(false)
  const closeDown = () => { closeArmedRef.current = true; setCloseGrow(true) }
  const closeMove = (e) => {
    if (!closeArmedRef.current) return
    const r = closeBtnRef.current?.getBoundingClientRect()
    if (!r) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) { closeArmedRef.current = false; setCloseGrow(false) }
  }
  const closeUp = () => {
    const armed = closeArmedRef.current
    closeArmedRef.current = false
    setCloseGrow(false)
    if (armed) onClose()
  }
  const closeCancel = () => { closeArmedRef.current = false; setCloseGrow(false) }

  return (
    <div style={styles.overlay} onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.eyebrow}>ПРОГРЕСС ВЕСА</span>
          <div style={styles.name}>{exerciseName}</div>
          <div style={styles.bigRow}>
            <span style={{ ...styles.bigValue, color: line }}>
              {fmtKg(topWeight)}<span style={styles.bigUnit}>кг</span>
            </span>
            <span style={{ ...styles.bigSub, color: scrub ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
              {topSub}
            </span>
          </div>
        </div>

        {/* Переключатель периода */}
        <div style={styles.segGroup}>
          {PERIODS.map((p, i) => {
            const on = p.id === period
            return (
              <button
                key={p.id}
                className="press-tile"
                onClick={() => { if (p.id !== period) { haptic.selection(); setPeriod(p.id) } }}
                style={{
                  ...styles.segItem,
                  ...(on ? styles.segItemActive : {}),
                  marginLeft: i === 0 ? 0 : '-5px',
                  zIndex: on ? 2 : 1,
                  color: on ? 'var(--color-primary)' : 'var(--color-text-inactive)'
                }}
              >{p.label}</button>
            )
          })}
        </div>

        {/* Строка периода + листание (для Месяц/Год) */}
        <div style={styles.navRow}>
          {period !== 'all' ? (
            <button
              onClick={() => { if (win?.canLeft) { haptic.selection(); setOffset(o => o - 1) } }}
              disabled={!win?.canLeft}
              style={{ ...styles.navArrow, opacity: win?.canLeft ? 1 : 0.25 }}
              aria-label="Раньше"
            >‹</button>
          ) : <span style={styles.navSpacer} />}
          <span style={styles.navLabel}>{win?.label || ''}</span>
          {period !== 'all' ? (
            <button
              onClick={() => { if (win?.canRight) { haptic.selection(); setOffset(o => o + 1) } }}
              disabled={!win?.canRight}
              style={{ ...styles.navArrow, opacity: win?.canRight ? 1 : 0.25 }}
              aria-label="Позже"
            >›</button>
          ) : <span style={styles.navSpacer} />}
        </div>

        {/* График */}
        <div
          ref={chartRef}
          style={styles.chartWrap}
          onPointerDown={(e) => { e.preventDefault(); handleScrub(e.clientX) }}
          onPointerMove={(e) => { if (scrubIdx != null || e.buttons) handleScrub(e.clientX) }}
          onPointerUp={endScrub}
          onPointerLeave={endScrub}
          onPointerCancel={endScrub}
        >
          {points === null ? (
            <div style={styles.skeleton} />
          ) : points.length === 0 ? (
            <Empty text={'Пока нет данных.\nПоставь рабочий вес — и точка появится здесь.'} />
          ) : win.empty ? (
            <Empty text={'Нет записей за этот период.\nПролистай стрелками к другому.'} />
          ) : (
            <Chart win={win} currentW={currentW} line={line} scrub={scrub} />
          )}
        </div>

      </div>

      {/* Крестик-закрытие ПОД модалкой по центру — как в меню упражнения. */}
      <button
        ref={closeBtnRef}
        onPointerDown={closeDown}
        onPointerMove={closeMove}
        onPointerUp={closeUp}
        onPointerCancel={closeCancel}
        onClick={(e) => e.stopPropagation()}
        style={{ ...styles.closeBtn, touchAction: 'none' }}
        aria-label="Закрыть"
      >
        <span style={{
          ...styles.closeBtnInner,
          transform: closeGrow ? 'scale(1.14)' : 'scale(1)',
          transition: 'transform 0.16s var(--ease-ios)'
        }}>
          <CrossIcon size={20} />
        </span>
      </button>
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

function Chart({ win, currentW, line, scrub }) {
  const W = 340, H = 190
  const padL = 12, padR = 12, padT = 18, padB = 16
  const plotW = W - padL - padR, plotH = H - padT - padB
  const { linePts, yMin, yMax } = win

  const xOf = (nx) => padL + nx * plotW
  const yOf = (w) => padT + (1 - (w - yMin) / (yMax - yMin)) * plotH

  const path = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.nx).toFixed(1)},${yOf(p.weight).toFixed(1)}`).join(' ')
  const last = linePts[linePts.length - 1]
  const curY = yOf(currentW)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'none' }} preserveAspectRatio="xMidYMid meet">
      {/* Пунктир текущего уровня («сейчас») через весь график */}
      {currentW > 0 && (
        <>
          <line x1={padL} y1={curY} x2={W - padR} y2={curY} stroke={line} strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
          <text x={W - padR} y={curY - 5} textAnchor="end" style={styles.svgNowLabel} fill={line}>сейчас</text>
        </>
      )}

      {/* Линия веса */}
      <path d={path} fill="none" stroke={line} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Маркер «сейчас» на правом крае */}
      <circle cx={xOf(last.nx)} cy={yOf(last.weight)} r="4" fill={line} />

      {/* Скраб-курсор */}
      {scrub && (
        <>
          <line x1={xOf(scrub.nx)} y1={padT - 6} x2={xOf(scrub.nx)} y2={padT + plotH + 4} stroke="var(--color-text-secondary)" strokeWidth="1" opacity="0.6" />
          <circle cx={xOf(scrub.nx)} cy={yOf(scrub.weight)} r="5.5" fill="var(--color-bg)" stroke={line} strokeWidth="2.5" />
        </>
      )}
    </svg>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 10000,
    padding: 'calc(env(safe-area-inset-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 20px)',
    overflowY: 'auto',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  panel: {
    position: 'relative', width: '100%', maxWidth: '380px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '28px',
    padding: '22px 18px 18px',
    display: 'flex', flexDirection: 'column', gap: '14px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  header: { display: 'flex', flexDirection: 'column', gap: '4px' },
  eyebrow: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '11px', letterSpacing: '2px', color: 'var(--color-text-secondary)' },
  name: { fontFamily: 'var(--font-geist, var(--font-manrope))', fontSize: '16px', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.25 },
  bigRow: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginTop: '2px', minHeight: '34px' },
  bigValue: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '30px', lineHeight: 1, letterSpacing: '0.5px' },
  bigUnit: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, marginLeft: '4px', opacity: 0.7 },
  bigSub: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600 },

  segGroup: {
    display: 'flex', alignItems: 'center', gap: 0, padding: '4px',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)', WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
  },
  segItem: {
    position: 'relative', flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '30px', padding: '0 10px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '13px',
    cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  segItemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  },

  navRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '22px' },
  navArrow: {
    width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: '22px', lineHeight: 1, color: 'var(--color-text)', WebkitTapHighlightColor: 'transparent'
  },
  navSpacer: { width: '30px', height: '30px' },
  navLabel: { flex: 1, textAlign: 'center', fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-secondary)' },

  chartWrap: {
    width: '100%',
    background: 'rgba(0, 0, 0, 0.22)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '8px', minHeight: '150px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'none'
  },
  skeleton: { width: '100%', height: '160px', borderRadius: 'var(--radius-small)', background: 'rgba(255, 255, 255, 0.04)' },
  empty: { fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.6, padding: '30px 12px' },
  emptyIcon: { fontSize: '30px', display: 'block', marginBottom: '10px', opacity: 0.8 },

  svgNowLabel: { fontFamily: 'var(--font-manrope)', fontSize: '9px', fontWeight: 700, opacity: 0.8 },

  // Крестик-закрытие под модалкой по центру — «пузырёк» как в ExerciseActionMenu.
  closeBtn: {
    flexShrink: 0, marginTop: '14px', width: '56px', height: '56px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  closeBtnInner: {
    width: '46px', height: '46px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.08)', borderRadius: '50%',
    color: 'var(--color-text-secondary)'
  }
}
