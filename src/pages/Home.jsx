import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import PlayerCard from '../components/PlayerCard'
import DailyQuests from '../components/DailyQuests'
import { getFavoritePrograms, getActiveDay } from '../lib/storage'
import { getProgramBySlug } from '../features/programs/registry'

// Кеш избранного в памяти модуля — переживает уход/возврат на главную внутри
// сессии. При повторном входе показываем сразу из кеша (без чёрного экрана),
// в фоне тихо обновляем. Сбрасывается только при перезапуске приложения.
let favoritesCache = null

/**
 * Главная — Тренировки.
 *
 * ПРАВКИ:
 * - Убран sticky-блок с PlayerCard. PlayerCard теперь скроллится вместе с контентом,
 *   что устраняет торможение и обрезку карточек категорий при свайпе вверх.
 * - Заголовок "ДНЕВНОЙ БУСТ" вынесен из компонента DailyQuests наружу —
 *   симметрия с заголовком "ТРЕНИРОВКИ".
 *
 * Структура страницы линейная: PlayerCard → буст → тренировки.
 */
export default function Home() {
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState(() => favoritesCache || []) // { prog, categoryId }
  const [favIdx, setFavIdx] = useState(0)        // текущий слайд
  const [favLoaded, setFavLoaded] = useState(() => favoritesCache !== null) // загружено?

  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  useEffect(() => {
    let cancelled = false
    getFavoritePrograms().then(async favMap => {
      if (cancelled) return
      const entries = []
      for (const [categoryId, slug] of Object.entries(favMap)) {
        const prog = getProgramBySlug(slug)
        if (!prog) continue
        const activeDay = await getActiveDay(slug)
        entries.push({ prog, categoryId, activeDay })
      }
      if (!cancelled) {
        favoritesCache = entries
        setFavorites(entries)
        setFavIdx(prev => Math.min(prev, Math.max(0, entries.length - 1)))
        setFavLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [])

  const categories = [
    {
      id: 'gym',
      icon: '🏋️',
      title: 'СИЛОВАЯ',
      subtitle: '1 программа: Сплит',
      color: 'var(--color-primary)',
      available: true,
      comingSoon: false,
      featured: true
    },
    {
      id: 'cardio',
      icon: '🏃',
      title: 'КАРДИО',
      subtitle: 'БЕГ · HIIT',
      color: 'var(--cat-cardio)',
      available: true,
      comingSoon: true,
      featured: false
    },
    {
      id: 'pool',
      icon: '🏊',
      title: 'ПЛАВАНИЕ',
      subtitle: 'ВОДНЫЕ ТРЕНИРОВКИ',
      color: 'var(--cat-pool)',
      available: true,
      comingSoon: true,
      featured: false
    },
    {
      id: 'stretch',
      icon: '🧘',
      title: 'РАСТЯЖКА',
      subtitle: 'ЙОГА · ПИЛАТЕС',
      color: 'var(--cat-stretch)',
      available: true,
      comingSoon: true,
      featured: false
    }
  ]

  const handleCategoryTap = (cat) => {
    haptic.light()
    setTimeout(() => navigate(`/category/${cat.id}`), 80)
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Игрок — без sticky, скроллится со всем контентом */}
      <div style={styles.playerSection}>
        <PlayerCard />
      </div>

      {/* Заголовок дневного буста — снаружи блока */}
      <div style={styles.sectionHeader}>ДНЕВНОЙ БУСТ</div>
      <DailyQuests />

      {/* Избранное */}
      <div style={styles.sectionHeader}>ИЗБРАННОЕ 💚</div>
      {!favLoaded ? (
        // Пока грузится — короткий скелетон карточки (не чёрный пустой блок и
        // не заглушка). Так на первом старте нет ни мигания заглушкой, ни
        // проваливания вёрстки.
        <div style={styles.favSkeleton} />
      ) : favorites.length === 0 ? (
        <div style={styles.favEmpty}>
          Поставь 💚 на программу внутри категории — она появится здесь
        </div>
      ) : (
        <div style={styles.favSlider}>
          <FavCard
            entry={favorites[favIdx]}
            onTap={() => {
              haptic.light()
              const day = favorites[favIdx].activeDay || 'A'
              setTimeout(() => navigate(`/workout/${favorites[favIdx].prog.slug}/${day}`, {
                state: { fromHome: true }
              }), 80)
            }}
          />
          {favorites.length > 1 && (
            <div style={styles.favDots}>
              {favorites.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { haptic.light(); setFavIdx(i) }}
                  style={{
                    ...styles.favDot,
                    background: i === favIdx ? 'var(--color-primary)' : 'rgba(255,255,255,0.2)',
                    width: i === favIdx ? '16px' : '6px'
                  }}
                />
              ))}
            </div>
          )}
          {favorites.length > 1 && (
            <div style={styles.favArrows}>
              <button
                onClick={() => { haptic.light(); setFavIdx(i => (i - 1 + favorites.length) % favorites.length) }}
                style={styles.favArrowBtn}
              >‹</button>
              <button
                onClick={() => { haptic.light(); setFavIdx(i => (i + 1) % favorites.length) }}
                style={styles.favArrowBtn}
              >›</button>
            </div>
          )}
        </div>
      )}

      {/* Заголовок разделов — такой же стиль */}
      <div style={styles.sectionHeader}>РАЗДЕЛЫ</div>

      <div style={styles.cards}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCategoryTap(cat)}
            className="press-tile"
            style={{
              ...styles.categoryCard,
              ...(cat.featured ? styles.categoryCardFeatured : {})
            }}
          >
            <span style={styles.categoryIcon}>{cat.icon}</span>

            <div style={styles.categoryContent}>
              <div style={{
                ...styles.categoryTitle,
                color: cat.featured ? cat.color : 'var(--color-text)'
              }}>
                {cat.title}
              </div>
              <div style={styles.categorySubtitle}>
                {cat.subtitle}
                {cat.comingSoon && <span style={styles.soonTag}>СКОРО</span>}
              </div>
            </div>

            <div style={styles.categoryArrow}>›</div>
          </button>
        ))}
      </div>
    </div>
  )
}

