import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import PlayerCard from '../components/PlayerCard'
import DailyQuests from '../components/DailyQuests'

/**
 * Главный экран — Тренировки.
 *
 * E1:
 * - Логотип убран отсюда (живёт в Loader)
 * - PlayerCard sticky: прилипает к верху при скролле
 * - Daily Quests и категории скроллятся под ним
 * - Над категориями серый пиксельный заголовок "ТРЕНИРОВКИ"
 */
export default function Home() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  const categories = [
    { id: 'gym',       icon: '🏋️', title: 'СИЛОВАЯ',         subtitle: 'ПРОГРАММЫ ТРЕНИРОВОК', color: 'var(--cat-strength)', available: true,  comingSoon: false, featured: true },
    { id: 'cardio',    icon: '🏃', title: 'КАРДИО',          subtitle: 'БЕГ · HIIT',           color: 'var(--cat-cardio)',   available: true,  comingSoon: true,  featured: false },
    { id: 'pool',      icon: '🏊', title: 'БАССЕЙН',         subtitle: 'ВОДНЫЕ ТРЕНИРОВКИ',    color: 'var(--cat-pool)',     available: true,  comingSoon: true,  featured: false },
    { id: 'stretch',   icon: '🧘', title: 'РАСТЯЖКА',        subtitle: 'ЙОГА · ПИЛАТЕС',       color: 'var(--cat-stretch)',  available: true,  comingSoon: true,  featured: false },
    { id: 'recovery',  icon: '🌿', title: 'ВОССТАНОВЛЕНИЕ',  subtitle: 'СОН · ОТДЫХ',          color: 'var(--cat-recovery)', available: true,  comingSoon: true,  featured: false }
  ]

  const handleCategoryTap = (cat) => {
    haptic.light()
    setTimeout(() => navigate(`/category/${cat.id}`), 80)
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* SICKY ШАПКА — PlayerCard всегда на виду */}
      <div style={styles.stickyHeader}>
        <PlayerCard />
      </div>

      {/* СКРОЛЛЯЩИЙСЯ КОНТЕНТ */}
      <div style={styles.scrollableContent}>

        <DailyQuests />

        <div style={styles.categoriesHeader}>ТРЕНИРОВКИ</div>

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
    </div>
  )
}

const styles = {
  page: {
    paddingTop: 'calc(var(--tg-safe-top) - 24px)',
    position: 'relative',
    paddingLeft: 0,
    paddingRight: 0
  },
  // Sticky-шапка с PlayerCard
  stickyHeader: {
    position: 'sticky',
    // прилипает к верхней безопасной зоне (там где у TG может быть статусбар)
    top: 'calc(var(--tg-safe-top) - 80px)',
    zIndex: 50,
    background: 'var(--color-bg)',
    paddingLeft: '16px',
    paddingRight: '16px',
    paddingBottom: '8px',
    // Лёгкий блюр-разделитель под блоком
    boxShadow: '0 8px 16px -8px rgba(0, 0, 0, 0.4)'
  },
  scrollableContent: {
    padding: '0 16px'
  },
  categoriesHeader: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    marginTop: '12px',
    marginBottom: '12px',
    paddingLeft: '4px'
  },
  cards: { display: 'flex', flexDirection: 'column', gap: '12px' },
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
  // Featured (Силовая) — оставляем красный пока, в Е3 поменяем на зелёный
  categoryCardFeatured: {
    height: '110px',
    opacity: 1,
    border: '1px solid rgba(232, 69, 69, 0.4)',
    boxShadow: '0 0 20px rgba(232, 69, 69, 0.15), inset 0 0 30px rgba(232, 69, 69, 0.05)'
  },
  categoryIcon: { fontSize: '34px', lineHeight: 1, flexShrink: 0, width: '48px', textAlign: 'center' },
  categoryContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  categoryTitle: { fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '0.5px', lineHeight: 1.1 },
  categorySubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' },
  soonTag: { display: 'inline-block', padding: '2px 6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', fontFamily: 'var(--font-tiny5)', fontSize: '9px', color: 'var(--color-text-secondary)', letterSpacing: '1px' },
  categoryArrow: { fontSize: '24px', color: 'var(--color-text-secondary)', flexShrink: 0 }
}
