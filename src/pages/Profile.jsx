import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak, getTotalWorkouts } from '../lib/storage'
import { getLevelFromXP, getRankByLevel } from '../lib/levels'
import { getMyFriendsPlace } from '../lib/leaderboard'
import { getCurrentUser } from '../lib/auth'
import RankIcon from '../components/RankIcon'
import RanksPopup from '../components/RanksPopup'
import { shareReferralLink } from '../lib/friends'
import { EVENTS, on } from '../lib/events'
import UiIcon from '../components/UiIcon'
import MuscleIcon from '../components/MuscleIcon'

/**
 * Экран "Профиль" — личный кабинет юзера.
 *
 * Структура:
 *  - Шапка: аватар, имя, ник, ранг
 *  - Карточки статистики (мускулы, серия, тренировок)
 *  - Кнопка "Пригласить друга" — открывает Telegram share с реф-ссылкой
 *  - Разделы: Рейтинг, Награды, Личные данные, Замеры тела и т.д.
 *
 * Рейтинг ведёт на /leaderboard (готово), Награды — на /rewards (готово).
 * Остальные разделы — заглушки на будущее.
 */
export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  const [stats, setStats] = useState({ xp: 0, streak: 0, totalWorkouts: 0 })
  const [friendsPlace, setFriendsPlace] = useState(1)
  const [showRanks, setShowRanks] = useState(false)
  const [rankPopTick, setRankPopTick] = useState(0)
  const rankButtonRef = useRef(null)

  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  useEffect(() => {
    const tgUser = getUser()
    if (tgUser) setUser(prev => ({ ...prev, ...tgUser }))

    const loadStats = () => {
      Promise.all([getTotalXP(), getWeeklyStreak(), getTotalWorkouts(), getMyFriendsPlace()])
        .then(([xp, streak, totalWorkouts, place]) => {
          setStats({ xp, streak, totalWorkouts })
          setFriendsPlace(place)
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

  const handleRankTap = () => {
    haptic.light()
    setRankPopTick(t => t + 1)
    setShowRanks(prev => !prev)
  }

  const handlePlaceTap = () => {
    haptic.light()
    navigate('/leaderboard?tab=friends')
  }

  const sections = [
  { id: 'leaderboard',  icon: 'ui:leaderboard', title: 'Рейтинг',        subtitle: 'Друзья · Лига · Сезон',         path: '/leaderboard' },
  { id: 'rewards',      icon: 'ui:rewards',     title: 'Награды',        subtitle: 'Значки лиг · Сезонные рамки',   path: '/rewards' },
  { id: 'personal',     icon: '👤',             title: 'Личные данные',  subtitle: 'Пол · Рост · Возраст' },
  { id: 'measurements', icon: '📏',             title: 'Замеры тела',    subtitle: 'Вес · Объёмы · Фото' },
  { id: 'goal',         icon: '🎯',             title: 'Цель',           subtitle: 'Что хочешь достичь' },
  { id: 'achievements', icon: '🏆',             title: 'Достижения',     subtitle: 'Ачивки и значки' },
  { id: 'recovery',     icon: '🛌',             title: 'Восстановление', subtitle: 'Сон · Питание · Здоровье',      path: '/recovery' },
  { id: 'settings',     icon: 'ui:settings',    title: 'Настройки',      subtitle: 'Уведомления · Сброс прогресса', path: '/settings' }
]

  const handleSectionTap = (section) => {
    haptic.light()
    if (section.path) {
      navigate(section.path)
    }
  }

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Шапка профиля — как на главной: плашка аватар + имя/ник + ранг + место */}
      <div style={styles.topPanel}>
        <div style={styles.avatarWrap}>
          <div style={{
            ...styles.avatarInner,
            borderColor: rank.color,
            boxShadow: `0 0 12px ${rank.color}33`
          }}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarPlaceholder}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div style={styles.infoColumn}>
          <div style={styles.nameRow}>
            <span style={styles.name}>{displayName}</span>
            {username && <span style={styles.username}>{username}</span>}
          </div>

          <div style={styles.rankWrap} data-rank-button-wrap>
            <button
              ref={rankButtonRef}
              onClick={handleRankTap}
              style={{ ...styles.rank, color: rank.color, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <span
                key={`rankpop-${rankPopTick}`}
                style={{ display: 'inline-flex', animation: rankPopTick ? 'rankIconPopProfile 0.4s ease-out' : 'none' }}
              >
                <RankIcon level={level} size={26} />
              </span>
              {rank.name} {rank.subLevel}
            </button>

            <button
              onClick={handlePlaceTap}
              style={styles.friendsPlaceButton}
              aria-label="Открыть рейтинг друзей"
            >
              🏆 #{friendsPlace}
            </button>

            {showRanks && (
              <RanksPopup currentLevel={level} onClose={() => setShowRanks(false)} />
            )}
          </div>
        </div>

        <style>{`
          @keyframes rankIconPopProfile {
            0%   { transform: scale(1); }
            40%  { transform: scale(1.22); }
            100% { transform: scale(1); }
          }
        `}</style>
      </div>

      {/* Быстрые цифры */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <div style={{ ...styles.statValue, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            {stats.xp} <MuscleIcon size={18} earned={true} />
          </div>
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

      {/* Кнопка "Пригласить друга" — единая CTA-полоса */}
      <button
        onClick={handleInviteTap}
        style={styles.inviteButton}
        className="press-tile"
      >
        <UiIcon name="invite-friend" size={22} color="var(--color-primary)" style={styles.inviteIcon} />
        <div style={styles.inviteContent}>
          <div style={styles.inviteTitle}>Пригласить друга</div>
          <div style={styles.inviteSubtitle}>Качайтесь и соревнуйтесь вместе</div>
        </div>
        <span style={styles.inviteArrow}>›</span>
      </button>

      {/* Разделы */}
      <div style={styles.sections}>
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => handleSectionTap(section)}
            className="press-tile"
            style={styles.sectionCard}
          >
            {section.icon.startsWith('ui:') ? (
  <UiIcon
    name={section.icon.slice(3)}
    size={22}
    color="var(--color-text)"
    style={{ width: '32px', height: '22px' }}
  />
) : (
  <span style={styles.sectionIcon}>{section.icon}</span>
)}
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
  // Верхний отступ как у playerSticky на главной (Home.jsx), чтобы блок
  // с аватаром начинался на той же высоте и переход между вкладками был плавным.
  // Горизонтальные отступы и нижний padding остаются из CSS-класса .page.
  page: {
    paddingTop: 'calc(var(--tg-safe-top) - 24px)'
  },
  // Верхняя плашка — копия главной: аватар слева, инфо справа
  topPanel: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 14px',
    marginTop: '8px',
    marginBottom: '20px',
    background: 'rgba(255, 255, 255, 0.015)',
    borderRadius: 'var(--radius-card)',
    position: 'relative'
  },
  avatarWrap: {
    width: '100px',
    height: '100px',
    flexShrink: 0,
    position: 'relative'
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: '33px',
    overflow: 'hidden',
    background: 'var(--color-card)',
    border: '2px solid',
    transition: 'border-color 0.4s ease, box-shadow 0.4s ease'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '38px',
    color: 'var(--color-primary)'
  },
  infoColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    justifyContent: 'center',
    alignSelf: 'center'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    flexWrap: 'wrap'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1.1
  },
  username: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)'
  },
  rankWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '2px'
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '15px',
    letterSpacing: '1.5px',
    padding: '2px 0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer'
  },
  friendsPlaceButton: {
    marginLeft: '10px',
    padding: '2px 8px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    letterSpacing: '1px',
    color: 'var(--color-text)',
    cursor: 'pointer',
    transition: 'background 0.2s ease, border-color 0.2s ease'
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginBottom: '16px'
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
  // Кнопка "Пригласить друга" — выделенная CTA-полоса с лёгким зелёным акцентом
  inviteButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 20px',
    background: 'rgba(158, 209, 83, 0.08)',
    border: '1px solid rgba(158, 209, 83, 0.25)',
    borderRadius: 'var(--radius-small)',
    marginBottom: '20px',
    minHeight: '64px',
    textAlign: 'left'
  },
  inviteIcon: {
    fontSize: '22px',
    width: '32px',
    textAlign: 'center',
    flexShrink: 0
  },
  inviteContent: {
    flex: 1,
    minWidth: 0
  },
  inviteTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--color-primary)',
    marginBottom: '2px'
  },
  inviteSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  inviteArrow: {
    fontSize: '18px',
    color: 'var(--color-primary)',
    flexShrink: 0,
    opacity: 0.7
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