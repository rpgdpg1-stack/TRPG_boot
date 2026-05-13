import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import PlayerCard from '../components/PlayerCard'
import DailyQuests from '../components/DailyQuests'

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

  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
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

      {/* Заголовок тренировок — такой же стиль */}
      <div style={styles.sectionHeader}>ТРЕНИРОВКИ</div>

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
    gap: '14px',
    padding: '0 18px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    height: '92px',
    textAlign: 'left',
    opacity: 0.85
  },
  categoryCardFeatured: {
    height: '110px',
    opacity: 1,
    border: '1px solid rgba(158, 209, 83, 0.4)',
    boxShadow: '0 0 20px rgba(158, 209, 83, 0.18), inset 0 0 30px rgba(158, 209, 83, 0.05)'
  },
  categoryIcon: { fontSize: '34px', lineHeight: 1, flexShrink: 0, width: '48px', textAlign: 'center' },
  categoryContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  categoryTitle: { fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '0.5px', lineHeight: 1.1 },
  categorySubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' },
  soonTag: { display: 'inline-block', padding: '2px 6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', fontFamily: 'var(--font-tiny5)', fontSize: '9px', color: 'var(--color-text-secondary)', letterSpacing: '1px' },
  categoryArrow: { fontSize: '24px', color: 'var(--color-text-secondary)', flexShrink: 0 }
}