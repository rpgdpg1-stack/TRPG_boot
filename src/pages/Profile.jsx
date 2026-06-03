import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak, getTotalWorkouts, getRecentMuscleHistory, getRecentWorkouts } from '../lib/storage'
import { getMyFriendsPlace } from '../lib/leaderboard'
import { getCurrentUser } from '../lib/auth'
import { shareReferralLink } from '../lib/friends'
import { EVENTS, on } from '../lib/events'
import ProfileHeader from '../components/ProfileHeader'
import UiIcon from '../components/UiIcon'

/**
 * Экран "Профиль".
 *
 * Верх — компонент ProfileHeader (тот же что и в модалке рейтинга): крупный
 * аватар с рамкой ранга, имя/логин, ранг/место, капсулы с попапами.
 * Закрепления (sticky) нет — страница скроллится целиком.
 *
 * Ниже — приглашение друга + сгруппированные разделы (заголовок + единая
 * карточка, разделители, серая подсветка .tg-row — как РАЗДЕЛЫ на главной).
 */
export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  // Стартуем из кешированного юзера (как PlayerCard на главной), чтобы ранг,
  // мускулы и стрик показались сразу — без мигания "Новичок 0" перед загрузкой.
  const [stats, setStats] = useState(() => {
    const u = getCurrentUser()
    return {
      xp: u?.total_muscles || 0,
      streak: u?.weekly_streak || 0,
      totalWorkouts: 0
    }
  })
  const [friendsPlace, setFriendsPlace] = useState(1)
  const [recentHistory, setRecentHistory] = useState([])
  const [recentWorkouts, setRecentWorkouts] = useState([])

  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  useEffect(() => {
    const tgUser = getUser()
    if (tgUser) setUser(prev => ({ ...prev, ...tgUser }))

    const loadStats = () => {
      Promise.all([
        getTotalXP(),
        getWeeklyStreak(),
        getTotalWorkouts(),
        getMyFriendsPlace(),
        getRecentMuscleHistory(3),
        getRecentWorkouts(3)
      ]).then(([xp, streak, totalWorkouts, place, history, workouts]) => {
        setStats({ xp, streak, totalWorkouts })
        setFriendsPlace(place)
        setRecentHistory(history)
        setRecentWorkouts(workouts)
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

  const sectionGroups = [
    {
      title: 'ДОСТИЖЕНИЯ',
      items: [
        { id: 'leaderboard', icon: 'ui:leaderboard', title: 'Рейтинг', subtitle: 'Друзья · Лига · Сезон',       path: '/leaderboard' },
        { id: 'rewards',     icon: 'ui:rewards',     title: 'Награды', subtitle: 'Значки лиг · Сезонные рамки', path: '/rewards' }
      ]
    },
    {
      title: 'ТЕЛО',
      items: [
        { id: 'personal',     icon: '👤', title: 'Личные данные', subtitle: 'Пол · Рост · Возраст' },
        { id: 'measurements', icon: '📏', title: 'Замеры тела',   subtitle: 'Вес · Объёмы · Фото' },
        { id: 'goal',         icon: '🎯', title: 'Цель',          subtitle: 'Что хочешь достичь' }
      ]
    },
    {
      title: 'ЕЩЁ',
      items: [
        { id: 'recovery', icon: '🛌',          title: 'Восстановление', subtitle: 'Сон · Питание · Здоровье',      path: '/recovery' },
        { id: 'settings', icon: 'ui:settings', title: 'Настройки',      subtitle: 'Уведомления · Сброс прогресса', path: '/settings' }
      ]
    }
  ]

  const handleSectionTap = (item) => {
    haptic.light()
    if (item.path) navigate(item.path)
  }

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  const handlePlaceTap = () => {
    haptic.light()
    navigate('/leaderboard?tab=friends')
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Верх профиля */}
      <div style={styles.headerWrap}>
        <ProfileHeader
          user={user}
          xp={stats.xp}
          streak={stats.streak}
          totalWorkouts={stats.totalWorkouts}
          friendsPlace={friendsPlace}
          lastWorkout={recentWorkouts.length > 0 ? recentWorkouts[0] : null}
          recentHistory={recentHistory}
          recentWorkouts={recentWorkouts}
          interactive={true}
          showUsername={true}
          onPlaceTap={handlePlaceTap}
        />
      </div>

      {/* Пригласить друга */}
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

      {/* Разделы — сгруппированы по смыслу */}
      {sectionGroups.map((group, gIdx) => (
        <section key={group.title}>
          <div style={{ ...styles.groupTitle, marginTop: gIdx === 0 ? '0' : '20px' }}>
            {group.title}
          </div>

          <div style={styles.groupCard}>
            {group.items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                className="tg-row"
                style={{
                  ...styles.row,
                  borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)'
                }}
              >
                {item.icon.startsWith('ui:') ? (
                  <UiIcon
                    name={item.icon.slice(3)}
                    size={22}
                    color="var(--color-text)"
                    style={{ width: '32px', height: '22px' }}
                  />
                ) : (
                  <span style={styles.rowIcon}>{item.icon}</span>
                )}

                <div style={styles.rowContent}>
                  <div style={styles.rowTitle}>{item.title}</div>
                  <div style={styles.rowSubtitle}>{item.subtitle}</div>
                </div>

                <span style={styles.rowArrow}>›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const styles = {
  // Верхний отступ как у playerSticky на главной (tg-safe-top − 24px),
  // чтобы блок аватара в профиле начинался на той же высоте.
  // Лево/право/низ остаются из класса .page.
  page: {
    paddingTop: 'calc(var(--tg-safe-top) - 24px)'
  },
  headerWrap: {
    marginTop: '8px',
    marginBottom: '20px'
  },
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
  inviteContent: { flex: 1, minWidth: 0 },
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

  // === Группы разделов (как РАЗДЕЛЫ на главной) ===
  groupTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    marginBottom: '12px',
    paddingLeft: '4px'
  },
  groupCard: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 18px',
    width: '100%',
    minHeight: '64px',
    textAlign: 'left',
    background: 'transparent',
    border: 'none'
  },
  rowIcon: {
    fontSize: '22px',
    width: '32px',
    textAlign: 'center',
    flexShrink: 0
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  rowSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  rowArrow: {
    fontSize: '18px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}