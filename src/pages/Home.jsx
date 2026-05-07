import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser } from '../lib/telegram'
import { getStreak, getUserLevel, getLevelName } from '../lib/storage'
import { haptic } from '../lib/telegram'
import { spawnBurst } from '../components/ParticlesBg'

/**
 * Главный экран — Тренировки.
 * Шапка с приветствием 👾 → логотип RPG → 5 категорий.
 * Без аватара-заглушки. Без кнопки справочника (она уехала в Настройки).
 */
export default function Home() {
  const navigate = useNavigate()
  const [userName, setUserName] = useState('ATHLETE')
  const [streak, setStreak] = useState(0)
  const [level, setLevel] = useState(1)
  const [levelName, setLevelName] = useState('NEWBIE')

  useEffect(() => {
    const user = getUser()
    if (user?.first_name) setUserName(user.first_name)

    Promise.all([getStreak(), getUserLevel()]).then(([s, l]) => {
      setStreak(s)
      setLevel(l)
      setLevelName(getLevelName(l))
    })
  }, [])

  // Порядок категорий: Силовая → Кардио → Бассейн → Растяжка → Восстановление
  const categories = [
    { id: 'gym',       icon: '🏋️', title: 'СИЛОВАЯ',         subtitle: 'ПРОГРАММЫ ТРЕНИРОВОК', color: 'var(--cat-strength)', available: true,  comingSoon: false },
    { id: 'cardio',    icon: '🏃', title: 'КАРДИО',          subtitle: 'БЕГ · HIIT',           color: 'var(--cat-cardio)',   available: true,  comingSoon: true },
    { id: 'pool',      icon: '🏊', title: 'БАССЕЙН',         subtitle: 'ВОДНЫЕ ТРЕНИРОВКИ',    color: 'var(--cat-pool)',     available: true,  comingSoon: true },
    { id: 'stretch',   icon: '🧘', title: 'РАСТЯЖКА',        subtitle: 'ЙОГА · ПИЛАТЕС',       color: 'var(--cat-stretch)',  available: true,  comingSoon: true },
    { id: 'recovery',  icon: '🌿', title: 'ВОССТАНОВЛЕНИЕ',  subtitle: 'СОН · ОТДЫХ',          color: 'var(--cat-recovery)', available: true,  comingSoon: true }
  ]

  const handleCategoryTap = (cat, e) => {
    haptic.light()
    const rect = e.currentTarget.getBoundingClientRect()
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 5)
    setTimeout(() => navigate(`/category/${cat.id}`), 80)
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Sticky шапка с приветствием */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.greeting}>
            <span style={styles.greetingEmoji}>👾</span>
            <span>Привет, {userName}!</span>
          </div>
          <div style={styles.lvlBlock}>
            <span style={styles.lvlText}>LVL {level}</span>
            <span style={styles.lvlDot}>•</span>
            <span style={styles.lvlName}>{levelName}</span>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.streakIcon}>🔥</span>
          <span style={styles.streakNumber}>{streak}</span>
        </div>
      </header>

      {/* Логотип */}
      <div style={styles.logoBlock}>
        <h1 style={styles.logo}>RPG</h1>
        <div style={styles.logoSubtitle}>TRAINING APP</div>
      </div>

      {/* Категории — название пиксельным шрифтом, без серого фона у эмодзи */}
      <div style={styles.cards}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={(e) => handleCategoryTap(cat, e)}
            style={styles.categoryCard}
          >
            {/* Эмодзи — без фона */}
            <span style={styles.categoryIcon}>{cat.icon}</span>

            {/* Название и подзаголовок */}
            <div style={styles.categoryContent}>
              <div style={{ ...styles.categoryTitle, color: cat.color }}>
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
    // padding-top уже в .page (под Telegram nav)
  },
  header: {
    position: 'sticky',
    top: 'calc(var(--tg-safe-top) + 4px)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 12px',
    marginBottom: '16px',
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '20px'
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px'
  },
  greeting: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  greetingEmoji: {
    fontSize: '20px',
    lineHeight: 1
  },
  lvlBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingLeft: '28px' // выровняно под текст приветствия (после эмодзи)
  },
  lvlText: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  },
  lvlDot: {
    color: 'var(--color-text-secondary)',
    fontSize: '10px'
  },
  lvlName: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '12px'
  },
  streakIcon: {
    fontSize: '16px'
  },
  streakNumber: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  },
  logoBlock: {
    textAlign: 'center',
    marginBottom: '24px',
    marginTop: '12px'
  },
  logo: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '56px',
    color: 'var(--color-primary)',
    letterSpacing: '4px',
    lineHeight: 1,
    marginBottom: '4px'
  },
  logoSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    letterSpacing: '4px'
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
    height: '100px', // как просил
    textAlign: 'left',
    transition: 'transform 0.1s ease'
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
    fontFamily: 'var(--font-tiny5)',
    fontSize: '20px',
    letterSpacing: '2px',
    lineHeight: 1
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
