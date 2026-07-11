import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import { localGet } from '../utils/storage'
import { getCurrentUser } from '../lib/auth'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { getCurrentWeekKey } from '../utils/dates'
import { pluralizeWorkouts } from '../utils/plural'
import { summarizeWorkouts, formatDuration, formatMeters } from '../utils/history'
import { EVENTS, on } from '../lib/events'
import SectionCarousel from '../components/SectionCarousel'
import StreakFlame from '../components/StreakFlame'
import ScreenTitle from '../components/ScreenTitle'
import ChevronIcon from '../components/ChevronIcon'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'

// Тренировок на этой неделе (weekly_streak = дни с тренировкой, 1 на день).
function readWeeklyCount() {
  const u = getCurrentUser()
  if (!u || u.weekly_streak_week !== getCurrentWeekKey()) return 0
  return u.weekly_streak || 0
}

// Компактная карточка-кнопка «История»: сводка за текущую неделю (серия +
// силовая/плавание). Тап открывает полноценный экран /history с календарём и
// статистикой. Детальная аналитика живёт только там — главная остаётся тихой.
function HistoryCard() {
  const navigate = useNavigate()
  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(200) || [])

  useEffect(() => {
    let cancelled = false
    const load = () => getRecentWorkouts(200).then(d => { if (!cancelled) setWorkouts(d || []) })
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  const week = summarizeWorkouts(workouts, 'week')
  const series = readWeeklyCount()

  const open = () => { haptic.light(); navigate('/history') }

  return (
    <button onClick={open} style={styles.historyCard} className="press-tile">
      <div style={styles.historyTop}>
        <span style={styles.historyTitle}><span style={styles.historyEmoji}>📅</span>История</span>
        <span style={styles.historyChev}><ChevronIcon size={16} color="var(--color-text-secondary)" /></span>
      </div>
      <div style={styles.historySub}>На этой неделе</div>

      {week.count === 0 ? (
        <div style={styles.historyEmptyLine}>Пока нет тренировок</div>
      ) : (
        <div style={styles.historyStats}>
          {series > 0 && (
            <span style={styles.historyStat}>
              <StreakFlame streak={series} />
              <span style={styles.historySeries}>×{series}</span>
            </span>
          )}
          {week.strengthCount > 0 && (
            <span style={styles.historyStat}>
              <span style={styles.historyStatEmoji}>🏋️</span>
              {week.strengthCount}<span style={styles.historyDot}>·</span>{formatDuration(week.strengthMin)}
            </span>
          )}
          {week.swimCount > 0 && (
            <span style={styles.historyStat}>
              <span style={styles.historyStatEmoji}>🏊</span>
              {week.swimCount}<span style={styles.historyDot}>·</span>{formatMeters(week.distance)}
            </span>
          )}
        </div>
      )}
    </button>
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

  // Живое обновление недельного статуса (профиль/тренировки меняются).
  const [, bumpTick] = useState(0)
  useEffect(() => {
    const bump = () => bumpTick(t => t + 1)
    const off1 = on(EVENTS.USER_CHANGED, bump)
    const off2 = on(EVENTS.USER_READY, bump)
    return () => { off1(); off2() }
  }, [])

  const weeklyCount = readWeeklyCount()

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Индикатор pull-to-refresh (портал в body, поверх нативного отскока). */}
      <PullIndicator pull={pull} refreshing={refreshing} color={glowColor} />

      {/* Блок недели — НЕ закреплён: листается вместе с контентом и уходит вверх
          под заголовок «Тренировки» (fixed на линии кнопок Telegram). */}
      <div style={styles.topBlock}>
        <ScreenTitle>Тренировки</ScreenTitle>

        {/* Статус недели в серой пилюле: огонёк-серия ×N + «тренировка»
            (или зовущая фраза при 0). Огонёк — тот же, что в профиле (по уровню). */}
        <div style={styles.weekStatusWrap}>
          <div style={styles.weekStatus}>
            {weeklyCount > 0 ? (
              <>
                <span>На этой неделе</span>
                <StreakFlame streak={weeklyCount} />
                <span style={styles.weekMult}>×{weeklyCount}</span>
                <span>{pluralizeWorkouts(weeklyCount)}</span>
              </>
            ) : (
              'Начни тренировку — стань лучшей версией себя'
            )}
          </div>
        </div>
      </div>

      {/* Скроллящийся контент: карусель разделов + карточка Истории. */}
      <div style={styles.scrollSection}>
        {/* Карусель разделов: свайп по разделам, внутри — закреплённая программа
            (Начать/Продолжить) + Все программы / Создать. Заголовка секции нет. */}
        <div style={{ marginTop: '4px' }}>
          <SectionCarousel onSectionChange={onSectionChange} />
        </div>

        <div style={{ marginTop: '20px' }}>
          <HistoryCard />
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
  // Статус недели — серая пилюля по центру экрана.
  weekStatusWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '2px',
    marginBottom: '10px'
  },
  weekStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    // Лёгкий чип (не закреплён — блюр не нужен).
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.2px'
  },
  weekMult: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '12px',
    color: '#FF8C42'
  },

  // === Карточка-кнопка «История» ===
  historyCard: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    padding: '14px 18px',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    textAlign: 'left',
    cursor: 'pointer'
  },
  historyTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  historyTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  historyEmoji: { fontSize: '15px', lineHeight: 1 },
  historyChev: { display: 'inline-flex', transform: 'rotate(-90deg)', opacity: 0.7 },
  historySub: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    marginTop: '3px'
  },
  historyStats: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '14px',
    marginTop: '10px'
  },
  historyStat: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  historyStatEmoji: { fontSize: '14px', lineHeight: 1 },
  historySeries: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '13px',
    color: '#FF8C42'
  },
  historyDot: { color: 'var(--color-text-secondary)', margin: '0 1px' },
  historyEmptyLine: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    marginTop: '10px'
  }
}
