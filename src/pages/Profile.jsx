import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak, getTotalWorkouts, getRecentMuscleHistory, getRecentWorkouts } from '../lib/storage'
import { getFriendsLeaderboard, getMyLeaguePlace } from '../lib/leaderboard'
import { getCurrentUser } from '../lib/auth'
import { resolveWeeklyStreak } from '../utils/dates'
import { shareReferralLink } from '../lib/friends'
import { EVENTS, on } from '../lib/events'
import ProfileHeader from '../components/ProfileHeader'
import UiIcon from '../components/UiIcon'

// Кнопка «Пригласить друга» в профиле видна, пока друзей меньше этого числа.
// Дальше профиль не засоряем — пригласить всё равно можно из Рейтинга (вкладка «Друзья»).
const FRIENDS_INVITE_LIMIT = 3

/**
 * Экран "Профиль".
 *
 * Верх — компонент ProfileHeader (тот же что и в модалке рейтинга): крупный
 * аватар с рамкой ранга, имя/логин, ранг/место, капсулы с попапами.
 *
 * Ниже — приглашение друга → История (превью 3 + «Показать все») →
 * сгруппированные разделы (как РАЗДЕЛЫ на главной).
 */
export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  // Стартуем из кешированного юзера (как PlayerCard на главной), чтобы ранг,
  // мускулы и стрик показались сразу — без мигания "Новичок 0" перед загрузкой.
  const [stats, setStats] = useState(() => {
    const u = getCurrentUser()
    let cachedTotal = 0
    try {
      const raw = localStorage.getItem('profile-total-workouts')
      if (raw != null) cachedTotal = parseInt(raw, 10) || 0
    } catch { /* ignore */ }
    return {
      xp: u?.total_muscles || 0,
      streak: resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week),
      totalWorkouts: cachedTotal
    }
  })
  // Стартовый rankIndex считаем из кешированного xp (а не хардкод 0),
  // иначе кубок места мигает зелёным «Новичок» перед загрузкой реальной лиги.
  const [leaguePlace, setLeaguePlace] = useState(() => {
    const u = getCurrentUser()
    const muscles = u?.total_muscles || 0
    const rankIndex = Math.min(Math.max(Math.floor(muscles / 900), 0), 10)
    return { place: 1, totalInLeague: 1, rankIndex }
  })
  // Число друзей — для показа кнопки «Пригласить друга» только пока друзей мало.
  // Кешируем в localStorage, чтобы при заходе не мигало (как totalWorkouts).
  const [friendsCount, setFriendsCount] = useState(() => {
    try {
      const raw = localStorage.getItem('profile-friends-count')
      if (raw != null) return parseInt(raw, 10) || 0
    } catch { /* ignore */ }
    return null
  })
  const [recentHistory, setRecentHistory] = useState([])
  // Стартуем из localStorage-кеша — число тренировок и последняя тренировка
  // не лежат в getCurrentUser(), поэтому кешируем их отдельно, чтобы при
  // повторных заходах не мигало пустое значение → загруженное.
  const [recentWorkouts, setRecentWorkouts] = useState(() => {
    try {
      const raw = localStorage.getItem('profile-recent-workouts')
      const parsed = raw ? JSON.parse(raw) : null
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate('/'))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    const tgUser = getUser()
    if (tgUser) setUser(prev => ({ ...prev, ...tgUser }))

    const loadStats = () => {
      Promise.all([
        getTotalXP(),
        getWeeklyStreak(),
        getTotalWorkouts(),
        getMyLeaguePlace(),
        getRecentMuscleHistory(3),
        getRecentWorkouts(3),
        getFriendsLeaderboard()
      ]).then(([xp, streak, totalWorkouts, lp, history, workouts, friendsRows]) => {
        setStats({ xp, streak, totalWorkouts })
        setLeaguePlace(lp)
        setRecentHistory(history)
        setRecentWorkouts(workouts)

        // Список друзей включает самого юзера → друзей на одного меньше.
        // length === 0 значит ошибку/офлайн (свой профиль всегда в списке) —
        // тогда счётчик не трогаем, чтобы кнопка не мигнула по сбою сети.
        const fCount = (friendsRows && friendsRows.length > 0)
          ? friendsRows.length - 1
          : null
        if (fCount !== null) setFriendsCount(fCount)

        // Кешируем для мгновенного показа при следующих заходах (без мигания)
        try {
          localStorage.setItem('profile-total-workouts', String(totalWorkouts))
          localStorage.setItem('profile-recent-workouts', JSON.stringify(workouts || []))
          if (fCount !== null) localStorage.setItem('profile-friends-count', String(fCount))
        } catch { /* ignore */ }
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
      title: 'ПРОФИЛЬ',
      items: [
        { id: 'history',     icon: '📋',             title: 'История',  subtitle: 'Все завершённые тренировки', path: '/history' },
        { id: 'leaderboard', icon: 'ui:leaderboard', iconColor: '#FFD700', title: 'Рейтинг', subtitle: 'Друзья · Лига · Сезон',       path: '/leaderboard' },
        { id: 'rewards',     icon: 'ui:rewards',     iconColor: '#F178B6', title: 'Награды', subtitle: 'Титулы · Рамки · Медали', path: '/rewards' }
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
        { id: 'settings', icon: 'ui:settings', iconColor: 'var(--color-text-secondary)', title: 'Настройки',      subtitle: 'Уведомления · Сброс прогресса', path: '/settings' }
      ]
    }
  ]

  const handleSectionTap = (item) => {
    haptic.light()
    if (item.path) navigate(item.path, { state: { from: '/profile' } })
  }

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  const handlePlaceTap = () => {
    haptic.light()
    navigate('/leaderboard?tab=league', { state: { from: '/profile' } })
  }

  // Кнопку «Пригласить друга» показываем, пока друзей мало (< FRIENDS_INVITE_LIMIT).
  // null = ещё не загрузили → показываем (для нового юзера это и есть «0 друзей»).
  const showInvite = friendsCount === null || friendsCount < FRIENDS_INVITE_LIMIT

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Верх профиля */}
      <div style={styles.headerWrap}>
        <ProfileHeader
          user={user}
          xp={stats.xp}
          streak={stats.streak}
          totalWorkouts={stats.totalWorkouts}
          friendsPlace={leaguePlace.place}
          rankIndex={leaguePlace.rankIndex}
          placeInLeague={true}
          totalInLeague={leaguePlace.totalInLeague}
          lastWorkout={recentWorkouts.length > 0 ? recentWorkouts[0] : null}
          recentHistory={recentHistory}
          recentWorkouts={recentWorkouts}
          interactive={true}
          showUsername={true}
          onPlaceTap={handlePlaceTap}
        />
      </div>

      {/* Пригласить друга — только пока друзей мало (< FRIENDS_INVITE_LIMIT).
          Когда друзей набралось — прячем: приглашать можно из Рейтинга (вкладка «Друзья»). */}
      {showInvite && (
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
      )}

      {/* Разделы — сгруппированы по смыслу */}
      {sectionGroups.map((group) => (
        <section key={group.title}>
          <div style={{ ...styles.groupTitle, marginTop: '20px' }}>
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
                    color={item.iconColor || 'var(--color-text)'}
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
    borderRadius: 'var(--radius-medium)',
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