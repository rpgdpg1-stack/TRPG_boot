import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getHistoryView, setHistoryView } from '../lib/history-view'
import ScreenTitle from '../components/ScreenTitle'
import HistoryCalendar from '../components/HistoryCalendar'
import HistoryStats from '../components/HistoryStats'

const PERIODS = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё' }
]

/**
 * История тренировок — единственное место с детальной аналитикой:
 * блок статистики (свитчер Неделя/Месяц/Год) → месячный календарь →
 * заглушки «Скоро» (рекорды, любимые упражнения).
 *
 * «Месяц»/«Год» считаются за месяц/год, который сейчас ОТКРЫТ в календаре ниже:
 * листнул календарь на июнь → статистика за месяц пересчиталась на июнь.
 */
export default function History() {
  const navigate = useNavigate()
  // Стартовый вид — общий с главной (localStorage), чтобы цифры совпадали.
  const initialView = useRef(getHistoryView())
  const [period, setPeriod] = useState(initialView.current.period)
  const [view, setView] = useState({ year: initialView.current.year, month: initialView.current.month })
  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    const load = () => getRecentWorkouts(HISTORY_FETCH_LIMIT).then(d => { if (!cancelled) setWorkouts(d || []) })
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  // Календарь сообщает открытый месяц/год; тап по месяцу в год-режиме → на месяц.
  const onCalView = useCallback((v) => setView(v), [])
  const onMonthPick = useCallback((year, month) => { setPeriod('month'); setView({ year, month }) }, [])

  // Персистим выбор (период + открытый месяц/год) — тот же вид на главной.
  useEffect(() => { setHistoryView({ period, year: view.year, month: view.month }) }, [period, view])

  // Неделя — всегда текущая (в календаре недели нет). Месяц/год — за открытый в
  // календаре месяц/год (refDate = 15-е число этого месяца).
  const refDate = (period === 'week' || period === 'all') ? new Date() : new Date(Date.UTC(view.year, view.month, 15, 12))
  const sum = summarizeWorkouts(workouts, period, refDate)

  const pickPeriod = (id) => { if (id !== period) { haptic.selection(); setPeriod(id) } }

  return (
    <div className="page page-fade">
      <ScreenTitle>История</ScreenTitle>

      {/* Блок статистики со свитчером периода */}
      <div style={styles.statsCard}>
        <div style={styles.segGroup}>
          {PERIODS.map((p, i) => {
            const active = p.id === period
            return (
              <button
                key={p.id}
                className="press-tile"
                onClick={() => pickPeriod(p.id)}
                style={{
                  ...styles.segItem,
                  ...(active ? styles.segItemActive : {}),
                  marginLeft: i === 0 ? 0 : '-5px',
                  zIndex: active ? 2 : 1,
                  color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)'
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <HistoryStats summary={sum} />
      </div>

      {/* Календарь: месяц-режим (день-сетка) или год-режим (12 месяцев).
          Сообщает открытый месяц/год наверх; тап по месяцу в год-режиме → на месяц. */}
      <div style={{ marginBottom: '20px' }}>
        <HistoryCalendar
          mode={period === 'year' ? 'year' : 'month'}
          initialView={initialView.current}
          onViewChange={onCalView}
          onMonthPick={onMonthPick}
        />
      </div>

      {/* Скоро — тихие некликабельные заглушки */}
      <div style={styles.soonGroup}>
        <SoonRow emoji="🏆" title="Личные рекорды" />
        <div style={styles.soonDivider} />
        <SoonRow emoji="⭐" title="Любимые упражнения" />
      </div>
    </div>
  )
}

function SoonRow({ emoji, title }) {
  return (
    <div style={styles.soonRow}>
      <span style={styles.soonEmoji}>{emoji}</span>
      <span style={styles.soonTitle}>{title}</span>
      <span style={styles.soonTag}>Скоро</span>
    </div>
  )
}

const styles = {
  statsCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '16px',
    marginBottom: '20px'
  },
  // Сегмент-контрол Неделя/Месяц/Год — мини-таб-бар (как в конструкторе/place).
  segGroup: {
    display: 'flex', alignItems: 'center', gap: 0, padding: '4px',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    marginBottom: '16px'
  },
  segItem: {
    position: 'relative', flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '30px', padding: '0 10px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.2px',
    cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  segItemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  },

  soonGroup: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    opacity: 0.7
  },
  soonRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 18px', minHeight: '56px'
  },
  soonEmoji: { fontSize: '20px', lineHeight: 1, width: '26px', textAlign: 'center', flexShrink: 0 },
  soonTitle: {
    flex: 1, fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600,
    color: 'var(--color-text)'
  },
  soonTag: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '10px',
    letterSpacing: '1px', color: 'var(--color-text-secondary)', textTransform: 'uppercase'
  },
  soonDivider: { height: '1px', background: 'var(--border-hairline)', marginLeft: '56px' }
}
