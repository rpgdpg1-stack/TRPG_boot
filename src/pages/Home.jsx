import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import { localGet } from '../utils/storage'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { getHistoryView, setHistoryView } from '../lib/history-view'
import { EVENTS, on } from '../lib/events'
import SectionCarousel from '../components/SectionCarousel'
import ScreenTitle from '../components/ScreenTitle'
import ChevronIcon from '../components/ChevronIcon'
import HistoryStats from '../components/HistoryStats'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'

// Компактная карточка-кнопка «История»: сводка за текущую неделю (серия +
// силовая/плавание) за выбранный период. Вторичный блок — спокойнее по весу, чем
// блок раздела. Период (дропдаун) синхронен с /history (localStorage history-view).
const HISTORY_PERIODS = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё время' }
]
const periodLabel = (id) => HISTORY_PERIODS.find(p => p.id === id)?.label || 'Неделя'

function HistoryBlock() {
  const navigate = useNavigate()
  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [view, setView] = useState(getHistoryView)   // { period, year, month }
  const [open, setOpen] = useState(false)            // дропдаун периода

  useEffect(() => {
    let cancelled = false
    const load = () => getRecentWorkouts(HISTORY_FETCH_LIMIT).then(d => { if (!cancelled) setWorkouts(d || []) })
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  // Неделя/Всё время — от «сейчас»; Месяц/Год — за открытый в /history месяц/год.
  const refDate = (view.period === 'week' || view.period === 'all')
    ? new Date()
    : new Date(Date.UTC(view.year, view.month, 15, 12))
  const sum = summarizeWorkouts(workouts, view.period, refDate)

  const pickPeriod = (period) => {
    setOpen(false)
    if (period === view.period) return
    haptic.light()
    const next = { ...view, period }
    setView(next)
    setHistoryView(next)
  }

  // Весь блок ведёт в /history (календарь). Дропдаун периода — свой тап (не навигирует).
  const openHistory = () => { haptic.light(); navigate('/history') }

  return (
    <div style={styles.histBlock} className="press-tile" onClick={openHistory}>
      <div style={styles.histHead}>
        <span style={styles.histTitle}>История</span>

        <div style={styles.periodWrap} onClick={(e) => e.stopPropagation()}>
          <button
            style={styles.periodBtn}
            className="press-tile"
            onClick={() => { haptic.light(); setOpen(o => !o) }}
            aria-label="Выбрать период"
          >
            {periodLabel(view.period)}
            <span style={{ ...styles.periodChev, transform: open ? 'rotate(180deg)' : 'none' }}>
              <ChevronIcon size={14} color="var(--color-text-secondary)" />
            </span>
          </button>

          {open && (
            <>
              <div style={styles.dropClose} onClick={() => setOpen(false)} aria-hidden="true" />
              <div style={styles.periodDropdown}>
                {HISTORY_PERIODS.map(p => (
                  <button key={p.id} className="tg-row" style={styles.periodItem} onClick={() => pickPeriod(p.id)}>
                    <span style={{ ...styles.periodItemText, color: p.id === view.period ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>{p.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <HistoryStats summary={sum} />
      </div>
    </div>
  )
}

// Порог оттягивания (px) для срабатывания обновления и максимум демпфированного хода.
// PTR_REVEAL — «мёртвая зона»: сперва тянется невидимый верх, кольцо появляется только
// после неё (как в Instagram/Telegram), дальше заполняется до порога.
const PTR_REVEAL = 14
const PTR_THRESH = 90
const PTR_MAX = 150

// Pull-to-refresh: НЕ двигаем контент и НЕ блокируем жест — верх тянет нативный
// отскок (резинка), а мы лишь считаем ход пальца и рисуем кольцо поверх в этой зоне.
// На пороге микровибро (armed), отпустил за порогом → success-вибро и обновление.
function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const armed = useRef(false)

  useEffect(() => {
    const scrollTop = () => window.scrollY || document.scrollingElement?.scrollTop || 0
    const onStart = (e) => {
      if (refreshing) return
      startY.current = scrollTop() <= 0 ? e.touches[0].clientY : null
      armed.current = false
    }
    const onMove = (e) => {
      if (startY.current == null || refreshing) return
      if (scrollTop() > 0) { startY.current = null; setPull(0); return }
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { setPull(0); return }
      const damped = Math.min(PTR_MAX, dy * 0.5)
      setPull(damped)
      const nowArmed = damped >= PTR_THRESH
      if (nowArmed && !armed.current) { armed.current = true; haptic.rigid() }
      else if (!nowArmed && armed.current) armed.current = false
    }
    const onEnd = () => {
      if (startY.current == null) return
      startY.current = null
      if (armed.current && !refreshing) {
        setRefreshing(true)
        setPull(PTR_THRESH)
        haptic.success()
        setTimeout(() => onRefresh(), 500) // дать увидеть заполнение + вибро
      } else {
        setPull(0)
      }
      armed.current = false
    }
    // Все слушатели passive: жест не перехватываем, нативный отскок работает штатно.
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshing, onRefresh])

  return { pull, refreshing }
}

// Кружок-индикатор: ТОЛЬКО зелёная дуга (без серого трека/подложки/обводки). При малом
// progress — короткая дуга-«точка», растёт в кольцо; в refreshing — крутится лоадером.
function PullRing({ progress, refreshing, color }) {
  const R = 11
  const C = 2 * Math.PI * R
  const p = Math.min(1, Math.max(0, progress))
  const arc = refreshing ? 0.28 : Math.max(0.05, p) // минимум — «точка»
  return (
    <div className={refreshing ? 'ptr-spin' : undefined} style={styles.pullRing}>
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle
          cx="13" cy="13" r={R} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - arc)}
          transform="rotate(-90 13 13)"
        />
      </svg>
    </div>
  )
}

// Индикатор через портал в body — не попадает под transform страницы (иначе поехал бы).
function PullIndicator({ pull, refreshing, color }) {
  const shown = pull > PTR_REVEAL || refreshing
  const eff = refreshing ? PTR_THRESH : pull
  // Прогресс кольца считаем ОТ мёртвой зоны до порога (0 при PTR_REVEAL, 1 при THRESH).
  const progress = (pull - PTR_REVEAL) / (PTR_THRESH - PTR_REVEAL)
  return createPortal(
    <div aria-hidden="true" style={{
      ...styles.pullIndicator,
      opacity: shown ? 1 : 0,
      // Появляется на ~8px ВЫШЕ пилюли недели и тянется вниз по ходу оттяга.
      transform: `translateY(${eff - 36}px)`,
      transition: 'opacity 0.2s ease'
    }}>
      <PullRing progress={progress} refreshing={refreshing} color={color} />
    </div>,
    document.body
  )
}

/**
 * Главная — Тренировки.
 *
 * Максимально тихий экран под сценарий «открыл → начал тренировку»:
 * заголовок + статус недели (закреп сверху) → карусель разделов с закреплённой
 * программой → компактная карточка-кнопка «История» (вся аналитика — на /history).
 */
export default function Home() {
  // Цвет акцентного свечения = текущий раздел карусели. Старт — из последнего
  // выбранного (тот же ключ, что в SectionCarousel), чтобы не мигнуло на загрузке.
  const [glowColor, setGlowColor] = useState(() => {
    const id = localGet('category-swiper-last')
    return (CATEGORY_META[id] || CATEGORY_META[CATEGORY_ORDER[0]]).color
  })
  const onSectionChange = useCallback((c) => { if (c?.color) setGlowColor(c.color) }, [])

  // Pull-to-refresh: оттягивание с самого верха → обновление страницы.
  const handleRefresh = useCallback(() => { window.location.reload() }, [])
  const { pull, refreshing } = usePullToRefresh(handleRefresh)

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Индикатор pull-to-refresh (портал в body, поверх нативного отскока). */}
      <PullIndicator pull={pull} refreshing={refreshing} color={glowColor} />

      {/* Заголовок экрана (fixed на линии кнопок Telegram). */}
      <div style={styles.topBlock}>
        <ScreenTitle>Тренировки</ScreenTitle>
      </div>

      {/* Скроллящийся контент: карусель разделов + карточка Истории. */}
      <div style={styles.scrollSection}>
        {/* Карусель разделов: свайп по разделам, внутри — закреплённая программа
            (Начать/Продолжить) + Все программы / Создать. Заголовка секции нет. */}
        <div style={{ marginTop: '4px' }}>
          <SectionCarousel onSectionChange={onSectionChange} />
        </div>

        <div style={{ marginTop: '20px' }}>
          <HistoryBlock />
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    // relative — база для абсолютного индикатора/слоёв.
    position: 'relative',
    paddingTop: 0,
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: '24px'
  },
  // Индикатор pull-to-refresh — по центру у верхней кромки (портал в body).
  pullIndicator: {
    position: 'fixed',
    top: 'var(--tg-safe-top)',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 60
  },
  // Только зелёная дуга — без фона/подложки/обводки.
  pullRing: {
    width: '26px',
    height: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Блок недели — в потоке (не закреплён). Верхний отступ = зона под кнопками Telegram.
  topBlock: {
    position: 'relative',
    zIndex: 1,
    paddingTop: 'var(--tg-safe-top)'
  },
  scrollSection: {
    position: 'relative',
    zIndex: 1
  },
  // === Блок «История» (вторичный, спокойнее блока раздела) ===
  histBlock: {
    width: '100%',
    padding: '14px 16px',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    cursor: 'pointer'
  },
  histHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  // Заголовок вторичного блока — спокойнее селектора раздела (60% белого).
  histTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: '0.2px'
  },
  // Селектор периода справа: «Неделя ▼».
  periodWrap: { position: 'relative' },
  periodBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '3px',
    padding: '4px 2px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700,
    color: 'var(--color-text)'
  },
  periodChev: { display: 'inline-flex', marginTop: '1px', transition: 'transform 0.2s var(--ease-ios)' },
  dropClose: { position: 'fixed', inset: 0, zIndex: 40 },
  periodDropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    zIndex: 41,
    minWidth: '140px',
    padding: '6px',
    background: 'var(--surface-raised)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-medium)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
    display: 'flex', flexDirection: 'column', gap: '2px'
  },
  periodItem: {
    display: 'flex', alignItems: 'center',
    width: '100%', padding: '9px 12px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-small)',
    cursor: 'pointer', textAlign: 'left'
  },
  periodItemText: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600 }
}
