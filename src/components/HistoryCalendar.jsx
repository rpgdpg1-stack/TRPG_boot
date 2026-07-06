import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import UiIcon from './UiIcon'
import { getMuscleGroupColors } from '../features/programs/colors'
import {
  MONTHS_RU, WEEKDAYS_RU, CATEGORY_ORDER,
  mskParts, mskDayKey, formatTimeMsk,
  workoutCategoryMeta, describeWorkout, getDayMuscleTags
} from '../utils/history'

const HISTORY_LIMIT = 500 // с запасом на катящийся год истории
const MAX_MONTHS_BACK = 11 // катящееся окно: текущий месяц + до 11 назад (год)

// Акцентный цвет силового дня = цвет первой группы мышц (как на карточках/в шапке).
function strengthAccent(workout) {
  const key = getDayMuscleTags(workout.program_id, workout.day)[0]?.key
  return key ? getMuscleGroupColors(key).accent : 'var(--color-primary)'
}

// Бейдж раздела на конкретную тренировку: чёрная иконка на цветном прямоугольнике.
// Цвет = цвет РАЗДЕЛА (силовая — зелёный, как заголовки), НЕ группы мышц. Акцент
// группы остаётся только для буквы дня в попапе.
function badgeFor(workout) {
  const meta = workoutCategoryMeta(workout)
  return { iconName: meta.iconName, color: meta.color }
}

// Прямоугольный бейдж с чёрной иконкой (единый вид: ячейка, сводка, попап).
function Badge({ iconName, color, size = 20, icon = 12 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '6px', background: color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <UiIcon name={iconName} size={icon} color="#0D0C0C" />
    </span>
  )
}

// Метаданные раздела по ключу (для сводки — без конкретной тренировки).
function metaForKey(key) {
  switch (key) {
    case 'pool': return { key, iconName: 'swimming', color: 'var(--cat-pool)' }
    case 'cardio': return { key, iconName: 'cardio', color: 'var(--cat-cardio)' }
    case 'stretch': return { key, iconName: 'stretching', color: 'var(--cat-stretch)' }
    default: return { key: 'strength', iconName: 'power', color: 'var(--color-primary)' }
  }
}

/**
 * История тренировок в виде месячного календаря. Карточка с сеткой-квадратами:
 * каждый день — бейдж выполненной тренировки (без букв/цифр). Сверху — сводка по
 * разделам бейджами. Свайп/стрелки листают месяцы (только текущий + предыдущий).
 * Тап по дню — попап с деталями (программа, день, длительность/метры, время).
 * heading — если задан, сверху секция-заголовок + «Все ›» на /history.
 */