const PROGRAM_EMOJI = { split: '🏋️' }

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
        {prog.tags && prog.tags.length > 0 && (
          <div style={favCardStyles.tags}>
            {prog.tags.map(tag => {
              const ft = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase()
              const bg = tag.toLowerCase() === 'зал' ? 'var(--tag-gym)'
                       : tag.toLowerCase() === 'дом' ? 'var(--tag-home)'
                       : 'var(--tag-outdoor)'
              return <span key={tag} style={{ ...favCardStyles.tag, background: bg }}>{ft}</span>
            })}
          </div>
        )}
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
    border: '1px solid rgba(158, 209, 83, 0.2)'
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
  }
}

const styles = {
  page: {
    paddingTop: 'calc(var(--tg-safe-top) - 24px)',
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: '24px'
  },
  playerSection: {
    paddingTop: '4px',
    paddingBottom: '20px'
  },
  // Единый стиль для двух заголовков "ДНЕВНОЙ БУСТ" и "ТРЕНИРОВКИ"
  sectionHeader: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    marginTop: '20px',
    marginBottom: '12px',
    paddingLeft: '4px'
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  categoryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 16px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    height: '72px',
    textAlign: 'left',
    opacity: 0.85
  },
  categoryCardFeatured: {
    height: '84px',
    opacity: 1,
    border: '1px solid rgba(158, 209, 83, 0.4)',
    boxShadow: '0 0 20px rgba(158, 209, 83, 0.18), inset 0 0 30px rgba(158, 209, 83, 0.05)'
  },
  categoryIcon: { fontSize: '28px', lineHeight: 1, flexShrink: 0, width: '42px', textAlign: 'center' },
  categoryContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  categoryTitle: { fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '0.5px', lineHeight: 1.1 },
  categorySubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' },
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
  },
  favArrows: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px'
  },
  favArrowBtn: {
    flex: 1,
    padding: '10px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '22px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer'
  }
}