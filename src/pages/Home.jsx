import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { localGet, localSet } from '../utils/storage'
import { getCurrentUser } from '../lib/auth'
import { getCurrentWeekKey } from '../utils/dates'
import { pluralizeWorkouts } from '../utils/plural'
import { EVENTS, on } from '../lib/events'
import SectionCarousel from '../components/SectionCarousel'
import DailyQuests from '../components/DailyQuests'
import HistoryCalendar from '../components/HistoryCalendar'
import StreakFlame from '../components/StreakFlame'
import ScreenTitle from '../components/ScreenTitle'
import SectionGlow from '../components/SectionGlow'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'

// Свёрнутость секций главной (Активности / История) — кросс-девайс через
// CloudStorage (+ локальный кеш для мгновенного старта). JSON-карта { key: true }.
const COLLAPSE_KEY = 'home-sections-collapsed'
function readCollapsedSync() {
  try { return JSON.parse(localGet(COLLAPSE_KEY) || '{}') || {} } catch { return {} }
}

// Тренировок на этой неделе (weekly_streak = дни с тренировкой, 1 на день).
function readWeeklyCount() {
  const u = getCurrentUser()
  if (!u || u.weekly_streak_week !== getCurrentWeekKey()) return 0
  return u.weekly_streak || 0
}

// Заголовок сворачиваемой секции — БЕЗ стрелки: тап по самому тексту сворачивает/
// разворачивает. Кнопка обнимает текст (не на всю ширину) — жмётся именно область слова.
function SectionToggle({ title, open, onToggle }) {
  return (
    <button onClick={onToggle} style={homeSectionStyles.toggleBtn}>
      <span style={homeSectionStyles.toggleTitle}>{title}</span>
      {/* Шеврон рядом с заголовком: вниз — свёрнуто, вверх — раскрыто. */}
      <span style={{ ...homeSectionStyles.toggleChev, transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
    </button>
  )
}

// Плавное сворачивание/разворачивание по высоте (grid-rows 0fr↔1fr, ~220мс).
// Контент внутри — overflow:hidden + min-height:0, иначе не сожмётся.
function Collapsible({ open, children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: open ? '1fr' : '0fr',
      opacity: open ? 1 : 0,
      transition: 'grid-template-rows 0.22s var(--ease-ios), opacity 0.22s ease'
    }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

const homeSectionStyles = {
  // Кнопка обнимает текст (width:auto, слева) — тап именно по слову-заголовку.
  toggleBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '5px', alignSelf: 'flex-start',
    padding: '0 4px', marginTop: '20px', marginBottom: '12px',
    background: 'transparent', border: 'none', cursor: 'pointer'
  },
  // Заголовок секции: обычный регистр (Первая заглавная), manrope 700, 60% белого,
  // без капса и трекинга — виден, но не спорит с названиями программ/карточками.
  toggleTitle: {
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '15px',
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px'
  },
  // Шеврон рядом с заголовком (близко, через маленький gap).
  toggleChev: {
    fontSize: '14px', lineHeight: 1, marginTop: '-2px',
    color: 'rgba(255, 255, 255, 0.45)',
    transition: 'transform 0.2s var(--ease-ios)'
  }
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
 * Структура: заголовок + неделя (закреп сверху) → КАРУСЕЛЬ РАЗДЕЛОВ → Активности → История.
 * Активности и История сворачиваются тапом по заголовку (шеврон справа),
 * состояние кросс-девайс (CloudStorage, ключ home-sections-collapsed).
 * Дневной буст (DailyQuests) продублирован здесь и в Профиле.
 *
 * Избранное: карусель программ, листается СВАЙПОМ влево/вправо (с вибро),
 * снизу точки-индикаторы. Последняя пролистанная карточка запоминается
 * (localStorage + Telegram CloudStorage).
 */
export default function Home() {
  // Свёрнутость секций (АКТИВНОСТИ / ИСТОРИЯ): старт из локального кеша,
  // догоняем из облака. true = свёрнуто.
  const [collapsed, setCollapsed] = useState(readCollapsedSync)

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

  useEffect(() => {
    let cancelled = false
    cloudGet(COLLAPSE_KEY).then(v => {
      if (cancelled || !v) return
      try { setCollapsed(JSON.parse(v) || {}) } catch { /* ignore */ }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const setCollapse = (key, value) => {
    haptic.light()
    setCollapsed(prev => {
      const next = { ...prev, [key]: value }
      localSet(COLLAPSE_KEY, JSON.stringify(next))
      cloudSet(COLLAPSE_KEY, JSON.stringify(next))
      return next
    })
  }

  // Живое обновление недельного статуса и сводки буста (профиль/квесты меняются).
  const [, bumpTick] = useState(0)
  useEffect(() => {
    const bump = () => bumpTick(t => t + 1)
    const off1 = on(EVENTS.USER_CHANGED, bump)
    const off2 = on(EVENTS.USER_READY, bump)
    return () => { off1(); off2() }
  }, [])

  // Дневной буст — по умолчанию свёрнут (компактно); История — раскрыта.
  const boostCollapsed = collapsed.boost !== false
  const historyCollapsed = !!collapsed.history // по умолчанию раскрыта
  const weeklyCount = readWeeklyCount()

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Индикатор pull-to-refresh (портал в body, поверх нативного отскока). */}
      <PullIndicator pull={pull} refreshing={refreshing} color={glowColor} />

      {/* Акцентное свечение фона в цвет текущего раздела — уходит вверх при скролле. */}
      <SectionGlow color={glowColor} />

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

      {/* Скроллящийся контент: карусель разделов (вместо избранного) + активности + история. */}
      <div style={styles.scrollSection}>
        {/* Карусель разделов: свайп по разделам, внутри — закреплённая программа
            (Начать/Продолжить) + Все программы / Создать. Заголовка секции нет. */}
        <div style={{ marginTop: '4px' }}>
          <SectionCarousel onSectionChange={onSectionChange} />
        </div>

        {/* Активности — просто заголовок (без статуса N/3), всё внутри карточки. */}
        <SectionToggle
          title="Активности"
          open={!boostCollapsed}
          onToggle={() => setCollapse('boost', !boostCollapsed)}
        />
        <Collapsible open={!boostCollapsed}><DailyQuests /></Collapsible>

        {/* История — сворачиваемый календарь (как Разделы/Активности) */}
        <SectionToggle
          title="История"
          open={!historyCollapsed}
          onToggle={() => setCollapse('history', !historyCollapsed)}
        />
        <Collapsible open={!historyCollapsed}><HistoryCalendar /></Collapsible>
      </div>
    </div>
  )
}

const styles = {
  page: {
    // relative — база для абсолютного свечения (glowWrap).
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
  // Блок недели — над свечением, в потоке (не закреплён). Верхний отступ = зона
  // под кнопками Telegram.
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
    // Лёгкий чип поверх акцентного свечения (не закреплён — блюр не нужен).
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
  }
}
