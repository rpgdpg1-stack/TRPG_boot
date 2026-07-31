import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { localGet, localSet } from '../utils/storage'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { summarizeWorkouts, formatHours, HISTORY_FETCH_LIMIT, MONTHS_RU } from '../utils/history'
import { getFavoritesSync, getFavoriteExercises, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { EVENTS, on } from '../lib/events'
import AnchorMenu from './AnchorMenu'
import PeriodSwitcher from './PeriodSwitcher'
import ClockIcon from './ClockIcon'
import UiIcon from './UiIcon'
import HeartIcon from './HeartIcon'
import TrendingUpIcon from './TrendingUpIcon'

/**
 * Две карточки-входа на главной: **Статистика** (два показателя — тренировки и
 * время за выбранный период) и **Любимые**.
 *
 * Период статистики по умолчанию — ГОД (за месяц картина слишком куцая). Меняется
 * ДОЛГИМ нажатием по карточке: выезжает попап с сегмент-контролом
 * «7д · Август · 2026 · Всё» (тот же `PeriodSwitcher`, что на экране статистики).
 * Обычный тап по карточке по-прежнему ведёт на `/history`.
 */
const PERIOD_KEY = 'home-stats-period'
const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 8
export default function HomeCards() {
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
  const periodItems = [
    { id: 'week', label: '7д' },
    { id: 'month', label: MONTHS_RU[now.getMonth()] },
    { id: 'year', label: String(now.getFullYear()) },
    { id: 'all', label: 'Всё' }
  ]
  const periodLabel = periodItems.find(p => p.id === period)?.label || ''

  const go = (path) => { haptic.light(); navigate(path, { state: { from: '/' } }) }

  // Долгое нажатие по карточке статистики → выбор периода (тап остаётся переходом).
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
        setMenuRect(statsRef.current?.getBoundingClientRect() || null)
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

  const pickPeriod = (id) => {
    setPeriod(id)
    localSet(PERIOD_KEY, id)
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
        value={
          <>
            <span style={styles.statIcon}><UiIcon name="muscles-line" size={16} color="var(--color-text-secondary)" /></span>
            <Value num={sum.count} unit="трен" />
            <span style={styles.valueGap} />
            <span style={styles.clock}><ClockIcon size={16} /></span>
            <Value num={formatHours(sum.minutes).replace(' ч', '')} unit="ч" />
          </>
        }
        caption={periodLabel}
        onClick={openStats}
      />
      <Card
        icon={<span style={styles.icon}><HeartIcon filled size={22} color="var(--color-primary)" /></span>}
        title="Любимые"
        value={<Value num={Math.min(favCount, FAVORITE_LIMIT)} unit="упр" />}
        onClick={() => go('/favorite-exercises')}
      />
      {/* Выбор периода статистики — по центру под карточкой, как меню долгого нажатия. */}
      {menuRect && (
        <AnchorMenu
          anchorRect={menuRect}
          onClose={() => { longFired.current = false; setMenuRect(null) }}
          align="left"
          gap={3}
          motion="drop"
          items={[{
            key: 'period',
            custom: (
              <PeriodSwitcher items={periodItems} value={period} onChange={pickPeriod} />
            )
          }]}
        />
      )}
    </div>
  )
}

function Card({ icon, title, value, caption, flex = 1, onClick, innerRef, press }) {
  return (
    <button ref={innerRef} style={{ ...styles.card, flex }} className="press-tile" onClick={onClick} {...(press || {})}>
      <span style={styles.icon}>{icon}</span>
      <div style={styles.textCol}>
        <span style={styles.title}>{title}</span>
        {/* Значение слева, подпись-контекст — в правом углу той же строки. */}
        <span style={styles.valueRow}>
          <span style={styles.valueMain}>{value}</span>
          {caption && <span style={styles.caption}>{caption}</span>}
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
  row: { display: 'flex', gap: '12px', alignItems: 'stretch' },
  card: {
    minWidth: 0, minHeight: '96px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: '12px', textAlign: 'left',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', cursor: 'pointer'
  },
  icon: { display: 'inline-flex', height: '22px' },
  textCol: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  title: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // Строка значения: слева значение, справа подпись-контекст.
  valueRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px', minHeight: '20px', width: '100%' },
  valueMain: { display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  valueNum: { fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 800, lineHeight: 1, color: 'var(--color-primary)' },
  valueUnit: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' },
  // Подпись-контекст — тихая, в правом углу строки значения («Июль» / «Утро»).
  caption: { fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0 },
  // Зазор между двумя показателями статистики; серые иконки перед каждым.
  valueGap: { width: '12px', display: 'inline-block' },
  statIcon: { display: 'inline-flex' },
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' }
}
