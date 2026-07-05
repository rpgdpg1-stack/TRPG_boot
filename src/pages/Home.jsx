import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import { getActiveDay, loadFavoritesEntries, getFavoritesEntriesSync, toggleFavoriteProgram } from '../lib/storage'
import { getProgramBySlug } from '../features/programs/registry'
import { CATEGORY_META } from '../features/programs/categories'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { localGet, localSet } from '../utils/storage'
import { getCurrentUser } from '../lib/auth'
import { getCurrentWeekKey } from '../utils/dates'
import { pluralizeWorkouts } from '../utils/plural'
import { EVENTS, on } from '../lib/events'
import ProgramCard from '../components/ProgramCard'
import FavHint from '../components/FavHint'
import CategorySwiper from '../components/CategorySwiper'
import DailyQuests, { getDailyBoostSummarySync } from '../components/DailyQuests'
import StreakFlame from '../components/StreakFlame'
import ScreenTitle from '../components/ScreenTitle'

// Ключ последней пролистанной избранной программы (синкается между устройствами)
const FAV_LAST_SLUG_KEY = 'fav-last-slug'

// Свёрнутость секций главной (РАЗДЕЛЫ / ДНЕВНОЙ БУСТ) — кросс-девайс через
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

// Заголовок секции с шевроном справа — тап сворачивает/разворачивает.
function SectionToggle({ title, collapsed, onToggle, centered = false }) {
  return (
    <button onClick={onToggle} style={{ ...homeSectionStyles.toggleBtn, ...(centered ? homeSectionStyles.toggleBtnCentered : null) }}>
      <span style={homeSectionStyles.toggleTitle}>{title}</span>
      <span style={centered ? homeSectionStyles.chevronAbs : undefined}>
        <HomeChevron collapsed={collapsed} />
      </span>
    </button>
  )
}

// Шеврон: вниз = свёрнуто, вверх (rotate 180) = раскрыто.
function HomeChevron({ collapsed }) {
  return (
    <span style={{
      display: 'inline-flex',
      transition: 'transform 0.25s var(--ease-ios)',
      transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)'
    }}>
      <svg width="14" height="8" viewBox="0 0 14 8" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1 L7 6 L13 1" fill="none" stroke="var(--color-text-secondary)"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const homeSectionStyles = {
  toggleBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '0 4px', marginTop: '20px', marginBottom: '12px',
    background: 'transparent', border: 'none', cursor: 'pointer'
  },
  toggleTitle: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px',
    color: 'var(--color-text-secondary)', letterSpacing: '3px'
  },
  // Центрированный заголовок раздела (РАЗДЕЛЫ над свайпером): текст по центру,
  // шеврон сворачивания — абсолютно справа, чтобы не сдвигал центр.
  toggleBtnCentered: { justifyContent: 'center', position: 'relative' },
  chevronAbs: { position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', display: 'inline-flex' }
}

// Синхронная сборка избранного из localStorage для мгновенного первого рендера.
function buildFavSync(slug, activeDay) {
  const prog = getProgramBySlug(slug)
  if (!prog) return null
  return { prog, activeDay }
}

// Найти индекс избранного по сохранённому slug. -1 → 0.
function indexBySlug(entries, slug) {
  if (!slug) return 0
  const i = entries.findIndex(e => e.prog.slug === slug)
  return i >= 0 ? i : 0
}

/**
 * Главная — Тренировки.
 *
 * Структура: ИЗБРАННОЕ (закреплено сверху) → РАЗДЕЛЫ → ДНЕВНОЙ БУСТ.
 * РАЗДЕЛЫ и ДНЕВНОЙ БУСТ сворачиваются тапом по заголовку (шеврон справа),
 * состояние кросс-девайс (CloudStorage, ключ home-sections-collapsed).
 * Дневной буст (DailyQuests) продублирован здесь и в Профиле.
 *
 * Избранное: карусель программ, листается СВАЙПОМ влево/вправо (с вибро),
 * снизу точки-индикаторы. Последняя пролистанная карточка запоминается
 * (localStorage + Telegram CloudStorage).
 */
