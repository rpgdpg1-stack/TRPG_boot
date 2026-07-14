import { useEffect, useState, useRef, useCallback } from 'react'
import { useOutsideClose } from '../lib/use-outside-close'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getWeeklyStreak, getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { getFriendsList } from '../lib/friends-list'
import { getCurrentUser } from '../lib/auth'
import { resolveWeeklyStreak } from '../utils/dates'
import { shareReferralLink } from '../lib/friends'
import { getPrivacy } from '../lib/privacy'
import { getFavoriteExercises, getFavoritesSync } from '../lib/favorite-exercises'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { localGet, localSet } from '../utils/storage'
import { EVENTS, on } from '../lib/events'
import ProfileHeader from '../components/ProfileHeader'
import HistoryStats from '../components/HistoryStats'
import FavoritesBlock from '../components/FavoritesBlock'
import ScreenTitle from '../components/ScreenTitle'
import ChevronIcon from '../components/ChevronIcon'
import UiIcon from '../components/UiIcon'

const FRIENDS_INVITE_LIMIT = 3

const PERIODS = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё время' }
]
const periodLabel = (id) => PERIODS.find(p => p.id === id)?.label || 'Неделя'
const STATS_PERIOD_KEY = 'profile-stats-period'

/**
 * Экран «Профиль» (соц-концепция без статусов — см. память проекта).
 *
 * Верх — ProfileHeader (аватар, имя, последняя тренировка, серия за неделю).
 * Статистика — скрыта по умолчанию, включается в «Приватности»; вид — как на
 * главной (дропдаун-селектор периода). Затем настройки приватности и меню.
 */
