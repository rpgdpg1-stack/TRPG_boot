import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { localGet, localSet } from '../utils/storage'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { summarizeWorkouts, formatHours, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getFavoritesSync, getFavoriteExercises, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { EVENTS, on } from '../lib/events'
import PeriodSwitcher, { periodOptions } from './PeriodSwitcher'
import ClockIcon from './ClockIcon'
import UiIcon from './UiIcon'
import HeartIcon from './HeartIcon'
import TrendingUpIcon from './TrendingUpIcon'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Две карточки-входа на главной: **Статистика** (два показателя — тренировки и
 * время за выбранный период) и **Любимые**.
 *
 * Период («Неделя · Месяц · Год · Всё») по умолчанию ГОД, выбор помнится локально.
 * Активный период подписан СПРАВА в строке заголовка, а меняется ДОЛГИМ нажатием:
 * поверх карточки всплывает САМ переключатель (без второй рамки-обёртки) — по
 * центру карточки, в верхней её части. Тап мимо закрывает; короткий тап по
 * карточке ведёт на `/history`.
 */
const PERIOD_KEY = 'home-stats-period'
const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 8
export default function HomeCards() {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const navigate = useNavigate()

  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [favCount, setFavCount] = useState(() => (getFavoritesSync() || []).length)
  // Период статистики: по умолчанию год.
  const [period, setPeriod] = useState(() => localGet(PERIOD_KEY) || 'year')
  const [menuRect, setMenuRect] = useState(null)   // попап выбора периода
  const statsRef = useRef(null)
  useEffect(() => {
    let alive = true
    const load = () => {
      getRecentWorkouts(HISTORY_FETCH_LIMIT).then(d => { if (alive) setWorkouts(d || []) })
      getFavoriteExercises().then(l => { if (alive) setFavCount((l || []).length) })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { alive = false; off() }
  }, [])

  // Статистика за выбранный период + его подпись в углу карточки.
  const now = new Date()
  const sum = summarizeWorkouts(workouts, period, now)
  const periodItems = periodOptions()
  const periodLabel = periodItems.find(p => p.id === period)?.label || ''

  const go = (path) => { haptic.light(); navigate(path, { state: { from: '/' } }) }

  const pickPeriod = (id) => {
    setPeriod(id)
    localSet(PERIOD_KEY, id)
  }

  // Долгое нажатие по карточке статистики → выбор периода; короткий тап — переход.
  const longTimer = useRef(null)
  const longFired = useRef(false)
  const pressStart = useRef({ x: 0, y: 0 })
  const clearLong = () => { if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null } }
  useEffect(() => clearLong, [])

  const statsPress = {
    onPointerDown: (e) => {
      if (menuRect) return
      longFired.current = false
      pressStart.current = { x: e.clientX, y: e.clientY }
      clearLong()
      longTimer.current = setTimeout(() => {
        longFired.current = true
        haptic.medium()
        // Позиция переключателя — по ширине карточки, в её верхней части.
        const r = statsRef.current?.getBoundingClientRect()
        if (r) setMenuRect({ left: r.left, top: r.top, width: r.width })
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e) => {
      if (!longTimer.current) return
      if (Math.abs(e.clientX - pressStart.current.x) > MOVE_TOLERANCE_PX ||
          Math.abs(e.clientY - pressStart.current.y) > MOVE_TOLERANCE_PX) clearLong()
    },
    onPointerUp: clearLong,
    onPointerLeave: clearLong,
    onPointerCancel: clearLong
  }

  const openStats = () => {
    if (menuRect) return
    if (longFired.current) { longFired.current = false; return }
    go('/history')
  }

  return (
    <div style={styles.row}>
      {/* Статистика — шире (два показателя: тренировки и время за месяц). */}
      <Card
        flex={2}
        innerRef={statsRef}
        press={statsPress}
        icon={<span style={styles.icon}><TrendingUpIcon size={22} color="var(--color-primary)" /></span>}
        title="Статистика"
        titleRight={periodLabel}
        value={
          <>
            <span style={styles.statIcon}><UiIcon name="muscles-line" size={16} color="var(--color-text-secondary)" /></span>
            <Value num={sum.count} unit="трен" />
            <span style={styles.valueGap} />
            <span style={styles.clock}><ClockIcon size={16} /></span>
            <Value num={formatHours(sum.minutes).replace(' ч', '')} unit="ч" />
          </>
        }
        onClick={openStats}
      />
      <Card
        icon={<span style={styles.icon}><HeartIcon filled size={22} color="var(--color-primary)" /></span>}
        title="Любимые"
        value={<Value num={Math.min(favCount, FAVORITE_LIMIT)} unit="упр" />}
        onClick={() => go('/favorite-exercises')}
      />

      {/* Выбор периода: сам переключатель поверх карточки, без второй обёртки. */}
      {menuRect && createPortal(
        <div
          ref={overlayRef}
          style={styles.periodOverlay}
          onClick={() => { longFired.current = false; setMenuRect(null) }}
        >
          <div
            style={{
              ...styles.periodFloat,
              left: `${menuRect.left + 8}px`,
              top: `${menuRect.top + 4}px`,
              width: `${menuRect.width - 16}px`
            }}
          >
            <PeriodSwitcher items={periodItems} value={period} onChange={pickPeriod} />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function Card({ icon, title, titleRight, value, flex = 1, onClick, innerRef, press }) {
  return (
    <button ref={innerRef} style={{ ...styles.card, flex }} className="press-tile" onClick={onClick} {...(press || {})}>
      <span style={styles.icon}>{icon}</span>
      <div style={styles.textCol}>
        {/* В строке заголовка справа — активный период («Год»), тихо и серым. */}
        <span style={styles.titleRow}>
          <span style={styles.title}>{title}</span>
          {titleRight && <span style={styles.titlePeriod}>{titleRight}</span>}
        </span>
        <span style={styles.valueRow}>
          <span style={styles.valueMain}>{value}</span>
        </span>
      </div>
    </button>
  )
}


// Значение карточки: крупная зелёная цифра + тихая единица измерения.
function Value({ num, unit }) {
  return (
    <>
      <span style={styles.valueNum}>{num}</span>
      <span style={styles.valueUnit}>{unit}</span>
    </>
  )
}

const styles = {
  row: { display: 'flex', gap: 'var(--space-3)', alignItems: 'stretch' },
  card: {
    minWidth: 0, minHeight: '96px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: 'var(--space-3)', textAlign: 'left',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', cursor: 'pointer'
  },
  icon: { display: 'inline-flex', height: '22px' },
  textCol: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)', width: '100%' },
  // Слой закрытия: прозрачный, гасит прокрутку под собой.
  periodOverlay: {
    position: 'fixed', inset: 0, background: 'transparent',
    touchAction: 'none', overscrollBehavior: 'contain', zIndex: 9999
  },
  // Сам переключатель — над карточкой, по её ширине; своей рамки-обёртки нет.
  periodFloat: {
    position: 'fixed',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
    borderRadius: 'var(--radius-pill)',
    animation: 'metricPopIn 0.2s var(--ease-ios) forwards'
  },
  titlePeriod: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0
  },
  title: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // Строка значения: слева значение, справа подпись-контекст.
  valueRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-15)', minHeight: '20px', width: '100%' },
  valueMain: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-15)', minWidth: 0 },
  valueNum: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)', fontWeight: 800, lineHeight: 1, color: 'var(--color-primary)' },
  valueUnit: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500, color: 'var(--color-text-secondary)' },
  // Зазор между двумя показателями статистики; серые иконки перед каждым.
  valueGap: { width: '12px', display: 'inline-block' },
  statIcon: { display: 'inline-flex' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' }
}
