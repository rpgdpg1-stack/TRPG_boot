import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { summarizeWorkouts, periodShortLabel, periodHintSuffix, mskParts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getRecords, getRecordsSync } from '../lib/records'
import ScreenTitle from '../components/ScreenTitle'
import HistoryCalendar from '../components/HistoryCalendar'
import HistoryStats from '../components/HistoryStats'
import PersonalRecords from '../components/PersonalRecords'
import SegmentedControl, { periodOptions } from '../components/SegmentedControl'
import { goal, GOALS } from '../lib/metrika'

/**
 * История тренировок — единственное место с детальной аналитикой и
 * единственное, где период вообще выбирается (на главной его нет):
 * блок статистики (свитчер Неделя/Месяц/Год/Всё) → месячный календарь →
 * рекорды (лучший месяц; силовая: максимальный рабочий вес; плавание: лучший
 * заплыв) общим компонентом `PersonalRecords` — он же в модалке профиля.
 *
 * «Месяц»/«Год» считаются за месяц/год, который сейчас ОТКРЫТ в календаре ниже:
 * листнул календарь на июнь → статистика за месяц пересчиталась на июнь.
 */
export default function History() {
  const navigate = useNavigate()
  // Экран ВСЕГДА открывается на МЕСЯЦЕ, что бы ни листали в прошлый раз.
  // Выбор периода здесь — инструмент разбора «прямо сейчас», а не настройка:
  // вышел и вернулся — снова текущий месяц, как и на главной. Так цифры на
  // главной и в статистике при входе совпадают, и не надо вспоминать,
  // на чём остановился.
  //
  // Исключение — заход из напоминания: сводка за неделю обязана открыть неделю,
  // иначе человек увидит не те цифры, что были в сообщении.
  const location = useLocation()
  const [period, setPeriod] = useState(() => location.state?.period || 'month')

  // Календарь всегда открывается на СВЕЖЕМ месяце/годе. Долистал до мая, вышел,
  // вернулся — снова август: «где я сейчас» важнее, чем «где был в прошлый раз».
  const nowParts = mskParts(new Date().toISOString())
  const currentView = useRef({ year: nowParts.y, month: nowParts.m })
  const initialView = currentView
  const [view, setView] = useState({ year: currentView.current.year, month: currentView.current.month })
  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [wkLoaded, setWkLoaded] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) != null)
  // Личные рекорды: старт из кеша (мгновенно), сервер догоняет.
  const [records, setRecords] = useState(() => getRecordsSync())
  useEffect(() => { getRecords().then(setRecords) }, [])

  // Открытие статистики — цель: по ней видно, интересуют ли людей цифры
  // вообще, или экран существует только для нас.
  useEffect(() => { goal(GOALS.STATS_OPEN) }, [])

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


  // Неделя — всегда текущая (в календаре недели нет). Месяц/год — за открытый в
  // календаре месяц/год (refDate = 15-е число этого месяца).
  const refDate = (period === 'week' || period === 'all') ? new Date() : new Date(Date.UTC(view.year, view.month, 15, 12))
  const sum = summarizeWorkouts(workouts, period, refDate)

  // Смена периода возвращает календарь на текущий месяц/год — иначе после
  // «месяц (май) → год → месяц» открывался бы снова май, а не август.
  const pickPeriod = (id) => {
    setPeriod(id)
    setView({ year: currentView.current.year, month: currentView.current.month })
  }

  const periodItems = periodOptions()
  // Заглушка называет период и уточняет его в скобках — «в этом месяце (Август)»:
  // календарь листается, и без уточнения непонятно, о каком месяце речь.
  const hint = periodHintSuffix(period, refDate)
  const emptyText = period === 'month'
    ? `Заверши первую тренировку в этом месяце${hint}, чтобы увидеть статистику.`
    : period === 'year'
      ? `Заверши первую тренировку в этом году${hint}, чтобы увидеть статистику.`
      : period === 'week'
        ? `Заверши первую тренировку на этой неделе${hint}, чтобы увидеть статистику.`
        : 'Заверши первую тренировку, чтобы увидеть статистику.'

  return (
    <div className="page page-fade">
      <ScreenTitle>Статистика</ScreenTitle>

      {/* Блок статистики со свитчером периода */}
      <div style={styles.statsCard}>
        <SegmentedControl items={periodItems} value={period} onChange={pickPeriod} style={{ marginBottom: 'var(--space-4)' }} />

        <HistoryStats summary={sum} loading={!wkLoaded} periodLabel={periodShortLabel(period, refDate)} emptyText={emptyText} />
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

      {/* Рекорды — лучший результат по каждому виду плюс лучший месяц.
          Кардио/растяжка появятся, когда появятся сами программы. */}
      <PersonalRecords records={records} />
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
  }
}