export default function Home() {
  const navigate = useNavigate()

  const initialFavs = getFavoritesEntriesSync(buildFavSync) || []
  const savedSlug = localGet(FAV_LAST_SLUG_KEY)

  const [favorites, setFavorites] = useState(initialFavs)
  const [favIdx, setFavIdx] = useState(() => indexBySlug(initialFavs, savedSlug))
  const [favLoaded, setFavLoaded] = useState(() => getFavoritesEntriesSync(buildFavSync) !== null)

  // Состояние свайпа: стартовая X и флаг "только что свайпнули".
  const swipeRef = useRef({ x: null, swiped: false })

  // Направление лёгкой анимации заезда карточки избранного при смене слайда.
  const [slideDir, setSlideDir] = useState(null)

  // Свёрнутость секций (РАЗДЕЛЫ / ДНЕВНОЙ БУСТ): старт из локального кеша,
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

  // Разделы — по умолчанию раскрыты; Дневной буст — по умолчанию свёрнут (компактно).
  const sectionsCollapsed = !!collapsed.sections
  const boostCollapsed = collapsed.boost !== false
  const weeklyCount = readWeeklyCount()
  const boost = getDailyBoostSummarySync()

  // Фоновое обновление избранного (вдруг менялось с другого устройства).
  useEffect(() => {
    let cancelled = false
    loadFavoritesEntries(async (slug) => {
      const prog = getProgramBySlug(slug)
      if (!prog) return null
      const activeDay = await getActiveDay(slug)
      return { prog, activeDay }
    }).then(async entries => {
      if (cancelled) return
      setFavorites(entries)
      let slug = null
      try { slug = await cloudGet(FAV_LAST_SLUG_KEY) } catch { /* ignore */ }
      if (!slug) slug = localGet(FAV_LAST_SLUG_KEY)
      const idx = indexBySlug(entries, slug)
      if (!cancelled) {
        setFavIdx(Math.min(idx, Math.max(0, entries.length - 1)))
        setFavLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [])

  // Перейти к слайду i и запомнить его slug (локально + в облако).
  const goFav = (i, dir) => {
    if (dir) setSlideDir(dir)
    setFavIdx(i)
    const slug = favorites[i]?.prog?.slug
    if (slug) {
      localSet(FAV_LAST_SLUG_KEY, slug)
      cloudSet(FAV_LAST_SLUG_KEY, slug)
    }
  }

  const handleFavTouchStart = (e) => {
    swipeRef.current.x = e.touches[0].clientX
    swipeRef.current.swiped = false
  }

  const handleFavTouchEnd = (e) => {
    const startX = swipeRef.current.x
    swipeRef.current.x = null
    if (startX === null || favorites.length < 2) return

    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) < 50) return // это тап, не свайп

    swipeRef.current.swiped = true
    haptic.light()
    if (dx < 0) {
      goFav((favIdx + 1) % favorites.length, 'right')
    } else {
      goFav((favIdx - 1 + favorites.length) % favorites.length, 'left')
    }
    setTimeout(() => { swipeRef.current.swiped = false }, 120)
  }

  const handleFavOpen = () => {
    if (swipeRef.current.swiped) return
    haptic.light()
    const fav = favorites[favIdx]
    if (!fav) return
    if (fav.prog.kind === 'swim') {
      setTimeout(() => navigate(`/swim/${fav.prog.slug}`, { state: { fromHome: true } }), 80)
      return
    }
    const firstDay = fav.prog.data?.days ? Object.keys(fav.prog.data.days)[0] : 'A'
    const day = fav.activeDay || firstDay
    setTimeout(() => navigate(`/workout/${fav.prog.slug}/${day}`, { state: { fromHome: true } }), 80)
  }

  // Перезагрузка избранного (после тоггла/удаления из меню карточки).
  const reloadFavs = async () => {
    const entries = await loadFavoritesEntries(async (slug) => {
      const prog = getProgramBySlug(slug)
      if (!prog) return null
      const activeDay = await getActiveDay(slug)
      return { prog, activeDay }
    })
    let slug = null
    try { slug = await cloudGet(FAV_LAST_SLUG_KEY) } catch { /* ignore */ }
    if (!slug) slug = localGet(FAV_LAST_SLUG_KEY)
    const idx = indexBySlug(entries, slug)
    setFavIdx(entries.length ? Math.min(Math.max(idx, 0), entries.length - 1) : 0)
    setFavorites(entries)
    setFavLoaded(true)
  }

  const handleHomeFavToggle = async () => {
    const fav = favorites[favIdx]
    if (!fav) return
    await toggleFavoriteProgram(fav.prog.category, fav.prog.slug)
    await reloadFavs()
  }

  // Индекс карусели, зажатый в границы.
  const favSafeIdx = favorites.length ? Math.min(Math.max(favIdx, 0), favorites.length - 1) : 0
  // Цвет раздела текущей избранной карточки — им красим активную точку-индикатор.
  const favAccent = favorites[favSafeIdx]?.prog
    ? (CATEGORY_META[favorites[favSafeIdx].prog.category]?.color || 'var(--color-primary)')
    : 'var(--color-primary)'

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

        {/* ИЗБРАННОЕ — заголовок-label (не кликается) + «Все ›» справа. */}
        <div style={styles.favHeaderRow}>
          <span style={{ ...styles.sectionHeader, marginTop: 0, marginBottom: 0, paddingLeft: 0 }}>ИЗБРАННОЕ</span>
          <button onClick={() => { haptic.light(); navigate('/favorites') }} style={styles.seeAllBtn}>
            Все ›
          </button>
        </div>

        {!favLoaded ? (
          <div style={styles.favSkeleton} />
        ) : favorites.length === 0 ? (
          <button
            onClick={() => { haptic.light(); navigate('/favorites') }}
            className="press-tile"
            style={styles.favEmpty}
          >
            <span style={styles.favEmptyText}>
              Добавь в избранное программу внутри раздела — она появится здесь
            </span>
            <FavHint />
          </button>
        ) : (
          <div style={styles.favSlider}>
            <div
              onTouchStart={handleFavTouchStart}
              onTouchEnd={handleFavTouchEnd}
              style={styles.favSwipeArea}
            >
              <div
                key={favSafeIdx}
                className={slideDir === 'right' ? 'hslide-in-right' : slideDir === 'left' ? 'hslide-in-left' : undefined}
              >
                <ProgramCard
                  prog={favorites[favSafeIdx].prog}
                  glow
                  dots
                  lastTrained
                  isFav
                  onToggleFav={handleHomeFavToggle}
                  onOpen={handleFavOpen}
                  onDeleted={reloadFavs}
                />
              </div>
            </div>
            {favorites.length > 1 && (
              <div style={styles.favDots}>
                {favorites.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { haptic.light(); goFav(i, i > favIdx ? 'right' : 'left') }}
                    style={{
                      ...styles.favDot,
                      background: i === favIdx ? favAccent : 'rgba(255,255,255,0.2)',
                      width: i === favIdx ? '16px' : '6px'
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fade-scrim: контент уходит под закреплённый блок плавно. */}
        <div style={styles.stickyFade} aria-hidden="true" />
      </div>

      {/* Скроллящийся контент: разделы + дневной буст (обе секции сворачиваются) */}
      <div style={styles.scrollSection}>
        <SectionToggle
          title="РАЗДЕЛЫ"
          collapsed={sectionsCollapsed}
          onToggle={() => setCollapse('sections', !sectionsCollapsed)}
          centered
        />
        {!sectionsCollapsed && <CategorySwiper />}

        {/* Дневной буст — компактно: в заголовке прогресс N/3 · +N💪, разворачивается по тапу. */}
        <SectionToggle
          title={
            <span style={styles.boostTitle}>
              ДНЕВНОЙ БУСТ
              {boost.total > 0 && (
                <span style={styles.boostBadge}>
                  {boost.done}/{boost.total}{boost.remainingReward > 0 ? ` · +${boost.remainingReward}💪` : ' ✓'}
                </span>
              )}
            </span>
          }
          collapsed={boostCollapsed}
          onToggle={() => setCollapse('boost', !boostCollapsed)}
        />
        {!boostCollapsed && <DailyQuests />}
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
    background: 'var(--color-bg)',
    // Верхний край блока — ровно 16px ниже кнопок Telegram (зашито в var).
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: 0,
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  stickyFade: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: '28px',
    pointerEvents: 'none',
    zIndex: 19,
    background: 'linear-gradient(to bottom, var(--color-bg) 0%, rgba(13, 12, 12, 0.7) 35%, rgba(13, 12, 12, 0) 100%)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    maskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)'
  },
  scrollSection: {
    position: 'relative'
  },
  sectionHeader: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    marginTop: '20px',
    marginBottom: '12px',
    paddingLeft: '4px'
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
  },
  // Строка заголовка ИЗБРАННОЕ: label слева, «Все ›» справа.
  favHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
    marginBottom: '12px',
    paddingLeft: '4px'
  },
  seeAllBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    padding: '2px 4px'
  },
  // Заголовок Дневного буста со сводкой.
  boostTitle: { display: 'inline-flex', alignItems: 'center', gap: '10px' },
  boostBadge: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '12px',
    letterSpacing: '0.5px',
    color: 'var(--color-primary)'
  },
  favEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    minHeight: '130px',
    padding: '10px 18px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 'var(--radius-card)',
    cursor: 'pointer'
  },
  favEmptyText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    maxWidth: '264px'
  },
  favSkeleton: {
    minHeight: '130px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    opacity: 0.4
  },
  favSlider: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  favSwipeArea: {
    touchAction: 'pan-y'
  },
  favDots: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px'
  },
  favDot: {
    height: '6px',
    borderRadius: '3px',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    transition: 'width 0.25s ease, background 0.25s ease'
  }
}
