import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak, getTotalWorkouts } from '../lib/storage'
import { getLevelFromXP, getRankByLevel } from '../lib/levels'
import { EVENTS, on } from '../lib/events'

/**
 * Экран "Профиль" — личный кабинет юзера.
 *
 * Сейчас MVP-набросок: аватар крупно, имя/ник, ранг, основные цифры,
 * и список разделов которые ведут в подэкраны (заглушки на будущее).
 *
 * Разделы:
 *  - Личные данные (пол/рост/возраст)
 *  - Замеры тела (вес, объёмы, фото-прогресс)
 *  - Цель (что хочешь достичь)
 *  - Достижения (ачивки)
 *  - Восстановление (советы по сну, питанию, мышцам — переехало сюда из таб-бара)
 *  - Настройки приложения
 *
 * Этот файл — стартовая точка. Подэкраны добавим позже.
 */
export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [stats, setStats] = useState({ xp: 0, streak: 0, totalWorkouts: 0 })

  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  useEffect(() => {
    setUser(getUser())

    const loadStats = () => {
      Promise.all([getTotalXP(), getWeeklyStreak(), getTotalWorkouts()]).then(([xp, streak, totalWorkouts]) => {
        setStats({ xp, streak, totalWorkouts })
      })
    }
    loadStats()

    const offReady = on(EVENTS.USER_READY, loadStats)
    const offChanged = on(EVENTS.USER_CHANGED, loadStats)
    return () => {
      offReady()
      offChanged()
    }
  }, [])

  const level = getLevelFromXP(stats.xp)
  const rank = getRankByLevel(level)
  const displayName = user?.first_name || 'ATHLETE'
  const username = user?.username ? `@${user.username}` : ''

  const sections = [
    { id: 'personal',     icon: '👤', title: 'Личные данные',  subtitle: 'Пол · Рост · Возраст' },
    { id: 'measurements', icon: '📏', title: 'Замеры тела',    subtitle: 'Вес · Объёмы · Фото' },
    { id: 'goal',         icon: '🎯', title: 'Цель',           subtitle: 'Что хочешь достичь' },
    { id: 'achievements', icon: '🏆', title: 'Достижения',     subtitle: 'Ачивки и значки' },
    { id: 'recovery',     icon: '🛌', title: 'Восстановление', subtitle: 'Сон · Питание · Здоровье', path: '/recovery' },
    { id: 'settings',     icon: '⚙️', title: 'Настройки',      subtitle: 'Уведомления · Сброс прогресса', path: '/settings' }
  ]

  const handleSectionTap = (section) => {
    haptic.light()
    if (section.path) {
      navigate(section.path)
    }
    // Для разделов без path — позже сделаем заглушку
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Шапка профиля */}
      <header style={styles.header}>
        <div style={styles.avatarWrap}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={styles.avatarImg} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div style={styles.name}>{displayName}</div>
        {username && <div style={styles.username}>{username}</div>}
        <div style={{ ...styles.rank, color: rank.color }}>
          {rank.emoji} {rank.name} {rank.subLevel}
        </div>
      </header>

      {/* Быстрые цифры */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.xp}</div>
          <div style={styles.statLabel}>МУСКУЛЫ</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>🔥 {stats.streak}</div>
          <div style={styles.statLabel}>СЕРИЯ</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{stats.totalWorkouts}</div>
          <div style={styles.statLabel}>ТРЕНИРОВОК</div>
        </div>
      </div>

      {/* Разделы */}
      <div style={styles.sections}>
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => handleSectionTap(section)}
            className="press-tile"
            style={styles.sectionCard}
          >
            <span style={styles.sectionIcon}>{section.icon}</span>
            <div style={styles.sectionContent}>
              <div style={styles.sectionTitle}>{section.title}</div>
              <div style={styles.sectionSubtitle}>{section.subtitle}</div>
            </div>
            <span style={styles.sectionArrow}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  page: {},
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    marginTop: '8px',
    marginBottom: '20px'
  },
  avatarWrap: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    overflow: 'hidden',
    background: 'var(--color-card)',
    border: '2px solid rgba(255, 255, 255, 0.08)',
    marginBottom: '8px'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '36px',
    color: 'var(--color-primary)'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1.1
  },
  username: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    letterSpacing: '1.5px',
    marginTop: '4px'
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginBottom: '20px'
  },
  statBox: {
    padding: '14px 8px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    textAlign: 'center',
    minHeight: '70px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  statValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '16px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    marginBottom: '4px'
  },
  statLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1.5px',
    fontWeight: 600
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  sectionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 20px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-small)',
    width: '100%',
    textAlign: 'left',
    minHeight: '60px',
    border: 'none'
  },
  sectionIcon: {
    fontSize: '22px',
    width: '32px',
    textAlign: 'center',
    flexShrink: 0
  },
  sectionContent: {
    flex: 1,
    minWidth: 0
  },
  sectionTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  sectionSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  sectionArrow: {
    fontSize: '18px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}