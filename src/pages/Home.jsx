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
function SectionToggle({ title, onToggle }) {
  return (
    <button onClick={onToggle} style={homeSectionStyles.toggleBtn}>
      <span style={homeSectionStyles.toggleTitle}>{title}</span>
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
    display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
    padding: '0 4px', marginTop: '20px', marginBottom: '12px',
    background: 'transparent', border: 'none', cursor: 'pointer'
  },
  // Заголовок секции: обычный регистр (Первая заглавная), manrope 700, 60% белого,
  // без капса и трекинга — виден, но не спорит с названиями программ/карточками.
  toggleTitle: {
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '15px',
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px'
  }
}

// Акцентное свечение фона в цвет текущего раздела: радиальный glow у верхней
// кромки (по центру) + мягкий tinted-градиент, растворяющийся к контенту. Всё
// приглушённо — «сияние», а не заливка. Цвет из токена раздела (cat.color).
//
// Координаты в px внутри glowWrap: верх экрана = y 600 (сверху ещё 600px «запаса»
// одного цвета — чтобы при оттягивании вниз/оверскролле не было жёсткой линии, а
// продолжался тот же тон, не ярче). Радиальный пик — ровно на кромке экрана (600).
const glowBg = (c) => `
  radial-gradient(130% 300px at 50% 600px,
    color-mix(in srgb, ${c} 22%, transparent) 0%,
    color-mix(in srgb, ${c} 8%, transparent) 45%,
    transparent 100%),
  linear-gradient(to bottom,
    color-mix(in srgb, ${c} 9%, transparent) 0px,
    color-mix(in srgb, ${c} 9%, transparent) 600px,
    color-mix(in srgb, ${c} 5%, transparent) 780px,
    transparent 1080px)`

// Два слоя — при смене раздела новый цвет плавно проявляется поверх старого
// (кросс-фейд ~360мс, как заезд иконки в карусели).
function SectionGlow({ color }) {
  const [g, setG] = useState({ a: color, b: color, showA: true })
  const first = useRef(true) // пропускаем первый эффект (стартовый цвет уже показан)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setG(prev => prev.showA
      ? { ...prev, b: color, showA: false }
      : { ...prev, a: color, showA: true })
  }, [color])

  return (
    <div style={styles.glowWrap} aria-hidden="true">
      <div style={{ ...styles.glowLayer, background: glowBg(g.a), opacity: g.showA ? 1 : 0 }} />
      <div style={{ ...styles.glowLayer, background: glowBg(g.b), opacity: g.showA ? 0 : 1 }} />
    </div>
  )
}

// Порог оттягивания (px) для срабатывания обновления и максимум демпфированного хода.
const PTR_THRESH = 70
const PTR_MAX = 120

// Pull-to-refresh: тянем страницу вниз с самого верха — индикатор-кружок
// заполняется; на пороге микровибро (armed), отпустил за порогом → success-вибро
// и обновление. Слушатели на window (passive:false для preventDefault на оттяге).
function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [snap, setSnap] = useState(false) // true → пружинистый возврат с transition
  const startY = useRef(null)
  const armed = useRef(false)

  useEffect(() => {
    const scrollTop = () => window.scrollY || document.scrollingElement?.scrollTop || 0
    const onStart = (e) => {
      if (refreshing) return
      if (scrollTop() > 0) { startY.current = null; return }
      startY.current = e.touches[0].clientY
      armed.current = false
      setSnap(false)
    }
    const onMove = (e) => {
      if (startY.current == null || refreshing) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { setPull(0); return }
      if (scrollTop() > 0) { startY.current = null; setPull(0); return }
      e.preventDefault() // держим свой индикатор вместо нативного оверскролла
      const damped = Math.min(PTR_MAX, dy * 0.5)
      setPull(damped)
      const nowArmed = damped >= PTR_THRESH
      if (nowArmed && !armed.current) { armed.current = true; haptic.rigid() }
      else if (!nowArmed && armed.current) armed.current = false
    }
    const onEnd = () => {
      if (startY.current == null) return
      startY.current = null
      setSnap(true)
      if (armed.current && !refreshing) {
        setRefreshing(true)
        setPull(PTR_THRESH)
        haptic.success()
        setTimeout(() => onRefresh(), 420) // дать увидеть заполнение + вибро
      } else {
        setPull(0)
      }
      armed.current = false
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshing, onRefresh])

  return { pull, refreshing, snap }
}

// Кружок-индикатор: трек + дуга, заполняется по progress; в refreshing — крутится.
function PullRing({ progress, refreshing, color }) {
  const R = 10
  const C = 2 * Math.PI * R
  const p = Math.min(1, Math.max(0, progress))
  return (
    <div className={refreshing ? 'ptr-spin' : undefined} style={styles.pullRing}>
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.4" />
        <circle
          cx="13" cy="13" r={R} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={refreshing ? C * 0.72 : C * (1 - p)}
          transform="rotate(-90 13 13)"
        />
      </svg>
    </div>
  )
}

// Индикатор через портал в body — не попадает под transform страницы (иначе поехал бы).
function PullIndicator({ pull, refreshing, color }) {
  const shown = pull > 1 || refreshing
  const y = (refreshing ? PTR_THRESH : pull) - 30
  return createPortal(
    <div aria-hidden="true" style={{
      ...styles.pullIndicator,
      opacity: shown ? 1 : 0,
      transform: `translateY(${y}px)`,
      transition: 'opacity 0.2s ease'
    }}>
      <PullRing progress={pull / PTR_THRESH} refreshing={refreshing} color={color} />
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
  const { pull, refreshing, snap } = usePullToRefresh(handleRefresh)

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
    <div
      className="page page-fade"
      style={{
        ...styles.page,
        // Оттягивание вниз — весь контент едет за пальцем; свечение (с запасом сверху)
        // заполняет открывшуюся область тем же цветом.
        transform: pull ? `translateY(${pull}px)` : undefined,
        transition: snap ? 'transform 0.32s var(--ease-ios)' : 'none'
      }}
    >
      {/* Индикатор pull-to-refresh (портал в body, поверх контента). */}
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
          onToggle={() => setCollapse('boost', !boostCollapsed)}
        />
        <Collapsible open={!boostCollapsed}><DailyQuests /></Collapsible>

        {/* История — сворачиваемый календарь (как Разделы/Активности) */}
        <SectionToggle
          title="История"
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
  // Свечение фона: у верхней кромки страницы, за контентом (zIndex 0). Своя высота +
  // overflow — свечение живёт только вверху и растворяется к контенту.
  glowWrap: {
    position: 'absolute',
    // Начинается на 600px ВЫШЕ страницы — этот «запас» одного тона закрывает
    // область оверскролла/оттягивания (тот же цвет продолжается вверх, без линии).
    top: '-600px',
    left: 0,
    right: 0,
    height: '1120px',
    pointerEvents: 'none',
    zIndex: 0,
    overflow: 'hidden'
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
  pullRing: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: 'rgba(28, 28, 30, 0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  glowLayer: {
    position: 'absolute',
    inset: 0,
    transition: 'opacity 0.36s ease'
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
