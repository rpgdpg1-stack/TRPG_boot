import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser } from '../lib/telegram'
import { getStreak, getUserLevel, getLevelName } from '../lib/storage'
import { haptic } from '../lib/telegram'
import CategoryCard from '../components/CategoryCard'

/**
 * Главный экран — Тренировки.
 * Содержит: sticky шапку (имя + LVL + стрик), логотип, заглушку аватара, 3 категории, кнопку справочника.
 */
export default function Home() {
  const navigate = useNavigate()
  const [userName, setUserName] = useState('ATHLETE')
  const [streak, setStreak] = useState(0)
  const [level, setLevel] = useState(1)
  const [levelName, setLevelName] = useState('NEWBIE')

  useEffect(() => {
    // Имя из Telegram (с fallback на ATHLETE)
    const user = getUser()
    if (user?.first_name) {
      setUserName(user.first_name)
    }

    // Стрик и уровень из хранилища
    Promise.all([getStreak(), getUserLevel()]).then(([s, l]) => {
      setStreak(s)
      setLevel(l)
      setLevelName(getLevelName(l))
    })
  }, [])

  const categories = [
    {
      id: 'gym',
      icon: '🏋️',
      title: 'СИЛОВАЯ',
      subtitle: 'ПРОГРАММЫ ТРЕНИРОВОК',
      available: true,
      comingSoon: false
    },
    {
      id: 'pool',
      icon: '🏊',
      title: 'БАССЕЙН',
      subtitle: 'КАРДИО ПЛАНЫ',
      available: true,
      comingSoon: true
    },
    {
      id: 'stretch',
      icon: '🧘',
      title: 'РАСТЯЖКА',
      subtitle: 'ЙОГА · ПИЛАТЕС',
      available: true,
      comingSoon: true
    }
  ]

  const handleLibraryTap = () => {
    haptic.light()
    // Заглушка — справочник упражнений будет позже
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Sticky шапка с именем и LVL */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.greeting}>Привет, {userName}!</div>
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

      {/* Заглушка под пиксельного человечка */}
      <div style={styles.avatarPlaceholder}>
        <div style={styles.avatarInner}>
          <div style={styles.avatarHint}>
            ПИКСЕЛЬНЫЙ<br/>АВАТАР<br/>СКОРО
          </div>
        </div>
      </div>

      {/* Категории тренировок */}
      <div style={styles.cards}>
        {categories.map(cat => (
          <CategoryCard
            key={cat.id}
            id={cat.id}
            icon={cat.icon}
            title={cat.title}
            subtitle={cat.subtitle}
            available={cat.available}
            comingSoon={cat.comingSoon}
          />
        ))}
      </div>

      {/* Кнопка справочника упражнений */}
      <button onClick={handleLibraryTap} style={styles.libraryButton}>
        📚 СПРАВОЧНИК УПРАЖНЕНИЙ
      </button>
    </div>
  )
}

const styles = {
  page: {
    padding: '16px 16px 24px'
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 4px',
    marginBottom: '12px',
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '16px'
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    paddingLeft: '8px'
  },
  greeting: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--color-text)'
  },
  lvlBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
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
    marginBottom: '20px',
    marginTop: '8px'
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
  // Заглушка под пиксельного аватара
  avatarPlaceholder: {
    width: '120px',
    height: '160px',
    margin: '0 auto 24px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1.5px dashed rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInner: {
    textAlign: 'center'
  },
  avatarHint: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    lineHeight: 1.6
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px'
  },
  libraryButton: {
    width: '100%',
    padding: '18px',
    border: '1.5px dashed rgba(255, 255, 255, 0.15)',
    borderRadius: 'var(--radius-card)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    background: 'transparent'
  }
}
