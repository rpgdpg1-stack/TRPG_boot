import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { spawnBurst } from '../components/ParticlesBg'
import HomeHeader from '../components/HomeHeader'
import PlayerCard from '../components/PlayerCard'

/**
 * Главный экран — Тренировки.
 * Структура: HomeHeader (лого вверху) → PlayerCard → DailyQuests → Категории
 * DailyQuests добавим в Порции Б.
 */
export default function Home() {
  const navigate = useNavigate()

  // Порядок категорий
  const categories = [
    { id: 'gym',       icon: '🏋️', title: 'СИЛОВАЯ',         subtitle: 'ПРОГРАММЫ ТРЕНИРОВОК', color: 'var(--cat-strength)', available: true,  comingSoon: false, featured: true },
    { id: 'cardio',    icon: '🏃', title: 'КАРДИО',          subtitle: 'БЕГ · HIIT',           color: 'var(--cat-cardio)',   available: true,  comingSoon: true,  featured: false },
    { id: 'pool',      icon: '🏊', title: 'БАССЕЙН',         subtitle: 'ВОДНЫЕ ТРЕНИРОВКИ',    color: 'var(--cat-pool)',     available: true,  comingSoon: true,  featured: false },
    { id: 'stretch',   icon: '🧘', title: 'РАСТЯЖКА',        subtitle: 'ЙОГА · ПИЛАТЕС',       color: 'var(--cat-stretch)',  available: true,  comingSoon: true,  featured: false },
    { id: 'recovery',  icon: '🌿', title: 'ВОССТАНОВЛЕНИЕ',  subtitle: 'СОН · ОТДЫХ',          color: 'var(--cat-recovery)', available: true,  comingSoon: true,  featured: false }
  ]

  const handleCategoryTap = (cat, e) => {
    haptic.light()
    const rect = e.currentTarget.getBoundingClientRect()
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 6)
    setTimeout(() => navigate(`/category/${cat.id}`), 80)
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Шапка-логотип сверху на уровне TG nav */}
      <HomeHeader />

      {/* Профиль игрока: аватар + имя + ник + ранг + XP-бар + серия */}
      <PlayerCard />

      {/* Daily Quests — добавим в Порции Б, пока заглушка */}
      <div style={styles.questsPlaceholder}>
        <div style={styles.questsPlaceholderText}>
          ЗАДАНИЯ НА СЕГОДНЯ — скоро (Порция Б)
        </div>
      </div>

      {/* Категории */}
      <div style={styles.cards}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={(e) => handleCategoryTap(cat, e)}
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
    // Поднимаем чуть выше для PlayerCard, т.к. тут нет тяжёлой шапки
    paddingTop: 'calc(var(--tg-safe-top) - 24px)',
    position: 'relative'
  },
  questsPlaceholder: {
    margin: '20px 0',
    padding: '20px 16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1.5px dashed rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    textAlign: 'center'
  },
  questsPlaceholderText: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1.5px'
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '8px'
  },
  // Обычная карточка категории
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
    transition: 'transform 0.1s ease, opacity 0.2s ease',
    opacity: 0.85
  },
  // Выделенная карточка (Силовая) — ярче, выше, со свечением
  categoryCardFeatured: {
    height: '110px',
    opacity: 1,
    border: '1px solid rgba(232, 69, 69, 0.4)',
    boxShadow: '0 0 20px rgba(232, 69, 69, 0.15), inset 0 0 30px rgba(232, 69, 69, 0.05)'
  },
  categoryIcon: {
    fontSize: '34px',
    lineHeight: 1,
    flexShrink: 0,
    width: '48px',
    textAlign: 'center'
  },
  categoryContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  categoryTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
    lineHeight: 1.1
  },
  categorySubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  soonTag: {
    display: 'inline-block',
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  categoryArrow: {
    fontSize: '24px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}