export default function HistoryCalendar({ heading }) {
  const cached = getRecentWorkoutsSync(HISTORY_LIMIT)
  const [workouts, setWorkouts] = useState(cached || [])
  const [offset, setOffset] = useState(0)
  const [dayModal, setDayModal] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getRecentWorkouts(HISTORY_LIMIT).then(data => { if (!cancelled) setWorkouts(data || []) })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  const byDay = useMemo(() => {
    const map = {}
    for (const w of workouts) {
      if (!w.finished_at) continue
      ;(map[mskDayKey(w.finished_at)] ||= []).push(w)
    }
    return map
  }, [workouts])

  // Самый ранний месяц с тренировкой (в «год*12+месяц») — нижняя граница листания.
  const earliestYM = useMemo(() => {
    let min = null
    for (const w of workouts) {
      if (!w.finished_at) continue
      const p = mskParts(w.finished_at)
      const ym = p.y * 12 + p.m
      if (min === null || ym < min) min = ym
    }
    return min
  }, [workouts])

  const today = mskParts(new Date().toISOString())
  const base = new Date(Date.UTC(today.y, today.m + offset, 1))
  const viewY = base.getUTCFullYear()
  const viewM = base.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate()
  const firstDow = (new Date(Date.UTC(viewY, viewM, 1)).getUTCDay() + 6) % 7

  // Докуда можно листать назад: до первого месяца с тренировкой, но не глубже года.
  const todayYM = today.y * 12 + today.m
  const minOffset = earliestYM === null ? 0 : Math.max(-MAX_MONTHS_BACK, earliestYM - todayYM)

  const dayKeyOf = (d) => `${viewY}-${String(viewM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const summary = useMemo(() => {
    const counts = {}
    for (let d = 1; d <= daysInMonth; d++) {
      for (const w of byDay[dayKeyOf(d)] || []) {
        const k = workoutCategoryMeta(w).key
        counts[k] = (counts[k] || 0) + 1
      }
    }
    return CATEGORY_ORDER.filter(k => counts[k]).map(k => ({ ...metaForKey(k), count: counts[k] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay, viewY, viewM, daysInMonth])

  const totalMonth = summary.reduce((s, c) => s + c.count, 0)

  const goPrev = () => { if (offset > minOffset) { setOffset(offset - 1); haptic.selection() } }
  const goNext = () => { if (offset < 0) { setOffset(offset + 1); haptic.selection() } }

  let touch = null
  const onTouchStart = (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e) => {
    if (!touch) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.x
    const dy = t.clientY - touch.y
    touch = null
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) goPrev(); else goNext()
  }

  const openDay = (key) => {
    const list = byDay[key]
    if (!list || list.length === 0) return
    haptic.light()
    setDayModal({ key, workouts: list })
  }

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={styles.wrap}>
      {heading && (
        <div style={styles.headingRow}>
          <span style={styles.heading}>{heading}</span>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.monthNav}>
          <button
            style={{ ...styles.chev, opacity: offset > minOffset ? 1 : 0.25 }}
            className="press-tile" onClick={goPrev} disabled={offset <= minOffset}
            aria-label="Предыдущий месяц"
          >‹</button>
          <div style={styles.monthTitle}>{MONTHS_RU[viewM]} {viewY}</div>
          <button
            style={{ ...styles.chev, opacity: offset < 0 ? 1 : 0.25 }}
            className="press-tile" onClick={goNext} disabled={offset >= 0}
            aria-label="Следующий месяц"
          >›</button>
        </div>

        <div style={styles.summary}>
          {totalMonth === 0 ? (
            <span style={styles.summaryEmpty}>Нет тренировок в этом месяце</span>
          ) : (
            summary.map(s => (
              <span key={s.key} style={styles.summaryChip}>
                <Badge iconName={s.iconName} color={s.color} size={22} icon={13} />
                <span style={{ ...styles.summaryCount, color: s.color }}>{s.count}</span>
              </span>
            ))
          )}
        </div>

        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div style={styles.weekRow}>
            {WEEKDAYS_RU.map((w, i) => (
              <div key={w} style={{ ...styles.weekLabel, color: i >= 5 ? 'var(--color-text-secondary)' : 'rgba(255,255,255,0.35)' }}>{w}</div>
            ))}
          </div>
          <div style={styles.weekDivider} aria-hidden="true" />

          <div key={offset} className="page-fade" style={styles.grid}>
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} style={styles.cellEmpty} />
              const key = dayKeyOf(d)
              const list = byDay[key] || []
              const has = list.length > 0
              const isToday = offset === 0 && d === today.d
              return (
                <button
                  key={key}
                  className={has ? 'press-tile' : undefined}
                  onClick={() => openDay(key)}
                  style={{
                    ...styles.cell,
                    background: has ? 'var(--surface-raised)' : 'transparent',
                    boxShadow: isToday ? 'inset 0 0 0 2px var(--color-primary)' : 'none',
                    cursor: has ? 'pointer' : 'default'
                  }}
                >
                  <span style={{
                    ...styles.cellNum,
                    color: has ? 'var(--color-text)' : 'rgba(255,255,255,0.4)',
                    fontWeight: isToday ? 800 : (has ? 700 : 500)
                  }}>{d}</span>
                  {has && (
                    <span style={styles.marks}>
                      {list.length <= 2
                        ? list.map((w, wi) => {
                            const b = badgeFor(w)
                            return <Badge key={wi} iconName={b.iconName} color={b.color} size={18} icon={11} />
                          })
                        : list.map((w, wi) => {
                            const b = badgeFor(w)
                            // 3+ тренировок в день — крошечные квадратики без иконок,
                            // подробности в попапе по тапу.
                            return <span key={wi} style={{ width: '8px', height: '8px', borderRadius: '2px', background: b.color }} />
                          })}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {dayModal && <DayDetail data={dayModal} onClose={() => setDayModal(null)} />}
    </div>
  )
}

function DayDetail({ data, onClose }) {
  const { key, workouts } = data
  const [y, m, d] = key.split('-').map(Number)
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  const dateLabel = `${d} ${MONTHS_RU[m - 1].toLowerCase()}, ${WEEKDAYS_RU[dow]}`

  return createPortal(
    <div style={dstyles.overlay} onClick={onClose}>
      <div style={dstyles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={dstyles.date}>{dateLabel}</div>
        <div style={dstyles.list}>
          {workouts.map((w, i) => {
            const { title } = describeWorkout(w)
            const b = badgeFor(w)
            const meta = workoutCategoryMeta(w)
            const letter = meta.key === 'strength' ? w.day : null
            // Длительность (мин) для силовой — из started_at/finished_at.
            let minutes = null
            if (meta.key === 'strength' && w.started_at && w.finished_at) {
              const diff = Math.round((new Date(w.finished_at) - new Date(w.started_at)) / 60000)
              if (diff >= 1) minutes = diff
            }
            const metaParts = []
            if (minutes != null) metaParts.push(`${minutes} мин`)
            if (w.distance_m) metaParts.push(`${w.distance_m} м`)
            metaParts.push(formatTimeMsk(w.finished_at))
            return (
              <div key={i} style={dstyles.item}>
                <Badge iconName={b.iconName} color={b.color} size={30} icon={16} />
                <div style={dstyles.itemText}>
                  <div style={dstyles.itemTitle}>
                    {title}
                    {letter && (
                      <>
                        <span style={dstyles.sep}> · День </span>
                        <span style={{ color: strengthAccent(w), fontWeight: 800 }}>{letter}</span>
                      </>
                    )}
                  </div>
                  <div style={dstyles.itemMeta}>{metaParts.join(' · ')}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}

const styles = {
  wrap: {},
  headingRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '12px'
  },
  heading: {
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '15px',
    color: 'rgba(255,255,255,0.6)', letterSpacing: '0.2px'
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '16px'
  },
  monthNav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '12px'
  },
  chev: {
    width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: 'var(--color-text)',
    fontSize: '24px', lineHeight: 1, fontFamily: 'var(--font-manrope)', padding: 0
  },
  monthTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '19px',
    color: 'var(--color-text)', letterSpacing: '0.5px'
  },
  summary: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px',
    minHeight: '24px', marginBottom: '16px'
  },
  summaryChip: { display: 'inline-flex', alignItems: 'center', gap: '6px' },
  summaryCount: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' },
  summaryEmpty: { fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' },
  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '6px' },
  weekLabel: { textAlign: 'center', fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px' },
  weekDivider: { height: '1px', background: 'var(--border-hairline)', margin: '0 2px 8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' },
  cellEmpty: { aspectRatio: '1 / 1' },
  cell: {
    position: 'relative', aspectRatio: '1 / 1', borderRadius: 'var(--radius-medium)',
    border: 'none', padding: '5px 4px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'flex-start', gap: '3px', overflow: 'hidden'
  },
  cellNum: { fontFamily: 'var(--font-display)', fontSize: '15px', lineHeight: 1 },
  marks: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }
}

const dstyles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(13,12,12,0.85)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 200
  },
  panel: {
    width: '100%', maxWidth: '340px', background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)', padding: '20px'
  },
  date: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '17px',
    color: 'var(--color-text)', marginBottom: '14px', textTransform: 'capitalize'
  },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  item: { display: 'flex', alignItems: 'center', gap: '12px' },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text)' },
  sep: { color: 'var(--color-text-secondary)', fontWeight: 500 },
  itemMeta: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }
}
