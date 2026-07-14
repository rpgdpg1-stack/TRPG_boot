import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import UiIcon from './UiIcon'
import { getMuscleGroupColors } from '../features/programs/colors'
import {
  MONTHS_RU, WEEKDAYS_RU, HISTORY_FETCH_LIMIT,
  mskParts, mskDayKey, formatTimeMsk,
  workoutCategoryMeta, describeWorkout, getDayMuscleTags,
  workoutMinutes, formatDuration
} from '../utils/history'

// Вся история (ничего не обрезаем по времени) — листаем календарь до самой первой
// тренировки. Тянем с большим запасом (см. HISTORY_FETCH_LIMIT).

// Короткие месяцы для год-режима (сетка 12 плиток).
const MONTHS_SHORT_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

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
      <UiIcon name={iconName} size={icon} color="#FFFFFF" />
    </span>
  )
}

/**
 * История тренировок в виде месячного календаря. Карточка с сеткой-квадратами:
 * каждый день — бейдж выполненной тренировки (без букв/цифр). Сверху — сводка по
 * разделам бейджами. Свайп/стрелки листают месяцы (только текущий + предыдущий).
 * Тап по дню — попап с деталями (программа, день, длительность/метры, время).
 * heading — если задан, сверху секция-заголовок + «Все ›» на /history.
 */
