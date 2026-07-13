import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getWeeklyStreak, getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { getFriendsLeaderboard } from '../lib/leaderboard'
import { getCurrentUser } from '../lib/auth'
import { resolveWeeklyStreak } from '../utils/dates'
import { shareReferralLink } from '../lib/friends'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { EVENTS, on } from '../lib/events'
import ProfileHeader from '../components/ProfileHeader'
import HistoryStats from '../components/HistoryStats'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'

// Кнопка «Пригласить друга» в профиле видна, пока друзей меньше этого числа.
const FRIENDS_INVITE_LIMIT = 3

// Периоды блока статистики (как на «Статистике»).
const PERIODS = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё' }
]

/**
 * Экран «Профиль» (соц-концепция без статусов — см. память проекта).
 *
 * Верх — ProfileHeader: аватар, имя, последняя тренировка, серия за неделю.
 * Ниже — блок статистики (тот же HistoryStats, что на главной) с переключателем
 * периода → приглашение друга → меню разделов.
 */
export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  // Стартуем из кешированного юзера, чтобы серия показалась сразу без мигания.
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  // Полная история — для блока статистики и последней тренировки. Старт из кеша.
  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [loaded, setLoaded] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) != null)
  const [period, setPeriod] = useState('week')
  // Число друзей — для показа кнопки «Пригласить друга» только пока друзей мало.
  const [friendsCount, setFriendsCount] = useState(() => {
    try {
      const raw = localStorage.getItem('profile-friends-count')
      if (raw != null) return parseInt(raw, 10) || 0
    } catch { /* ignore */ }
    return null
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate('/'))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    const tgUser = getUser()
    if (tgUser) setUser(prev => ({ ...prev, ...tgUser }))

    const load = () => {
      Promise.all([
        getWeeklyStreak(),
        getRecentWorkouts(HISTORY_FETCH_LIMIT),
        getFriendsLeaderboard()
      ]).then(([wkStreak, wk, friendsRows]) => {
        setStreak(wkStreak)
        setWorkouts(wk || [])
        setLoaded(true)

        // Список друзей включает самого юзера → друзей на одного меньше.
        const fCount = (friendsRows && friendsRows.length > 0) ? friendsRows.length - 1 : null
        if (fCount !== null) setFriendsCount(fCount)
        try {
          if (fCount !== null) localStorage.setItem('profile-friends-count', String(fCount))
        } catch { /* ignore */ }
      })
    }
    load()

    const offReady = on(EVENTS.USER_READY, load)
    const offChanged = on(EVENTS.USER_CHANGED, load)
    return () => { offReady(); offChanged() }
  }, [])

  const lastWorkout = workouts.length > 0 ? workouts[0] : null
  const summary = summarizeWorkouts(workouts, period, new Date())

  const sectionGroups = [
    {
      title: 'ПРОФИЛЬ',
      items: [
        { id: 'sections',    icon: '🗂️',            title: 'Разделы',     subtitle: 'Силовая · Плавание · Кардио', path: '/sections' },
        { id: 'favorite-exercises', icon: '❤️',      title: 'Любимые упражнения', subtitle: 'Топ-3 · рабочие веса',  path: '/favorite-exercises' },
        { id: 'daily-boost', icon: '⚡',            title: 'Активности', subtitle: 'Ежедневные активности',        path: '/daily-boost' },
        { id: 'history',     icon: '📋',             title: 'Статистика',  subtitle: 'Все завершённые тренировки', path: '/history' }
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

  const pickPeriod = (id) => { if (id !== period) { haptic.selection(); setPeriod(id) } }

  // Кнопку «Пригласить друга» показываем, пока друзей мало (< FRIENDS_INVITE_LIMIT).
  const showInvite = friendsCount === null || friendsCount < FRIENDS_INVITE_LIMIT

  return (
    <div className="page page-fade" style={styles.page}>

      <ScreenTitle>Профиль</ScreenTitle>

      {/* Верх профиля */}
      <div style={styles.headerWrap}>
        <ProfileHeader
          user={user}
          streak={streak}
          lastWorkout={lastWorkout}
          statsLoading={!loaded}
        />
      </div>

      {/* Блок статистики со свитчером периода (тот же, что на «Статистике») */}
      <div style={styles.statsCard}>
        <div style={styles.segGroup}>
          {PERIODS.map((p, i) => {
            const active = p.id === period
            return (
              <button
                key={p.id}
                className="press-tile"
                onClick={() => pickPeriod(p.id)}
                style={{
                  ...styles.segItem,
                  ...(active ? styles.segItemActive : {}),
                  marginLeft: i === 0 ? 0 : '-5px',
                  zIndex: active ? 2 : 1,
                  color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)'
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <HistoryStats summary={summary} />
      </div>

      {/* Пригласить друга — только пока друзей мало (< FRIENDS_INVITE_LIMIT). */}
      {showInvite && (
        <button
          onClick={handleInviteTap}
          style={styles.inviteButton}
          className="press-tile"
        >
          <UiIcon name="invite-friend" size={22} color="var(--color-primary)" style={styles.inviteIcon} />
          <div style={styles.inviteContent}>
            <div style={styles.inviteTitle}>Пригласить друга</div>
            <div style={styles.inviteSubtitle}>Качайтесь и мотивируйте друг друга</div>
          </div>
          <span style={styles.inviteArrow}>›</span>
        </button>
      )}

      {/* Меню профиля — сгруппировано по смыслу */}
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
                  borderTop: idx === 0 ? 'none' : '1px solid var(--border-hairline)'
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
  page: {
    paddingTop: 'var(--tg-safe-top)'
  },
  headerWrap: {
    margin: '0 0 16px'
  },
  // Блок статистики — как на «Статистике».
  statsCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    padding: '16px',
    marginBottom: '20px'
  },
  segGroup: {
    display: 'flex', alignItems: 'center', gap: 0, padding: '4px',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    marginBottom: '16px'
  },
  segItem: {
    position: 'relative', flex: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '30px', padding: '0 10px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.2px',
    cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  segItemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
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

  groupTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
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
