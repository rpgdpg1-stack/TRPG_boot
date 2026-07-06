import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import {
  MONTHS_RU, WEEKDAYS_RU, CATEGORY_ORDER,
  mskParts, mskDayKey, formatTimeMsk,
  workoutCategoryMeta, describeWorkout, getDayMuscleTags
} from '../utils/history'

const HISTORY_LIMIT = 100
// Сколько месяцев назад можно листать (0 = текущий, -1 = предыдущий).
const MIN_OFFSET = -1

// Цвет буквы силового дня = цвет первой группы мышц (как на карточках/в шапке дня).
function strengthChipColor(workout) {
  const tags = getDayMuscleTags(workout.program_id, workout.day)
  return tags[0]?.color || 'var(--color-primary)'
}

/**
 * История тренировок в виде месячного календаря.
 * Каждый день — квадрат: дата + метка выполненной тренировки (буква A/Б/В для
 * силовой, иконка для плавания). Сверху — сводка по разделам за месяц. Свайп/
 * стрелки листают месяцы (только текущий + предыдущий). Тап по дню — детали.
 */
export default function History() {
  const navigate = useNavigate()
  const cached = getRecentWorkoutsSync(HISTORY_LIMIT)
  const [workouts, setWorkouts] = useState(cached || [])
  const [loading, setLoading] = useState(cached == null)
  const [offset, setOffset] = useState(0) // 0 = текущий месяц, -1 = предыдущий
  const [dayModal, setDayModal] = useState(null) // { key, workouts } или null

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getRecentWorkouts(HISTORY_LIMIT).then(data => {
        if (!cancelled) { setWorkouts(data || []); setLoading(false) }
      })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  // Группируем тренировки по дню (МСК): { "2026-07-06": [w, w], ... }
  const byDay = useMemo(() => {
    const map = {}
    for (const w of workouts) {
      if (!w.finished_at) continue
      const key = mskDayKey(w.finished_at)
      ;(map[key] ||= []).push(w)
    }
    return map
  }, [workouts])

  // Сегодня по Москве + просматриваемый месяц.
  const today = mskParts(new Date().toISOString())
  const base = new Date(Date.UTC(today.y, today.m + offset, 1))
  const viewY = base.getUTCFullYear()
  const viewM = base.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate()
  const firstDow = (new Date(Date.UTC(viewY, viewM, 1)).getUTCDay() + 6) % 7 // Пн=0

  // Сводка за месяц по разделам.
  const summary = useMemo(() => {
    const counts = {}
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewY}-${String(viewM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      for (const w of byDay[key] || []) {
        const meta = workoutCategoryMeta(w)
        counts[meta.key] = (counts[meta.key] || 0) + 1
      }
    }
    return CATEGORY_ORDER
      .filter(k => counts[k])
      .map(k => ({ ...metaForKey(k), count: counts[k] }))
  }, [byDay, viewY, viewM, daysInMonth])

  const totalMonth = summary.reduce((s, c) => s + c.count, 0)

  const goPrev = () => { if (offset > MIN_OFFSET) { setOffset(offset - 1); haptic.selection() } }
  const goNext = () => { if (offset < 0) { setOffset(offset + 1); haptic.selection() } }

  // Свайп по месяцам.
  let touch = null
  const onTouchStart = (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e) => {
    if (!touch) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.x
    const dy = t.clientY - touch.y
    touch = null
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) goPrev()   // свайп вправо → в прошлое
    else goNext()          // свайп влево → в настоящее
  }

  const openDay = (key) => {
    const list = byDay[key]
    if (!list || list.length === 0) return
    haptic.light()
    setDayModal({ key, workouts: list })
  }

  // Ячейки: ведущие пустышки под первый день недели + дни месяца.
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>История</ScreenTitle>

      {/* Заголовок месяца + навигация */}
      <div style={styles.monthNav}>
        <button
          style={{ ...styles.chev, opacity: offset > MIN_OFFSET ? 1 : 0.25 }}
          className="press-tile"
          onClick={goPrev}
          disabled={offset <= MIN_OFFSET}
          aria-label="Предыдущий месяц"
        >‹</button>
        <div style={styles.monthTitleWrap}>
          <div style={styles.monthTitle}>{MONTHS_RU[viewM]} {viewY}</div>
        </div>
        <button
          style={{ ...styles.chev, opacity: offset < 0 ? 1 : 0.25 }}
          className="press-tile"
          onClick={goNext}
          disabled={offset >= 0}
          aria-label="Следующий месяц"
        >›</button>
      </div>

      {/* Сводка по разделам */}
      <div style={styles.summary}>
        {totalMonth === 0 ? (
          <span style={styles.summaryEmpty}>Нет тренировок в этом месяце</span>
        ) : (
          summary.map(s => (
            <span key={s.key} style={styles.summaryChip}>
              <UiIcon name={s.iconName} size={15} color={s.color} />
              <span style={{ ...styles.summaryCount, color: s.color }}>{s.count}</span>
            </span>
          ))
        )}
      </div>

      {/* Сетка календаря */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div style={styles.weekRow}>
          {WEEKDAYS_RU.map((w, i) => (
            <div key={w} style={{ ...styles.weekLabel, color: i >= 5 ? 'var(--color-text-secondary)' : 'rgba(255,255,255,0.35)' }}>{w}</div>
          ))}
        </div>

        <div key={offset} className="page-fade" style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <div key={`b${i}`} style={styles.cellEmpty} />
            const key = `${viewY}-${String(viewM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
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
                  background: has ? 'var(--surface)' : 'transparent',
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
                    {list.slice(0, 2).map((w, wi) => {
                      const meta = workoutCategoryMeta(w)
                      if (meta.key === 'strength') {
                        return (
                          <span key={wi} style={{ ...styles.mark, background: strengthChipColor(w) }}>
                            {w.day || '•'}
                          </span>
                        )
                      }
                      return (
                        <span key={wi} style={{ ...styles.markIcon, background: meta.color }}>
                          <UiIcon name={meta.iconName} size={11} color="#0D0C0C" />
                        </span>
                      )
                    })}
                    {list.length > 2 && <span style={styles.markMore}>+{list.length - 2}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {loading && workouts.length === 0 && (
        <div style={styles.loading}>Загрузка…</div>
      )}

      {dayModal && (
        <DayDetail data={dayModal} onClose={() => setDayModal(null)} />
      )}
    </div>
  )
}

// Метаданные раздела по ключу (для сводки — без конкретной тренировки).
function metaForKey(key) {
  switch (key) {
    case 'pool': return { key, iconName: 'swimming', color: 'var(--cat-pool)', label: 'Плавание' }
    case 'cardio': return { key, iconName: 'cardio', color: 'var(--cat-cardio)', label: 'Кардио' }
    case 'stretch': return { key, iconName: 'stretching', color: 'var(--cat-stretch)', label: 'Растяжка' }
    default: return { key: 'strength', iconName: 'power', color: 'var(--color-primary)', label: 'Силовая' }
  }
}

// Попап деталей дня.
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
            const { iconName, title, variant } = describeWorkout(w)
            const meta = workoutCategoryMeta(w)
            return (
              <div key={i} style={dstyles.item}>
                <span style={dstyles.itemIcon}>
                  <UiIcon name={iconName} size={18} color={meta.color} />
                </span>
                <div style={dstyles.itemText}>
                  <div style={dstyles.itemTitle}>
                    {title}{variant ? ` · ${variant}` : ''}
                  </div>
                  <div style={dstyles.itemMeta}>{formatTimeMsk(w.finished_at)}</div>
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
  page: {},
  monthNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '14px'
  },
  chev: {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text)',
    fontSize: '26px',
    lineHeight: 1,
    fontFamily: 'var(--font-manrope)',
    padding: 0
  },
  monthTitleWrap: { flex: 1, textAlign: 'center' },
  monthTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '20px',
    color: 'var(--color-text)',
    letterSpacing: '0.5px'
  },
  summary: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '14px',
    minHeight: '24px',
    marginBottom: '18px'
  },
  summaryChip: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
  summaryCount: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px' },
  summaryEmpty: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  },
  weekRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px',
    marginBottom: '8px'
  },
  weekLabel: {
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px'
  },
  cellEmpty: { aspectRatio: '1 / 1' },
  cell: {
    position: 'relative',
    aspectRatio: '1 / 1',
    borderRadius: 'var(--radius-medium)',
    border: 'none',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    overflow: 'hidden'
  },
  cellNum: {
    fontFamily: 'var(--font-display)',
    fontSize: '16px',
    lineHeight: 1
  },
  marks: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    flexWrap: 'wrap'
  },
  mark: {
    minWidth: '17px',
    height: '17px',
    padding: '0 3px',
    borderRadius: '6px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    color: '#fff',
    lineHeight: 1
  },
  markIcon: {
    width: '17px',
    height: '17px',
    borderRadius: '6px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  markMore: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--color-text-secondary)'
  },
  loading: {
    textAlign: 'center',
    padding: '30px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  }
}

const dstyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13,12,12,0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    zIndex: 200
  },
  panel: {
    width: '100%',
    maxWidth: '340px',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '20px'
  },
  date: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '17px',
    color: 'var(--color-text)',
    marginBottom: '14px',
    textTransform: 'capitalize'
  },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  item: { display: 'flex', alignItems: 'center', gap: '12px' },
  itemIcon: {
    width: '24px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  itemMeta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    marginTop: '2px'
  }
}
