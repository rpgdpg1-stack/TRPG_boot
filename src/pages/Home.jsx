import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import PlayerCard from '../components/PlayerCard'
import DailyQuests from '../components/DailyQuests'
import { getActiveDay, loadFavoritesEntries, getFavoritesEntriesSync, getRecentWorkouts } from '../lib/storage'
import { getProgramBySlug } from '../features/programs/registry'
import { CATEGORY_META } from '../features/programs/categories'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { localGet, localSet } from '../utils/storage'
import { EVENTS, on } from '../lib/events'
import { readHomeLayout, loadHomeLayoutFromCloud } from '../lib/home-layout'
import PixelHeart from '../components/PixelHeart'
import HistoryRow from '../components/HistoryRow'
import FriendsBlock from '../components/FriendsBlock'
import CategoryList from '../components/CategoryList'
import FavCardBody from '../components/FavCardBody'

// Ключ последней пролистанной избранной программы (синкается между устройствами)
const FAV_LAST_SLUG_KEY = 'fav-last-slug'

// Заголовок секции. Если задан onTap — кликабельный (ведёт на страницу секции),
// без стрелок и прочих символов — просто текст-заголовок.
function SectionHeader({ title, onTap }) {
  if (!onTap) {
    return <div style={homeSectionStyles.header}>{title}</div>
  }
  return (
    <button onClick={onTap} style={homeSectionStyles.headerBtn}>{title}</button>
  )
}

const homeSectionStyles = {
  header: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px',
    color: 'var(--color-text-secondary)', letterSpacing: '3px',
    marginTop: '20px', marginBottom: '12px', paddingLeft: '4px'
  },
  headerBtn: {
    display: 'block', width: '100%', textAlign: 'left', padding: '0 4px',
    marginTop: '20px', marginBottom: '12px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px',
    color: 'var(--color-text-secondary)', letterSpacing: '3px'
  }
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
 * Порядок: Игрок (закреплён) → Избранное (закреплено) → управляемые секции.
 *
 * Управляемые секции (Разделы / История / Дневной буст) — порядок и видимость
 * задаются в настройках «Отображение на главной» (lib/home-layout, синк через
 * CloudStorage). Тап по заголовку Истории ведёт на /history.
 *
 * Избранное: карусель программ. Листается СВАЙПОМ влево/вправо (с вибро),
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

  // Стартуем из localStorage-кеша, чтобы блок истории не мигал пустым →
  // заполненным при заходе и перелистывании страниц (как сделано в профиле).
  const [history, setHistory] = useState(() => {
    try {
      const raw = localGet('home-recent-workouts')
      const parsed = raw ? JSON.parse(raw) : null
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })
  // Загрузилась ли история хоть раз (чтобы не мигал пустой блок при первом
  // запуске когда кеша ещё нет). null-кеш → ждём загрузку, не показываем пусто.
  const [historyLoaded, setHistoryLoaded] = useState(() => {
    return localGet('home-recent-workouts') !== null
  })

  // Конфиг отображения секций (порядок + видимость). Старт из localStorage, облако догонит.
  const [layout, setLayout] = useState(readHomeLayout)

  // Состояние свайпа: стартовая X и флаг "только что свайпнули".
  const swipeRef = useRef({ x: null, swiped: false })

  // Направление лёгкой анимации заезда карточки избранного при смене слайда
  // ('right' — заезд справа, 'left' — слева). null до первого переключения.
  const [slideDir, setSlideDir] = useState(null)

  // Подтянуть конфиг из облака (вдруг менял в настройках с другого устройства).
  useEffect(() => {
    let cancelled = false
    loadHomeLayoutFromCloud().then(cloud => {
      if (!cancelled && cloud) setLayout(cloud)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.hide()
    lockVerticalSwipes()
  }, [])

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

  // История: превью 3 шт. Обновляем при изменении юзера (после завершения тренировки).
  // Результат кешируем в localStorage — при следующем заходе стартуем из него
  // без мигания пустого блока.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      getRecentWorkouts(3).then(data => {
        if (cancelled) return
        const list = data || []
        setHistory(list)
        setHistoryLoaded(true)
        localSet('home-recent-workouts', JSON.stringify(list))
      })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  // Перейти к слайду i и запомнить его slug (локально + в облако).
  // dir — направление анимации заезда ('right' | 'left').
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


  // Рендер управляемых секций (порядок и видимость — из конфига `layout`).
  const renderCategories = () => (
    <>
      <SectionHeader title="РАЗДЕЛЫ" onTap={() => { haptic.light(); navigate('/sections') }} />
      <CategoryList />
    </>
  )

  const renderHistory = () => (
    <>
      <SectionHeader title="ИСТОРИЯ" onTap={() => { haptic.light(); navigate('/history') }} />
      {!historyLoaded ? (
        <div style={styles.favSkeleton} />
      ) : history.length === 0 ? (
        <div style={styles.favEmpty}>
          Здесь появятся твои завершённые тренировки
        </div>
      ) : (
        <div style={styles.historyCard}>
          {history.map((w, i) => (
            <HistoryRow key={`${w.finished_at}-${i}`} workout={w} />
          ))}
        </div>
      )}
    </>
  )

  const renderQuests = () => (
    <>
      <SectionHeader title="ДНЕВНОЙ БУСТ" onTap={() => { haptic.light(); navigate('/daily-boost') }} />
      <DailyQuests />
    </>
  )

  const renderFriends = () => (
    <>
      <SectionHeader title="ДРУЗЬЯ" onTap={() => { haptic.light(); navigate('/friends') }} />
      <FriendsBlock />
    </>
  )

  const SECTION_RENDERERS = {
    categories: renderCategories,
    friends: renderFriends,
    history: renderHistory,
    quests: renderQuests
  }

  // Цвет раздела текущей избранной карточки — им красим активную точку-индикатор.
  const favAccent = favorites[favIdx]?.prog
    ? (CATEGORY_META[favorites[favIdx].prog.category]?.color || 'var(--color-primary)')
    : 'var(--color-primary)'

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Игрок — закреплён сверху (sticky). */}
      <div style={styles.playerSticky}>
        <PlayerCard />
        {/* Fade-scrim: контент уходит под закреплённую карточку плавно
            (градиент + лёгкий blur), а не обрывается резко. pointer-events:none
            чтобы не перехватывал тапы по контенту под ним. */}
        <div style={styles.stickyFade} aria-hidden="true" />
      </div>

      {/* Скроллящийся контент */}
      <div style={styles.scrollSection}>

      {/* Избранное — тап по заголовку открывает страницу избранного */}
      <button
        onClick={() => { haptic.light(); navigate('/favorites') }}
        style={styles.favHeaderBtn}
      >
        <span style={{ ...styles.sectionHeader, marginTop: 0, marginBottom: 0, paddingLeft: 0 }}>ИЗБРАННОЕ</span>
        <span style={{ display: 'inline-flex', marginLeft: '-2px', marginTop: '1px' }}>
          <PixelHeart filled={favorites.length > 0} size={15} />
        </span>
      </button>
      {!favLoaded ? (
        <div style={styles.favSkeleton} />
      ) : favorites.length === 0 ? (
        <button
          onClick={() => { haptic.light(); navigate('/favorites') }}
          className="press-tile"
          style={styles.favEmpty}
        >
          <span style={styles.favEmptyHeartWrap}>
            <PixelHeart filled={false} size={18} />
          </span>
          Поставь сердце на программу внутри категории — она появится здесь
        </button>
      ) : (
        <div style={styles.favSlider}>
          <div
            onTouchStart={handleFavTouchStart}
            onTouchEnd={handleFavTouchEnd}
            style={styles.favSwipeArea}
          >
            <div
              key={favIdx}
              className={slideDir === 'right' ? 'hslide-in-right' : slideDir === 'left' ? 'hslide-in-left' : undefined}
            >
              <FavCard entry={favorites[favIdx]} onTap={handleFavOpen} />
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

      {/* Управляемые секции — порядок и видимость из настроек «Отображение на главной» */}
      {layout.order.map(key => (
        layout.hidden[key] ? null : (
          <div key={key}>{SECTION_RENDERERS[key]?.()}</div>
        )
      ))}

      </div>
    </div>
  )
}

