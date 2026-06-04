import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import PlayerCard from '../components/PlayerCard'
import DailyQuests from '../components/DailyQuests'
import { getActiveDay, loadFavoritesEntries, getFavoritesEntriesSync, getRecentWorkouts } from '../lib/storage'
import { getProgramBySlug } from '../features/programs/registry'
import { swimTotalMeters } from '../data/programs/swim'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { localGet, localSet } from '../utils/storage'
import { EVENTS, on } from '../lib/events'
import PixelHeart from '../components/PixelHeart'
import UiIcon from '../components/UiIcon'
import HistoryRow from '../components/HistoryRow'

// Ключ последней пролистанной избранной программы (синкается между устройствами)
const FAV_LAST_SLUG_KEY = 'fav-last-slug'

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
 * Порядок: Игрок → Избранное → Разделы → История → Дневной буст.
 *
 * Избранное: карусель программ. Листается СВАЙПОМ влево/вправо (с вибро),
 * снизу точки-индикаторы. Последняя пролистанная карточка запоминается
 * (localStorage + Telegram CloudStorage).
 *
 * История: превью последних 3 завершённых тренировок + «Показать все» → /history.
 */
export default function Home() {
  const navigate = useNavigate()

  const initialFavs = getFavoritesEntriesSync(buildFavSync) || []
  const savedSlug = localGet(FAV_LAST_SLUG_KEY)

  const [favorites, setFavorites] = useState(initialFavs)
  const [favIdx, setFavIdx] = useState(() => indexBySlug(initialFavs, savedSlug))
  const [favLoaded, setFavLoaded] = useState(() => getFavoritesEntriesSync(buildFavSync) !== null)

  const [history, setHistory] = useState([])

  // Состояние свайпа: стартовая X и флаг "только что свайпнули".
  const swipeRef = useRef({ x: null, swiped: false })

  useEffect(() => {
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
  useEffect(() => {
    let cancelled = false
    const load = () => {
      getRecentWorkouts(3).then(data => {
        if (!cancelled) setHistory(data || [])
      })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    return () => { cancelled = true; off() }
  }, [])

  // Перейти к слайду i и запомнить его slug (локально + в облако).
  const goFav = (i) => {
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
      goFav((favIdx + 1) % favorites.length)
    } else {
      goFav((favIdx - 1 + favorites.length) % favorites.length)
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
    const day = fav.activeDay || 'A'
    setTimeout(() => navigate(`/workout/${fav.prog.slug}/${day}`, { state: { fromHome: true } }), 80)
  }

  const categories = [
    {
      id: 'gym',
      iconName: 'power',
      title: 'Силовая',
      subtitle: '1 программа: Сплит',
      color: 'var(--color-primary)',
      available: true,
      comingSoon: false
    },
    {
      id: 'cardio',
      iconName: 'cardio',
      title: 'Кардио',
      subtitle: 'Бег · HIIT',
      color: 'var(--cat-cardio)',
      available: true,
      comingSoon: true
    },
    {
      id: 'pool',
      iconName: 'swimming',
      title: 'Плавание',
      subtitle: '1 программа: Заплыв',
      color: 'var(--cat-pool)',
      available: true,
      comingSoon: false
    },
    {
      id: 'stretch',
      iconName: 'stretching',
      title: 'Растяжка',
      subtitle: 'Йога · Пилатес',
      color: 'var(--cat-stretch)',
      available: true,
      comingSoon: true
    }
  ]

  const handleCategoryTap = (cat) => {
    haptic.light()
    setTimeout(() => navigate(`/category/${cat.id}`), 80)
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Игрок — закреплён сверху (sticky). */}
      <div style={styles.playerSticky}>
        <PlayerCard />
      </div>

      {/* Скроллящийся контент */}
      <div style={styles.scrollSection}>

      {/* Избранное */}
      <div style={styles.sectionHeaderRow}>
        <span style={{ ...styles.sectionHeader, marginTop: 0, marginBottom: 0, paddingLeft: 0 }}>ИЗБРАННОЕ</span>
        <span style={{ display: 'inline-flex', marginLeft: '-2px', marginTop: '1px' }}>
          <PixelHeart filled={favorites.length > 0} size={15} />
        </span>
      </div>
      {!favLoaded ? (
        <div style={styles.favSkeleton} />
      ) : favorites.length === 0 ? (
        <div style={styles.favEmpty}>
          <span style={styles.favEmptyHeartWrap}>
            <PixelHeart filled={false} size={18} />
          </span>
          Поставь сердце на программу внутри категории — она появится здесь
        </div>
      ) : (
        <div style={styles.favSlider}>
          <div
            onTouchStart={handleFavTouchStart}
            onTouchEnd={handleFavTouchEnd}
            style={styles.favSwipeArea}
          >
            <FavCard entry={favorites[favIdx]} onTap={handleFavOpen} />
          </div>
          {favorites.length > 1 && (
            <div style={styles.favDots}>
              {favorites.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { haptic.light(); goFav(i) }}
                  style={{
                    ...styles.favDot,
                    background: i === favIdx ? 'var(--color-primary)' : 'rgba(255,255,255,0.2)',
                    width: i === favIdx ? '16px' : '6px'
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Разделы */}
      <div style={styles.sectionHeader}>РАЗДЕЛЫ</div>

      <div style={styles.categoryGroup}>
        {categories.map((cat, idx) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryTap(cat)}
            className="tg-row"
            style={{
              ...styles.categoryRow,
              borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)'
            }}
          >
            <span style={styles.categoryIcon}>
              <UiIcon name={cat.iconName} size={26} color={cat.color} />
            </span>

            <div style={styles.categoryContent}>
              <div style={styles.categoryTitle}>{cat.title}</div>
              <div style={styles.categorySubtitle}>
                {cat.subtitle}
                {cat.comingSoon && <span style={styles.soonTag}>Скоро</span>}
              </div>
            </div>

            <div style={styles.categoryArrow}>›</div>
          </button>
        ))}
      </div>

      {/* История */}
      <div style={styles.historyHeaderRow}>
        <span style={{ ...styles.sectionHeader, marginTop: 0, marginBottom: 0, paddingLeft: 4 }}>ИСТОРИЯ</span>
        {history.length > 0 && (
          <button
            onClick={() => { haptic.light(); navigate('/history') }}
            style={styles.showAllBtn}
          >
            Показать все ›
          </button>
        )}
      </div>
      {history.length === 0 ? (
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

      {/* Дневной буст */}
      <div style={styles.sectionHeader}>ДНЕВНОЙ БУСТ</div>
      <DailyQuests />

      </div>
    </div>
  )
}

const PROGRAM_EMOJI = { split: '🏋️', swim: '🏊' }

function FavCard({ entry, onTap }) {
  if (!entry) return null
  const { prog, activeDay } = entry
  const allDays = ['A', 'B', 'C']
  const formattedTitle = prog.title
    ? prog.title.charAt(0).toUpperCase() + prog.title.slice(1).toLowerCase()
    : ''
  const emoji = PROGRAM_EMOJI[prog.slug] || '💪'

  return (
    <div onClick={onTap} className="press-tile" style={favCardStyles.card}>
      <span style={favCardStyles.emoji}>{emoji}</span>
      <div style={favCardStyles.content}>
        <div style={favCardStyles.title}>{formattedTitle}</div>

        {prog.kind === 'swim' ? (
          <div style={favCardStyles.daysRow}>
            <span style={favCardStyles.daysLabel}>
              {prog.data.durationMin} мин · {swimTotalMeters()} м
            </span>
          </div>
        ) : (
          <div style={favCardStyles.daysRow}>
            <span style={favCardStyles.daysLabel}>День:</span>
            <div style={favCardStyles.daysList}>
              {allDays.map(d => {
                const isToday = !!activeDay && d === activeDay
                return (
                  <span key={d} style={{
                    ...favCardStyles.dayLetter,
                    color: isToday ? 'var(--color-primary)' : 'rgba(255,255,255,0.35)',
                    textShadow: isToday ? '0 0 6px rgba(158,209,83,0.4)' : 'none'
                  }}>
                    {d}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {prog.tags && prog.tags.length > 0 && (
          <div style={favCardStyles.tags}>
            {prog.tags.map(tag => {
              const ft = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
              const t = tag.toLowerCase()
              const bg = t === 'зал' ? 'var(--tag-gym)'
                       : t === 'дом' ? 'var(--tag-home)'
                       : t === 'бассейн' ? 'var(--cat-pool)'
                       : 'var(--tag-outdoor)'
              return <span key={tag} style={{ ...favCardStyles.tag, background: bg }}>{ft}</span>
            })}
          </div>
        )}
      </div>

      <div style={favCardStyles.startTag}>
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
    cursor: 'pointer',
    border: '1px solid rgba(158, 209, 83, 0.4)',
    boxShadow: '0 0 20px rgba(158, 209, 83, 0.18), inset 0 0 30px rgba(158, 209, 83, 0.05)'
  },
  emoji: { fontSize: '34px', lineHeight: 1, flexShrink: 0, width: '48px', textAlign: 'center' },
  content: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    lineHeight: 1.1
  },
  daysRow: { display: 'flex', alignItems: 'baseline', gap: '10px' },
  daysLabel: { fontFamily: 'var(--font-tiny5)', fontSize: '14px', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px' },
  daysList: { display: 'flex', alignItems: 'baseline', gap: '14px' },
  dayLetter: { fontFamily: 'var(--font-tiny5)', fontSize: '17px', lineHeight: 1, transition: 'color 0.3s ease' },
  tags: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  tag: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: '6px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-bg)'
  },
  startTag: {
    flexShrink: 0,
    alignSelf: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '8px 12px',
    background: 'rgba(158, 209, 83, 0.12)',
    border: '1px solid rgba(158, 209, 83, 0.35)',
    borderRadius: '12px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1px',
    color: 'var(--color-primary)',
    boxShadow: '0 0 12px rgba(158, 209, 83, 0.1)'
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
    paddingBottom: '12px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  scrollSection: {
    position: 'relative'
  },
  sectionHeader: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    marginTop: '20px',
    marginBottom: '12px',
    paddingLeft: '4px'
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '20px',
    marginBottom: '12px',
    paddingLeft: '4px'
  },
  // Заголовок ИСТОРИЯ + кнопка "Показать все" справа
  historyHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '20px',
    marginBottom: '12px'
  },
  showAllBtn: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-primary)',
    background: 'transparent',
    border: 'none',
    padding: '4px 4px',
    cursor: 'pointer',
    letterSpacing: '0.3px'
  },
  historyCard: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  favEmptyHeartWrap: {
    display: 'inline-flex',
    verticalAlign: 'middle',
    marginRight: '6px'
  },
  categoryGroup: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  categoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '0 18px',
    width: '100%',
    height: '68px',
    textAlign: 'left',
    border: 'none'
  },
  categoryIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    flexShrink: 0,
    width: '34px'
  },
  categoryContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' },
  categoryTitle: { fontFamily: 'var(--font-manrope)', fontSize: '17px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '0.3px', lineHeight: 1.1 },
  categorySubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '8px' },
  soonTag: { display: 'inline-block', padding: '2px 6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', fontFamily: 'var(--font-tiny5)', fontSize: '9px', color: 'var(--color-text-secondary)', letterSpacing: '1px' },
  categoryArrow: { fontSize: '24px', color: 'var(--color-text-secondary)', flexShrink: 0 },

  favEmpty: {
    padding: '16px 18px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 'var(--radius-card)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5
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