export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [loaded, setLoaded] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) != null)
  const [privacy, setPrivacy] = useState(() => getPrivacy())
  const [favorites, setFavorites] = useState(() => getFavoritesSync() || [])
  const [favLoaded, setFavLoaded] = useState(() => getFavoritesSync() !== null)
  const [period, setPeriod] = useState(() => localGet(STATS_PERIOD_KEY) || 'week')
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodRef = useRef(null)
  useOutsideClose(periodRef, periodOpen, useCallback(() => setPeriodOpen(false), []))
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
      setPrivacy(getPrivacy())
      getFavoriteExercises().then(list => { setFavorites(list); setFavLoaded(true) })
      Promise.all([
        getWeeklyStreak(),
        getRecentWorkouts(HISTORY_FETCH_LIMIT),
        getFriendsList()
      ]).then(([wkStreak, wk, friendsRows]) => {
        setStreak(wkStreak)
        setWorkouts(wk || [])
        setLoaded(true)
        const fCount = Array.isArray(friendsRows) ? friendsRows.length : null
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

  const pickPeriod = (id) => {
    setPeriodOpen(false)
    if (id === period) return
    haptic.light()
    setPeriod(id)
    localSet(STATS_PERIOD_KEY, id)
  }

  const menuGroups = [
    {
      title: 'ПРОФИЛЬ',
      items: [
        { id: 'favorite-exercises', icon: '❤️',      title: 'Любимые упражнения', subtitle: 'Твой топ-3',           path: '/favorite-exercises' },
        { id: 'daily-boost', icon: '⚡',            title: 'Активности', subtitle: 'Ежедневные активности',        path: '/daily-boost' },
        { id: 'history',     icon: '📋',             title: 'Статистика',  subtitle: 'Все завершённые тренировки', path: '/history' },
        { id: 'privacy',     icon: '🔒',             title: 'Приватность', subtitle: 'Что видят друзья',           path: '/privacy' }
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

  const showInvite = friendsCount === null || friendsCount < FRIENDS_INVITE_LIMIT

  // Секции внутри карточки профиля (прилипают к шапке через разделитель).
  const sections = []
  if (privacy.showStats) {
    sections.push(
      <div key="stats">
        <div style={styles.statsHead}>
          <span style={styles.statsTitle}>Статистика</span>
          <div style={styles.periodWrap} onClick={(e) => e.stopPropagation()} ref={periodRef}>
            <button style={styles.periodBtn} className="press-tile" onClick={() => { haptic.light(); setPeriodOpen(o => !o) }} aria-label="Период">
              {periodLabel(period)}
              <span style={{ ...styles.periodChev, transform: periodOpen ? 'rotate(180deg)' : 'none' }}>
                <ChevronIcon size={14} color="var(--color-text-secondary)" />
              </span>
            </button>
            {periodOpen && (
              <div style={styles.periodDropdown}>
                {PERIODS.map(p => (
                  <button key={p.id} className="tg-row" style={styles.periodItem} onClick={() => pickPeriod(p.id)}>
                    <span style={{ ...styles.periodItemText, color: p.id === period ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ marginTop: '12px' }}>
          <HistoryStats summary={summary} />
        </div>
      </div>
    )
  }
  if (privacy.showFavorites) {
    if (favorites.length > 0) {
      sections.push(<FavoritesBlock key="fav" items={favorites} bare />)
    } else if (!favLoaded) {
      // Холодный старт без кеша — скелетон, чтобы блок не «выпрыгивал» позже.
      sections.push(
        <div key="fav-sk">
          <div style={styles.favSkTitle}>Любимые упражнения</div>
          {[0, 1, 2].map(i => <div key={i} style={styles.favSkRow} />)}
        </div>
      )
    }
  }

  return (
    <div className="page page-fade" style={styles.page}>

      <ScreenTitle>Профиль</ScreenTitle>

      {/* Профиль: шапка + прилипшие секции (статистика, любимые) — один блок. */}
      <div style={styles.headerWrap}>
        <ProfileHeader
          user={user}
          streak={streak}
          lastWorkout={lastWorkout}
          showLastWorkout={privacy.showLastWorkout}
          interactiveStreak={true}
          sections={sections}
          statsLoading={!loaded}
        />
      </div>

      {/* Пригласить друга */}
      {showInvite && (
        <button onClick={handleInviteTap} style={styles.inviteButton} className="press-tile">
          <UiIcon name="invite-friend" size={22} color="var(--color-primary)" style={styles.inviteIcon} />
          <div style={styles.inviteContent}>
            <div style={styles.inviteTitle}>Пригласить друга</div>
            <div style={styles.inviteSubtitle}>Качайтесь и мотивируйте друг друга</div>
          </div>
          <span style={styles.inviteArrow}>›</span>
        </button>
      )}

      {/* Меню профиля. Перед первым блоком — больше воздуха (конец «профиля» → меню). */}
      {menuGroups.map((group, gi) => (
        <section key={group.title}>
          <div style={{ ...styles.groupTitle, marginTop: gi === 0 ? '40px' : '20px' }}>{group.title}</div>
          <div style={styles.groupCard}>
            {group.items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                className="tg-row"
                style={{ ...styles.row, borderTop: idx === 0 ? 'none' : '1px solid var(--border-hairline)' }}
              >
                {item.icon.startsWith('ui:') ? (
                  <UiIcon name={item.icon.slice(3)} size={22} color={item.iconColor || 'var(--color-text)'} style={{ width: '32px', height: '22px' }} />
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
  page: { paddingTop: 'var(--tg-safe-top)' },
  headerWrap: { margin: '0 0 16px' },
  favSkTitle: { width: '150px', height: '13px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', marginBottom: '14px' },
  favSkRow: { height: '15px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', marginBottom: '11px' },

  statsCard: {
    background: 'var(--surface)', border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)', padding: '14px 16px', marginBottom: '20px'
  },
  statsHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  statsTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px'
  },
  periodWrap: { position: 'relative' },
  periodBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '4px 2px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)'
  },
  periodChev: { display: 'inline-flex', marginTop: '1px', transition: 'transform 0.2s var(--ease-ios)' },
  dropClose: { position: 'fixed', inset: 0, zIndex: 40, cursor: 'pointer' },
  periodDropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, minWidth: '140px', padding: '6px',
    background: 'var(--surface-raised)', border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-medium)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
    display: 'flex', flexDirection: 'column', gap: '2px'
  },
  periodItem: {
    display: 'flex', alignItems: 'center', width: '100%', padding: '9px 12px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-small)', cursor: 'pointer', textAlign: 'left'
  },
  periodItemText: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600 },

  inviteButton: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px',
    background: 'rgba(158, 209, 83, 0.08)', border: '1px solid rgba(158, 209, 83, 0.25)',
    borderRadius: 'var(--radius-medium)', marginBottom: '20px', minHeight: '64px', textAlign: 'left'
  },
  inviteIcon: { fontSize: '22px', width: '32px', textAlign: 'center', flexShrink: 0 },
  inviteContent: { flex: 1, minWidth: 0 },
  inviteTitle: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '2px' },
  inviteSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', color: 'var(--color-text-secondary)' },
  inviteArrow: { fontSize: '18px', color: 'var(--color-primary)', flexShrink: 0, opacity: 0.7 },

  groupTitle: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px',
    color: 'var(--color-text-secondary)', letterSpacing: '3px', marginBottom: '12px', paddingLeft: '4px'
  },
  groupCard: {
    display: 'flex', flexDirection: 'column', background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)', overflow: 'hidden'
  },
  row: {
    display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
    width: '100%', minHeight: '64px', textAlign: 'left', background: 'transparent', border: 'none'
  },
  toggleRow: {
    display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', minHeight: '64px'
  },
  rowIcon: { fontSize: '22px', width: '32px', textAlign: 'center', flexShrink: 0 },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' },
  rowSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', color: 'var(--color-text-secondary)' },
  rowArrow: { fontSize: '18px', color: 'var(--color-text-secondary)', flexShrink: 0 },

  // Переключатель (iOS-style).
  switch: {
    position: 'relative', flexShrink: 0, width: '42px', height: '24px', borderRadius: '12px',
    border: 'none', padding: 0, transition: 'background 0.2s ease', WebkitTapHighlightColor: 'transparent'
  },
  knob: {
    position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px', borderRadius: '50%',
    background: '#FFFFFF', transition: 'transform 0.2s var(--ease-ios)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
  }
}