function FavCard({ entry, onTap }) {
  if (!entry) return null
  const { prog } = entry
  // Цвет раздела программы: силовая — зелёный, плавание — синий, и т.д.
  // Им красим обводку, свечение, тег «НАЧАТЬ» и подсветку активного дня.
  const accent = CATEGORY_META[prog.category]?.color || 'var(--color-primary)'

  const cardStyle = {
    ...favCardStyles.card,
    border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
    boxShadow: `0 0 20px color-mix(in srgb, ${accent} 20%, transparent), inset 0 0 30px color-mix(in srgb, ${accent} 6%, transparent)`
  }
  const startTagStyle = {
    ...favCardStyles.startTag,
    background: `color-mix(in srgb, ${accent} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${accent} 38%, transparent)`,
    color: accent,
    boxShadow: `0 0 12px color-mix(in srgb, ${accent} 12%, transparent)`
  }

  return (
    <div onClick={onTap} className="press-tile" style={cardStyle}>
      <FavCardBody entry={entry} accent={accent} />

      <div style={startTagStyle}>
        НАЧАТЬ
        <span style={favCardStyles.startArrow}>›</span>
      </div>
    </div>
  )
}

const favCardStyles = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 18px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '100px',
    cursor: 'pointer'
  },
  startTag: {
    flexShrink: 0,
    alignSelf: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '8px 12px',
    borderRadius: '12px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '1px'
  },
  startArrow: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    lineHeight: 1,
    marginTop: '-1px'
  }
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
    paddingTop: 'calc(var(--tg-safe-top) - 24px)',
    paddingBottom: 0,
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  // Fade-переход под карточкой: висит сразу под sticky-блоком, ширина на всю
  // страницу (компенсируем боковые паддинги -16px). Градиент от фона к
  // прозрачному + лёгкий blur с маской — контент «утопает», как в Telegram.
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
  favHeaderBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '20px',
    marginBottom: '12px',
    paddingLeft: '4px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer'
  },
  historyCard: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  favEmptyHeartWrap: {
    display: 'inline-flex',
    verticalAlign: 'middle',
    marginRight: '6px'
  },

  favEmpty: {
    width: '100%',
    padding: '16px 18px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 'var(--radius-card)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    cursor: 'pointer'
  },
  favSkeleton: {
    minHeight: '100px',
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
    gap: '6px'
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