export default function HistoryCalendar({ heading, mode = 'month', onViewChange, onMonthPick, onYearPick, initialView }) {
  const cached = getRecentWorkoutsSync(HISTORY_FETCH_LIMIT)
  const [workouts, setWorkouts] = useState(cached || [])
  // Стартовый месяц — из initialView (общий вид с /history и главной), иначе текущий.
  const [offset, setOffset] = useState(() => {
    if (initialView && Number.isFinite(initialView.year) && Number.isFinite(initialView.month)) {
      const p = mskParts(new Date().toISOString())
      return (initialView.year * 12 + initialView.month) - (p.y * 12 + p.m)
    }
    return 0
  })
  const [dayModal, setDayModal] = useState(null)
  const isYear = mode === 'year'
  const isWeek = mode === 'week'
  const isAll = mode === 'all'
  const isMonth = !isYear && !isWeek && !isAll

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getRecentWorkouts(HISTORY_FETCH_LIMIT).then(data => { if (!cancelled) setWorkouts(data || []) })
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

  // Докуда можно листать назад: до первого месяца с тренировкой (вся история).
  const todayYM = today.y * 12 + today.m
  const minOffset = earliestYM === null ? 0 : earliestYM - todayYM
  const earliestYear = earliestYM === null ? today.y : Math.floor(earliestYM / 12)

  const dayKeyOf = (d) => `${viewY}-${String(viewM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  // Сообщаем наверх открытый месяц/год (для пересчёта статистики на /history).
  useEffect(() => { onViewChange?.({ year: viewY, month: viewM }) }, [viewY, viewM, onViewChange])

  // Год-режим: сколько тренировок в каждом месяце текущего года (для плиток).
  const yearCounts = useMemo(() => {
    const c = {}
    for (const w of workouts) {
      if (!w.finished_at) continue
      const p = mskParts(w.finished_at)
      if (p.y === viewY) c[p.m] = (c[p.m] || 0) + 1
    }
    return c
  }, [workouts, viewY])

  // Листание: только месяц (по месяцам) и год (по годам). Неделя/Всё — без листания.
  const canPrev = isMonth ? offset > minOffset : isYear ? viewY > earliestYear : false
  const canNext = isMonth ? offset < 0 : isYear ? viewY < today.y : false
  const goPrev = () => { if (!canPrev) return; setOffset(offset - (isYear ? 12 : 1)); haptic.selection() }
  const goNext = () => { if (!canNext) return; setOffset(offset + (isYear ? 12 : 1)); haptic.selection() }

  // Дни текущей недели (Пн–Вс, Москва) — для режима «Неделя» (одна строка).
  const weekDays = useMemo(() => {
    const dow = (new Date(Date.UTC(today.y, today.m, today.d)).getUTCDay() + 6) % 7
    const mondayMs = Date.UTC(today.y, today.m, today.d - dow)
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(mondayMs + i * 86400000)
      const y = dt.getUTCFullYear(); const m = dt.getUTCMonth(); const d = dt.getUTCDate()
      return {
        key: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        d,
        isToday: y === today.y && m === today.m && d === today.d
      }
    })
  }, [today.y, today.m, today.d])

  // Годы с тренировками — для режима «Всё время» (плитки годов).
  const yearsList = useMemo(() => {
    const c = {}
    for (const w of workouts) {
      if (!w.finished_at) continue
      const y = mskParts(w.finished_at).y
      c[y] = (c[y] || 0) + 1
    }
    return Object.keys(c).map(Number).sort((a, b) => a - b).map(y => ({ year: y, count: c[y] }))
  }, [workouts])

  // Тап по месяцу в год-режиме (только где есть тренировки) → открыть этот месяц.
  const pickMonth = (m) => {
    if (!yearCounts[m]) return
    haptic.light()
    setOffset((viewY * 12 + m) - (today.y * 12 + today.m))
    onMonthPick?.(viewY, m)
  }

  // Тап по году в режиме «Всё время» → открыть этот год.
  const pickYear = (y) => {
    haptic.light()
    setOffset((y - today.y) * 12)
    onYearPick?.(y)
  }

  let touch = null
  const onTouchStart = (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e) => {
    if (!touch) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.x
    const dy = t.clientY - touch.y
    touch = null
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return
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

  // Одна ячейка-день (общая для месяца и недели): число + бейджи тренировок.
  const renderDay = (key, dayNum, isToday) => {
    const list = byDay[key] || []
    const has = list.length > 0
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
        }}>{dayNum}</span>
        {has && (
          <span style={styles.marks}>
            {list.length <= 2
              ? list.map((w, wi) => {
                  const b = badgeFor(w)
                  return <Badge key={wi} iconName={b.iconName} color={b.color} size={18} icon={11} />
                })
              : list.map((w, wi) => {
                  const b = badgeFor(w)
                  return <span key={wi} style={{ width: '8px', height: '8px', borderRadius: '2px', background: b.color }} />
                })}
          </span>
        )}
      </button>
    )
  }

  const showChev = isMonth || isYear
  const titleText = isAll ? 'Всё время' : isYear ? String(viewY) : isWeek ? 'Эта неделя' : `${MONTHS_RU[viewM]} ${viewY}`

  return (
    <div style={styles.wrap}>
      {heading && (
        <div style={styles.headingRow}>
          <span style={styles.heading}>{heading}</span>
        </div>
      )}

      {/* Свайп по ВСЕЙ карточке (заголовок/сводка/сетка) — листает месяцы. */}
      <div style={styles.card} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div style={styles.monthNav}>
          {showChev ? (
            <button
              style={{ ...styles.chev, opacity: canPrev ? 1 : 0.25 }}
              className="press-tile" onClick={goPrev} disabled={!canPrev}
              aria-label={isYear ? 'Предыдущий год' : 'Предыдущий месяц'}
            >‹</button>
          ) : <span style={styles.chevSpacer} />}
          <div style={styles.monthTitle}>{titleText}</div>
          {showChev ? (
            <button
              style={{ ...styles.chev, opacity: canNext ? 1 : 0.25 }}
              className="press-tile" onClick={goNext} disabled={!canNext}
              aria-label={isYear ? 'Следующий год' : 'Следующий месяц'}
            >›</button>
          ) : <span style={styles.chevSpacer} />}
        </div>

        {isAll ? (
          // Всё время — плитки годов; тап по году → режим «Год».
          yearsList.length === 0 ? (
            <div style={styles.summary}><span style={styles.summaryEmpty}>Нет тренировок</span></div>
          ) : (
            <div key="all" className="page-fade" style={styles.yearGrid}>
              {yearsList.map(({ year, count }) => {
                const isCur = year === today.y
                return (
                  <button
                    key={year}
                    className="press-tile"
                    onClick={() => pickYear(year)}
                    style={{
                      ...styles.monthTile,
                      background: 'var(--surface-raised)',
                      boxShadow: isCur ? 'inset 0 0 0 2px var(--color-primary)' : 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ ...styles.monthTileLabel, color: 'var(--color-text)', fontWeight: isCur ? 800 : 700 }}>{year}</span>
                    <span style={styles.monthTileCount}>{count}</span>
                  </button>
                )
              })}
            </div>
          )
        ) : isYear ? (
          <div key={`y${viewY}`} className="page-fade" style={styles.yearGrid}>
            {MONTHS_SHORT_RU.map((label, m) => {
              const cnt = yearCounts[m] || 0
              const has = cnt > 0
              const isCur = viewY === today.y && m === today.m
              return (
                <button
                  key={m}
                  className={has ? 'press-tile' : undefined}
                  onClick={() => pickMonth(m)}
                  disabled={!has}
                  style={{
                    ...styles.monthTile,
                    background: has ? 'var(--surface-raised)' : 'transparent',
                    boxShadow: isCur ? 'inset 0 0 0 2px var(--color-primary)' : 'none',
                    cursor: has ? 'pointer' : 'default'
                  }}
                >
                  <span style={{
                    ...styles.monthTileLabel,
                    color: has ? 'var(--color-text)' : 'rgba(255,255,255,0.4)',
                    fontWeight: isCur ? 800 : (has ? 700 : 500)
                  }}>{label}</span>
                  {has && <span style={styles.monthTileCount}>{cnt}</span>}
                </button>
              )
            })}
          </div>
        ) : isWeek ? (
          // Неделя — одна строка Пн–Вс текущей недели (без месячной сетки/листания).
          <div key="week" className="page-fade">
            <div style={styles.weekRow}>
              {WEEKDAYS_RU.map((w, i) => (
                <div key={w} style={{ ...styles.weekLabel, color: i >= 5 ? 'var(--color-text-secondary)' : 'rgba(255,255,255,0.35)' }}>{w}</div>
              ))}
            </div>
            <div style={styles.weekDivider} aria-hidden="true" />
            <div style={styles.grid}>
              {weekDays.map(wd => renderDay(wd.key, wd.d, wd.isToday))}
            </div>
          </div>
        ) : (
        <>
        {/* Сводка по разделам переехала в блок статистики выше (HistoryStats) —
            в календаре её не дублируем. */}
        <div>
          <div style={styles.weekRow}>
            {WEEKDAYS_RU.map((w, i) => (
              <div key={w} style={{ ...styles.weekLabel, color: i >= 5 ? 'var(--color-text-secondary)' : 'rgba(255,255,255,0.35)' }}>{w}</div>
            ))}
          </div>
          <div style={styles.weekDivider} aria-hidden="true" />

          <div key={offset} className="page-fade" style={styles.grid}>
            {cells.map((d, i) => (
              d === null
                ? <div key={`b${i}`} style={styles.cellEmpty} />
                : renderDay(dayKeyOf(d), d, offset === 0 && d === today.d)
            ))}
          </div>
        </div>
        </>
        )}
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
            // Длительность (мин) — из started_at/finished_at, и для силовой, и для
            // заплыва (у заплыва started_at синтетический, см. finishWorkout).
            const minutes = workoutMinutes(w)
            const metaParts = []
            if (minutes > 0) metaParts.push(<span key="min">{formatDuration(minutes)}</span>)
            if (w.distance_m) metaParts.push(<span key="dist" style={{ color: 'var(--cat-pool)', fontWeight: 700 }}>{w.distance_m} м</span>)
            metaParts.push(<span key="time">{formatTimeMsk(w.finished_at)}</span>)
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
                  <div style={dstyles.itemMeta}>
                    {metaParts.map((p, mi) => (
                      <span key={mi}>{mi > 0 && <span style={{ opacity: 0.5 }}> · </span>}{p}</span>
                    ))}
                  </div>
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
  // Заглушка на месте шеврона (неделя/всё — без листания), чтобы заголовок был по центру.
  chevSpacer: { width: '40px', height: '40px', flexShrink: 0 },
  monthTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '19px',
    color: 'var(--color-text)', letterSpacing: '0.5px'
  },
  summary: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px',
    minHeight: '24px', marginBottom: '16px'
  },
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
  marks: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' },

  // Год-режим: 12 месяцев сеткой 4×3, минималистично.
  yearGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' },
  monthTile: {
    position: 'relative', aspectRatio: '1 / 0.82', borderRadius: 'var(--radius-medium)',
    border: 'none', padding: '4px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '3px', overflow: 'hidden'
  },
  monthTileLabel: { fontFamily: 'var(--font-display)', fontSize: '13px', lineHeight: 1, letterSpacing: '0.3px' },
  monthTileCount: {
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 700,
    color: 'var(--color-primary)', lineHeight: 1
  }
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
