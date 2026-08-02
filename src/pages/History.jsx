import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getHistoryView, setHistoryView } from '../lib/history-view'
import { getRecords, getRecordsSync } from '../lib/records'
import UiIcon from '../components/UiIcon'
import ScreenTitle from '../components/ScreenTitle'
import HistoryCalendar from '../components/HistoryCalendar'
import HistoryStats, { Distance } from '../components/HistoryStats'
import PeriodSwitcher, { periodOptions } from '../components/PeriodSwitcher'

/**
 * История тренировок — единственное место с детальной аналитикой:
 * блок статистики (свитчер Неделя/Месяц/Год) → месячный календарь →
 * личные рекорды (силовая: максимальный рабочий вес; плавание: лучший заплыв).
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
  const [wkLoaded, setWkLoaded] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) != null)
  // Личные рекорды: старт из кеша (мгновенно), сервер догоняет.
  const [records, setRecords] = useState(() => getRecordsSync())
  useEffect(() => { getRecords().then(setRecords) }, [])

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    const load = () => getRecentWorkouts(HISTORY_FETCH_LIMIT).then(d => { if (!cancelled) { setWorkouts(d || []); setWkLoaded(true) } })
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  // Календарь сообщает открытый месяц/год; тап по месяцу/году → в этот режим.
  const onCalView = useCallback((v) => setView(v), [])
  const onMonthPick = useCallback((year, month) => { setPeriod('month'); setView({ year, month }) }, [])
  const onYearPick = useCallback((year) => { setPeriod('year'); setView(v => ({ ...v, year })) }, [])

  // Персистим выбор (период + открытый месяц/год) — тот же вид на главной.
  useEffect(() => { setHistoryView({ period, year: view.year, month: view.month }) }, [period, view])

  // Неделя — всегда текущая (в календаре недели нет). Месяц/год — за открытый в
  // календаре месяц/год (refDate = 15-е число этого месяца).
  const refDate = (period === 'week' || period === 'all') ? new Date() : new Date(Date.UTC(view.year, view.month, 15, 12))
  const sum = summarizeWorkouts(workouts, period, refDate)

  const pickPeriod = (id) => setPeriod(id)

  const periodItems = periodOptions()
  const emptyText = period === 'month'
    ? 'Заверши первую тренировку в этом месяце, чтобы увидеть статистику.'
    : period === 'year'
      ? 'Заверши первую тренировку в этом году, чтобы увидеть статистику.'
      : period === 'week'
        ? 'Заверши первую тренировку на этой неделе, чтобы увидеть статистику.'
        : 'Заверши первую тренировку, чтобы увидеть статистику.'

  return (
    <div className="page page-fade">
      <ScreenTitle>Статистика</ScreenTitle>

      {/* Блок статистики со свитчером периода */}
      <div style={styles.statsCard}>
        <PeriodSwitcher items={periodItems} value={period} onChange={pickPeriod} style={{ marginBottom: 'var(--space-4)' }} />

        <HistoryStats summary={sum} loading={!wkLoaded} emptyText={emptyText} />
      </div>

      {/* Календарь: месяц-режим (день-сетка) или год-режим (12 месяцев).
          Сообщает открытый месяц/год наверх; тап по месяцу в год-режиме → на месяц. */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <HistoryCalendar
          mode={period}
          initialView={initialView.current}
          onViewChange={onCalView}
          onMonthPick={onMonthPick}
          onYearPick={onYearPick}
        />
      </div>

      {/* Личные рекорды — лучший результат по каждому виду. Кардио/растяжка
          появятся, когда появятся сами программы. */}
      <Records records={records} />
    </div>
  )
}

/**
 * Личные рекорды: строка на вид активности — иконка вида в его цвете, название
 * достижения и само значение (цифра в цвет вида, единица серым).
 * Пока рекордов нет — блок не показываем (пустая полка ничего не сообщает).
 */
function Records({ records }) {
  const strength = records?.strength || null
  const swim = records?.swim || null
  if (!strength && !swim) return null

  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '')
  const kg = strength ? Number(strength.weight_kg) : 0
  const kgText = kg % 1 === 0 ? String(kg) : kg.toFixed(1).replace('.', ',')

  return (
    <div style={styles.recGroup}>
      <div style={styles.recHead}>Личные рекорды</div>

      {strength && (
        <div style={styles.recRow}>
          <span style={{ ...styles.recBadge, background: 'var(--cat-gym)' }}>
            <UiIcon name="power" size={13} color="var(--accent-on)" />
          </span>
          <span style={styles.recText}>
            <span style={styles.recTitle}>{cap(strength.name)}</span>
            <span style={styles.recNote}>Рабочий вес</span>
          </span>
          <span style={styles.recValue}>
            <span style={{ color: 'var(--cat-gym)', fontWeight: 800 }}>{kgText}</span>
            <span style={styles.recUnit}> кг</span>
          </span>
        </div>
      )}

      {swim && (
        <div style={{ ...styles.recRow, ...(strength ? styles.recDivider : null) }}>
          <span style={{ ...styles.recBadge, background: 'var(--cat-pool)' }}>
            <UiIcon name="swimming" size={13} color="var(--accent-on)" />
          </span>
          <span style={styles.recText}>
            <span style={styles.recTitle}>Плавание</span>
            <span style={styles.recNote}>Лучший заплыв</span>
          </span>
          <span style={styles.recValue}>
            <Distance meters={swim.distance_m} color="var(--cat-pool)" />
          </span>
        </div>
      )}
    </div>
  )
}

const styles = {
  statsCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-4)',
    marginBottom: 'var(--space-5)'
  },
  // Личные рекорды — блок-карточка со строками по видам активности.
  recGroup: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-4) var(--space-4) var(--space-2)'
  },
  recHead: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px', marginBottom: 'var(--space-15)'
  },
  recRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0' },
  recDivider: { borderTop: '1px solid var(--border-hairline)' },
  // Бейдж вида — как в сводке и календаре: чёрная иконка на цветном квадрате.
  recBadge: {
    width: '22px', height: '22px', borderRadius: 'var(--radius-xs)', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
  },
  recText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-05)' },
  recTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700, color: 'var(--color-text)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  recNote: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500, color: 'var(--color-text-secondary)' },
  recValue: { flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-body-size)', whiteSpace: 'nowrap' },
  recUnit: { color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: 'var(--text-label-size)' }
}
