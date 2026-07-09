import { useEffect, useState } from 'react'
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

      {/* Заголовок экрана + избранное — закреплено сверху (sticky). */}
      <div style={styles.playerSticky}>
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
          <SectionCarousel />
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
    paddingTop: 0,
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: '24px'
  },
  playerSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    // Матовое стекло — как шапка дня тренировок: контент скроллится под баром и
    // просвечивает размытым. Без сплошного фона и БЕЗ затемняющего скрима снизу —
    // только тонкая нижняя нитка, чтобы край стекла читался.
    background: 'rgba(28, 28, 30, 0.55)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    // Верхний край блока — ровно 16px ниже кнопок Telegram (зашито в var).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: 0,
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  scrollSection: {
    position: 'relative'
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
    padding: '5px 14px',
    background: 'rgba(255, 255, 255, 0.05)',
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
