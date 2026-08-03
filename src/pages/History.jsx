import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { summarizeWorkouts, periodShortLabel, periodHintSuffix, mskParts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getHomeStatsPeriod } from '../lib/history-view'
import { getRecords, getRecordsSync } from '../lib/records'
import UiIcon from '../components/UiIcon'
import ScreenTitle from '../components/ScreenTitle'
import HistoryCalendar from '../components/HistoryCalendar'
import HistoryStats, { Distance, MetricValue } from '../components/HistoryStats'
import ExercisePlaceholder from '../components/ExercisePlaceholder'
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
  // Период при ВХОДЕ всегда берём с главной: там селектор, и он — источник
  // правды. Внутри экрана период можно листать сколько угодно, но обратно на
  // главную это не пишется и в следующий заход не переживает — иначе на главной
  // стояла бы «Неделя», а экран открывался бы с тем, что накликали в прошлый раз.
  const [period, setPeriod] = useState(getHomeStatsPeriod)

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
        <PeriodSwitcher items={periodItems} value={period} onChange={pickPeriod} style={{ marginBottom: 'var(--space-4)' }} />

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

      {/* Личные рекорды — лучший результат по каждому виду. Кардио/растяжка
          появятся, когда появятся сами программы. */}
      <Records records={records} />
    </div>
  )
}

/**
 * «Лучшие результаты» — по одному лучшему достижению на вид активности.
 *
 * Метрики описаны для ВСЕХ видов сразу (RECORD_META), а рисуются только те, по
 * которым уже есть данные. Как только появится первая завершённая пробежка или
 * растяжка, её строка встанет сюда сама — правок здесь не потребуется.
 *
 * У силовой есть конкретное упражнение, поэтому под метрикой идёт строка с его
 * миниатюрой и названием (как в списке любимых). У остальных видов упражнения
 * нет — значение стоит прямо в строке метрики.
 *
 * Значение — золотое: это рекорд, а не текущее число. Цвет вида остаётся на
 * бейдже, чтобы два акцента не спорили.
 */
const RECORD_GOLD = '#FFC83D'

const RECORD_META = {
  strength: { icon: 'power', color: 'var(--cat-gym)', label: 'Силовая', metric: 'Самый большой рабочий вес' },
  swim: { icon: 'swimming', color: 'var(--cat-pool)', label: 'Плавание', metric: 'Самая длинная дистанция' },
  // Появятся вместе со своими программами — метрики уже зафиксированы.
  cardio: { icon: 'cardio', color: 'var(--cat-cardio)', label: 'Бег', metric: 'Самая длинная дистанция' },
  stretch: { icon: 'stretching', color: 'var(--cat-stretch)', label: 'Растяжка', metric: 'Самая длинная тренировка' }
}

function Records({ records }) {
  const strength = records?.strength || null
  const swim = records?.swim || null
  if (!strength && !swim) return null

  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '')
  const kg = strength ? Number(strength.weight_kg) : 0
  const kgText = kg % 1 === 0 ? String(kg) : kg.toFixed(1).replace('.', ',')

  return (
    <div style={styles.recGroup}>
      {/* Шапка блока как у карточек главной: иконка сверху, заголовок под ней.
          Кубок золотой — тем же цветом, что и сами рекорды ниже, поэтому блок
          читается одним смысловым куском. */}
      <div style={styles.recHeadWrap}>
        <span style={styles.recHeadIcon}><UiIcon name="trophy" size={22} color={RECORD_GOLD} /></span>
        <div style={styles.recHead}>Лучшие результаты</div>
      </div>

      {strength && (
        <RecordBlock kind="strength">
          <div style={styles.recItem}>
            <span style={styles.recThumb}>
              {strength.preview_url
                ? <img src={strength.preview_url} alt="" style={styles.recThumbImg} draggable={false} />
                : <ExercisePlaceholder size={20} />}
            </span>
            <span style={styles.recItemName}>{cap(strength.name)}</span>
            <span style={styles.recValue}>
              <MetricValue num={kgText} unit="кг" color={RECORD_GOLD} />
            </span>
          </div>
        </RecordBlock>
      )}

      {swim && (
        <RecordBlock
          kind="swim"
          divider={!!strength}
          value={<Distance meters={swim.distance_m} color={RECORD_GOLD} />}
        />
      )}
    </div>
  )
}

/**
 * Одна запись: шапка вида (бейдж + название), под ней подпись метрики.
 * `value` — значение прямо в строке метрики (виды без упражнения);
 * `children` — строка результата под метрикой (силовая с миниатюрой).
 */
function RecordBlock({ kind, divider = false, value = null, children = null }) {
  const m = RECORD_META[kind]
  return (
    <div style={{ ...styles.recBlock, ...(divider ? styles.recDivider : null) }}>
      <div style={styles.recTop}>
        <span style={{ ...styles.recBadge, background: m.color }}>
          <UiIcon name={m.icon} size={13} color="var(--accent-on)" />
        </span>
        <span style={styles.recKind}>{m.label}</span>
      </div>
      <div style={styles.recMetricRow}>
        <span style={styles.recMetric}>{m.metric}</span>
        {value && <span style={styles.recValue}>{value}</span>}
      </div>
      {children}
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
  recHeadWrap: { display: 'flex', flexDirection: 'column', gap: 'var(--space-15)', marginBottom: 'var(--space-2)' },
  recHeadIcon: { display: 'inline-flex', height: '22px' },
  recHead: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700,
    color: 'var(--color-text)', letterSpacing: '0.2px'
  },
  recBlock: { display: 'flex', flexDirection: 'column', gap: 'var(--space-15)', padding: 'var(--space-3) 0' },
  recDivider: { borderTop: '1px solid var(--border-hairline)', marginTop: 'var(--space-1)', paddingTop: 'var(--space-4)' },
  // Шапка вида: цветной бейдж + название раздела.
  recTop: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  recKind: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700,
    color: 'var(--color-text)'
  },
  // Строка метрики: слева что меряем, справа значение (у видов без упражнения).
  recMetricRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' },
  recMetric: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)'
  },
  // Строка результата с миниатюрой — как в списке любимых упражнений.
  recItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-05)' },
  recThumb: {
    flexShrink: 0, width: '32px', height: '32px', borderRadius: 'var(--radius-small)', overflow: 'hidden',
    background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  recThumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  recItemName: {
    flex: 1, minWidth: 0,
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 600,
    color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  // Бейдж вида — как в сводке и календаре: чёрная иконка на цветном квадрате.
  recBadge: {
    width: '22px', height: '22px', borderRadius: 'var(--radius-xs)', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
  },
  recValue: { flexShrink: 0, fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: 'var(--text-body-size)', whiteSpace: 'nowrap' },
}
