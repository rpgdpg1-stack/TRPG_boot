import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import { getRecentWorkouts } from '../lib/storage'
import { HISTORY_FETCH_LIMIT } from '../utils/history'
import { EVENTS, emit, on } from '../lib/events'
import { getCurrentUser } from '../lib/auth'
import { cacheInvalidate } from '../lib/cache'
import { resolveWeeklyStreak } from '../utils/dates'
import SectionCarousel from '../components/SectionCarousel'
import ScreenTitle from '../components/ScreenTitle'
import HomeCards from '../components/HomeCards'
import StreakFlame from '../components/StreakFlame'

// Тонкая инфо-плашка под заголовком: недельный стрик. Лёгкий фон, без тени —
// строка-информер, не карточка.
function pluralTraining(n) {
  const d = n % 10, dd = n % 100
  if (d === 1 && dd !== 11) return 'тренировка'
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return 'тренировки'
  return 'тренировок'
}

function WeekStrip() {
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  useEffect(() => {
    const upd = () => {
      const u = getCurrentUser()
      setStreak(resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week))
    }
    const off = on(EVENTS.USER_CHANGED, upd)
    const off2 = on(EVENTS.USER_READY, upd)
    return () => { off(); off2() }
  }, [])

  // Формат один на все состояния: «На этой неделе 🔥 3 тренировки».
  // Ноль — та же строка с серым огоньком и «0 тренировок».
  const hasStreak = streak >= 1
  return (
    <div style={stripStyles.strip}>
      <span style={stripStyles.label}>На этой неделе</span>
      {/* Огонёк и ×N — одной группой, вплотную (счётчик принадлежит огоньку). */}
      <span style={stripStyles.flameGroup}>
        <span style={hasStreak ? undefined : stripStyles.greyFlame}>
          <StreakFlame streak={streak} />
        </span>
        <span style={{ ...stripStyles.count, ...(hasStreak ? null : stripStyles.countZero) }}>
          {streak}
        </span>
      </span>
      <span style={stripStyles.label}>{pluralTraining(streak)}</span>
    </div>
  )
}

const stripStyles = {
  strip: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
    // Отступ до блока раздела — как от блока раздела до «Мой прогресс» (26px).
    // Фона-пилюли нет: это строка-информер, а не карточка.
    minHeight: '34px', padding: '0 14px', marginBottom: '26px'
  },
  label: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' },
  // Огонёк + цифра — вплотную (3px), как единый значок серии. Тот же вид в профиле.
  // Крестика «×» нет — только цифра.
  flameGroup: { display: 'inline-flex', alignItems: 'center', gap: '3px' },
  count: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '17px', color: '#FF8C42', letterSpacing: '0.5px' },
  // 0 — серым (как негорящий огонёк), ≥1 — оранжевым.
  countZero: { color: 'rgba(255, 255, 255, 0.4)' },
  greyFlame: { display: 'inline-flex', opacity: 0.6, filter: 'grayscale(1)' }
}

// Порог оттягивания (px) для срабатывания обновления и максимум демпфированного хода.
// PTR_REVEAL — «мёртвая зона»: сперва тянется невидимый верх, кольцо появляется только
// после неё (как в Instagram/Telegram), дальше заполняется до порога. Зона большая
// намеренно: при листании карусели палец часто уводит чуть вниз — кольцо не должно
// выскакивать от такого. PTR_AXIS — если жест горизонтальный, pull вообще не начинаем.
const PTR_REVEAL = 34
const PTR_THRESH = 100
const PTR_MAX = 160
const PTR_AXIS = 8

// Pull-to-refresh: НЕ двигаем контент и НЕ блокируем жест — верх тянет нативный
// отскок (резинка), а мы лишь считаем ход пальца и рисуем кольцо поверх в этой зоне.
// На пороге микровибро (armed), отпустил за порогом → success-вибро и обновление.
function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const startX = useRef(0)
  const armed = useRef(false)

  useEffect(() => {
    const scrollTop = () => window.scrollY || document.scrollingElement?.scrollTop || 0
    const onStart = (e) => {
      if (refreshing) return
      startY.current = scrollTop() <= 0 ? e.touches[0].clientY : null
      startX.current = e.touches[0].clientX
      armed.current = false
    }
    const onMove = (e) => {
      if (startY.current == null || refreshing) return
      if (scrollTop() > 0) { startY.current = null; setPull(0); return }
      const dy = e.touches[0].clientY - startY.current
      const dx = e.touches[0].clientX - startX.current
      // Листание карусели (горизонталь) — не pull: жест бросаем до конца касания.
      if (Math.abs(dx) > PTR_AXIS && Math.abs(dx) > Math.abs(dy)) {
        startY.current = null
        setPull(0)
        return
      }
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
        // Дать увидеть заполнение + вибро, затем обновить данные (без reload) и
        // сбросить индикатор, когда обновление завершилось.
        setTimeout(() => {
          Promise.resolve(onRefresh()).finally(() => { setRefreshing(false); setPull(0) })
        }, 500)
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
      // Появляется у верхней кромки и тянется вниз по ходу оттяга.
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
 * заголовок → карусель разделов с закреплённой программой (Начать/Продолжить) →
 * компактная карточка-кнопка «Статистика» (вся аналитика — на /history).
 */
export default function Home() {
  // Pull-to-refresh: оттягивание с самого верха → обновление ДАННЫХ (не reload,
  // чтобы не ре-инициализировать Telegram SDK и не мигать белым). Сбрасываем кеш
  // последних тренировок и шлём USER_CHANGED — HistoryBlock/карточки перечитаются.
  const handleRefresh = useCallback(async () => {
    cacheInvalidate('recent-workouts:')
    await getRecentWorkouts(HISTORY_FETCH_LIMIT).catch(() => {})
    emit(EVENTS.USER_CHANGED, getCurrentUser())
  }, [])
  const { pull, refreshing } = usePullToRefresh(handleRefresh)

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Индикатор pull-to-refresh (портал в body, поверх нативного отскока).
          Цвет всегда акцентный зелёный — не зависит от раздела. */}
      <PullIndicator pull={pull} refreshing={refreshing} color="var(--color-primary)" />

      {/* Заголовок экрана (fixed на линии кнопок Telegram). */}
      <div style={styles.topBlock}>
        <ScreenTitle>Тренировки</ScreenTitle>
      </div>

      {/* Скроллящийся контент: инфо-плашка недели + карусель разделов + карточки. */}
      <div style={styles.scrollSection}>
        <div style={{ marginTop: '4px' }}>
          <WeekStrip />
        </div>

        {/* Карусель разделов: свайп по разделам, внутри — закреплённая программа
            (Начать/Продолжить) + Все программы / Создать. Заголовка секции нет. */}
        <SectionCarousel />

        {/* Второй план: карточки-входы. Заголовка-обёртки нет — карточки
            подписаны сами, а заголовок только ел первый экран. */}
        <div style={{ marginTop: '20px' }}>
          <HomeCards />
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
  // Заголовок экрана — в потоке. Верхний отступ = зона под кнопками Telegram.
  topBlock: {
    position: 'relative',
    zIndex: 1,
    paddingTop: 'var(--tg-safe-top)'
  },
  scrollSection: {
    position: 'relative',
    zIndex: 1
  }
}
