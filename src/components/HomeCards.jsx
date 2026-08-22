import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { summarizeWorkouts, formatHours, periodShortLabel, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getFavoritesSync, getFavoriteExercises, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { EVENTS, on } from '../lib/events'
import { getHomeStatsPeriod, setHomeStatsPeriod } from '../lib/history-view'
import { periodOptions } from './PeriodSwitcher'
import ClockIcon from './ClockIcon'
import UiIcon from './UiIcon'
import HeartIcon from './HeartIcon'
import TrendingUpIcon from './TrendingUpIcon'
import ChevronIcon from './ChevronIcon'
import { useOutsideClose } from '../lib/use-outside-close'

/**
 * Две карточки-входа на главной: **Статистика** (два показателя — тренировки и
 * время за выбранный период) и **Любимые**.
 *
 * Период («Неделя · Месяц · Год · Всё») по умолчанию ГОД, выбор помнится локально.
 * Меняется ВИДИМЫМ селектором справа в строке заголовка: «Год ▾», тап раскрывает
 * список — тот же язык, что у селектора раздела в карусели. Долгого нажатия тут
 * больше нет: о скрытом жесте нельзя догадаться. Тап по остальной карточке ведёт
 * на `/history`, тап мимо списка его закрывает.
 */
export default function HomeCards() {
  const navigate = useNavigate()

  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [favCount, setFavCount] = useState(() => (getFavoritesSync() || []).length)
  // Период статистики: по умолчанию год.
  const [period, setPeriod] = useState(getHomeStatsPeriod)
  const [selectorPressed, setSelectorPressed] = useState(false)
  const [open, setOpen] = useState(false)   // раскрыт список периодов
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
    setOpen(false)
    if (id === period) return
    haptic.selection()
    setPeriod(id)
    setHomeStatsPeriod(id)
  }

  // Период меняется видимым селектором в строке заголовка (не скрытым долгим
  // нажатием — о нём нельзя догадаться). Тап по остальной карточке ведёт в
  // историю. Список закрывается тапом мимо.
  const selectorRef = useRef(null)
  useOutsideClose(selectorRef, open, useCallback(() => setOpen(false), []))

  const openStats = () => {
    if (open) { setOpen(false); return }
    go('/history')
  }

  return (
    <div style={styles.row}>
      {/* Статистика — шире (два показателя: тренировки и время за месяц). */}
      <Card
        flex="1 1 auto"
        icon={<span style={styles.icon}><TrendingUpIcon size={22} color="var(--color-primary)" /></span>}
        title="Статистика"
        periodLabel={periodShortLabel(period, now)}
        periodRow={
          <span ref={selectorRef} style={styles.selectorWrap}>
            <button
              style={styles.selector}
              onClick={(e) => { e.stopPropagation(); haptic.light(); setOpen(o => !o) }}
              onPointerDown={() => setSelectorPressed(true)}
              onPointerUp={() => setSelectorPressed(false)}
              onPointerCancel={() => setSelectorPressed(false)}
              onPointerLeave={() => setSelectorPressed(false)}
              aria-label="Период статистики"
            >
              {/* Пока палец на слове — оно чуть крупнее. Отклик карточки при
                  этом остаётся: состояние «нажато» у браузера поднимается по
                  дереву, и убрать его у родителя, не ломая отклик в остальных
                  местах карточки, нельзя. */}
              <span style={{
                ...styles.selectorText,
                ...(selectorPressed ? styles.selectorTextPressed : null)
              }}>{periodLabel}</span>
              <span style={{
                ...styles.selectorChev,
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)'
              }}>
                <ChevronIcon size={12} color="currentColor" />
              </span>
            </button>

            {open && (
              <span style={styles.dropdown} onClick={(e) => e.stopPropagation()}>
                {periodItems.map(p => {
                  const on = p.id === period
                  return (
                    <button
                      key={p.id}
                      className="press-tile"
                      style={{
                        ...styles.dropItem,
                        background: on ? 'var(--color-surface-active)' : 'transparent',
                        color: on ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                      }}
                      onClick={(e) => { e.stopPropagation(); pickPeriod(p.id) }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </span>
            )}
          </span>
        }
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
        // Идеальный квадрат: ширина следует за высотой (aspect-ratio), а не
        // задана числом — высота карточек может измениться, квадрат останется.
        square
        title="Любимые"
        // Своя строка на том же уровне, что «Август» у статистики: без неё
        // карточки разъезжались по высоте и сердечко уезжало вниз. Заодно
        // объясняет лимит — избранных ровно пять.
        periodLabel={`Топ-${FAVORITE_LIMIT}`}
        periodRow={<span />}
        value={<Value num={Math.min(favCount, FAVORITE_LIMIT)} unit="упр" />}
        onClick={() => go('/favorite-exercises')}
      />

    </div>
  )
}

// Карточка — div, а не button: внутри строки заголовка живёт настоящая кнопка
// селектора, а вкладывать button в button нельзя (невалидная разметка, и клики
// конфликтуют). Роль и tabIndex сохраняют доступность.
function Card({ icon, title, periodRow, periodLabel, value, flex = '1 1 auto', square = false, onClick, innerRef }) {
  return (
    <div
      ref={innerRef}
      role="button"
      tabIndex={0}
      style={{ ...styles.card, flex: square ? '0 0 auto' : flex, ...(square ? styles.cardSquare : null) }}
      className="press-tile"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
    >
      <span style={styles.icon}>{icon}</span>
      <div style={styles.textCol}>
        <span style={styles.titleRow}>
          <span style={styles.title}>{title}</span>
        </span>
        {/* Отдельная строка периода МЕЖДУ заголовком и цифрами: слева какой
            отрезок показан («Август»), справа селектор. Так цифры ниже —
            просто метрики, а «за что они» читается на своём уровне. */}
        {periodRow && (
          <span style={styles.periodRow}>
            <span style={styles.periodMark}>{periodLabel}</span>
            {periodRow}
          </span>
        )}
        <span style={styles.valueRow}>
          <span style={styles.valueMain}>{value}</span>
        </span>
      </div>
    </div>
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
  // Зазор между карточками — тот же межгрупповой шаг (24), что вертикальный
  // отступ от блока раздела выше: одинаковый воздух по обеим осям.
  row: { display: 'flex', gap: 'var(--space-6)', alignItems: 'stretch' },
  card: {
    // 110 — фактическая высота карточки с её содержимым. Задаём явно, потому
    // что от этого значения квадратная карточка берёт ширину (aspect-ratio
    // считает от minHeight, а не от растянутой высоты соседа).
    minWidth: 0, minHeight: '110px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: 'var(--space-3)', textAlign: 'left',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', cursor: 'pointer'
  },
  // Квадратная карточка: ширина = высоте. Выравнивание и паддинги — как у
  // соседней карточки, чтобы содержимое стояло на одной левой линии.
  cardSquare: { aspectRatio: '1 / 1' },
  icon: { display: 'inline-flex', height: '22px' },
  textCol: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)', width: '100%' },
  // Сам переключатель — над карточкой, по её ширине; своей рамки-обёртки нет.
  // Селектор периода в строке заголовка. relative — база для выпадающего списка.
  selectorWrap: { position: 'relative', display: 'inline-flex', flexShrink: 0 },
  selector: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-05)',
    padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  selectorText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
    display: 'inline-block',
    transition: 'color 0.12s ease, transform var(--press-duration) var(--press-ease)'
  },
  // Слово периода на касании только чуть подрастает. Белым не красим: цвет
  // здесь несёт смысл («это второстепенная подпись»), а не состояние, и
  // подсветка спорила бы с соседними серыми подписями.
  selectorTextPressed: {
    transform: 'scale(1.06)'
  },
  selectorChev: {
    display: 'inline-flex', lineHeight: 0, color: 'var(--color-text-secondary)',
    transition: 'transform 0.22s var(--ease-ios)'
  },
  // Список — вправо по краю селектора (карточка узкая, влево он бы вылез за неё).
  dropdown: {
    position: 'absolute', top: 'calc(100% + var(--space-15))', right: 0,
    zIndex: 60, minWidth: '116px',
    padding: 'var(--space-15)',
    // То же стекло, что у меню долгого нажатия и кнопок навигации: всплывающие
    // панели по всему приложению должны быть одной плотности.
    background: 'var(--surface-glass)',
    backdropFilter: 'var(--blur-glass)',
    WebkitBackdropFilter: 'var(--blur-glass)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-medium)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-05)'
  },
  dropItem: {
    display: 'flex', alignItems: 'center',
    width: '100%', padding: 'var(--space-2) var(--space-3)',
    border: 'none', borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap'
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
  clock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  // Строка периода: подпись слева, селектор справа.
  periodRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', width: '100%' },
  // Подпись периода — тем же тихим серым, что иконки.
  periodMark: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  }
}
