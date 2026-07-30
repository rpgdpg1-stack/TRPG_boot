import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getWeeklyStreak, getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { getFriendsList } from '../lib/friends-list'
import { getCurrentUser } from '../lib/auth'
import { resolveWeeklyStreak } from '../utils/dates'
import { shareReferralLink } from '../lib/friends'
import { getPrivacy } from '../lib/privacy'
import { getFavoriteExercises, getFavoritesSync } from '../lib/favorite-exercises'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT, MONTHS_RU } from '../utils/history'
import { EVENTS, on } from '../lib/events'
import ProfileHeader from '../components/ProfileHeader'
import ProfileMetrics from '../components/ProfileMetrics'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'

const FRIENDS_INVITE_LIMIT = 3

/**
 * Экран «Профиль» — личное: карточка профиля (аватар/имя/серия/последняя + то,
 * что видят друзья по приватности: тоталы статистики и любимые строкой) +
 * приватность и настройки. Тренировочные РАЗДЕЛЫ-входы (Статистика/Любимые/
 * Активности) переехали на главную — в МЕНЮ профиля их нет.
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
      getFavoriteExercises().then(list => setFavorites(list))
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
  // В профиле статистика — за ТЕКУЩИЙ МЕСЯЦ (за год/всё время в карточке профиля
  // не читается; вся история — на /history).
  const summary = summarizeWorkouts(workouts, 'month', new Date())
  const monthLabel = MONTHS_RU[new Date().getMonth()]

  // Меню профиля: активности и телесные разделы + системное. Статистика и
  // любимые живут на главной. Пункты без экрана помечены `soon`.
  const menuGroups = [
    {
      title: 'Профиль',
      items: [
        { id: 'activities',   icon: 'ui:activity', iconColor: '#EAB308', title: 'Активности',     subtitle: 'Утро · День · Вечер',      path: '/daily-boost' },
        { id: 'recovery',     icon: 'ui:recovery', iconColor: '#06B6D4', title: 'Восстановление', subtitle: 'Сон · Питание · Здоровье', path: '/recovery' },
        { id: 'personal',     icon: 'ui:personal', title: 'Личные данные',  subtitle: 'Пол · Рост · Возраст',     soon: true },
        { id: 'measurements', icon: 'ui:measure',  title: 'Замеры тела',    subtitle: 'Вес · Объёмы · Фото',      soon: true },
        { id: 'goal',         icon: 'ui:goal',     title: 'Цель',           subtitle: 'Что хочешь достичь',       soon: true }
      ]
    },
    {
      title: 'Система',
      items: [
        { id: 'settings', icon: 'ui:settings', iconColor: 'var(--color-text-secondary)', title: 'Настройки', subtitle: 'Уведомления · Сброс прогресса', path: '/settings' }
      ]
    }
  ]

  const handleSectionTap = (item) => {
    if (item.soon) return
    haptic.light()
    if (item.path) navigate(item.path, { state: { from: '/profile' } })
  }

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  const showInvite = friendsCount === null || friendsCount < FRIENDS_INVITE_LIMIT

  // Секция внутри карточки профиля (то же, что видят друзья по приватности):
  // ряд метрик «N трен» / «N упр», тап → попап с детализацией.
  const showFav = privacy.showFavorites && favorites.length > 0
  // Скрыл и статистику, и любимые — показываем ту же опорную строку, что у друга:
  // пустая карточка читалась бы как поломка.
  const nothingToShow = !privacy.showStats && !showFav
  const sections = [
    nothingToShow
      ? <div key="hidden" style={styles.hiddenNote}>Инфо скрыто</div>
      : (
        <ProfileMetrics
          key="metrics"
          summary={privacy.showStats ? summary : null}
          favorites={showFav ? favorites : []}
          showWeights={privacy.showWeights}
          periodLabel={monthLabel}
        />
      )
  ]

  return (
    <div className="page page-fade" style={styles.page}>

      <ScreenTitle>Профиль</ScreenTitle>

      {/* Карточка профиля: шапка + прилипшие секции (то, что видят друзья по
          приватности: тоталы статистики, любимые строкой). */}
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
                className={item.soon ? undefined : 'tg-row'}
                disabled={item.soon}
                style={{
                  ...styles.row,
                  borderTop: idx === 0 ? 'none' : '1px solid var(--border-hairline)',
                  ...(item.soon ? styles.rowSoon : {})
                }}
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
                {item.soon ? <span style={styles.soonTag}>Скоро</span> : <span style={styles.rowArrow}>›</span>}
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
  hiddenNote: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)',
    textAlign: 'center', padding: '4px 12px'
  },

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

  // Заголовок группы — единый стиль заголовков секций: Manrope, обычный регистр
  // («Тело», не «ТЕЛО»), без моношрифта и большого трекинга.
  groupTitle: {
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '13px',
    color: 'var(--color-text-secondary)', letterSpacing: '0.2px', marginBottom: '12px', paddingLeft: '4px'
  },
  groupCard: {
    display: 'flex', flexDirection: 'column', background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)', overflow: 'hidden'
  },
  row: {
    display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
    width: '100%', minHeight: '64px', textAlign: 'left', background: 'transparent', border: 'none'
  },
  // Пункт «Скоро»: приглушён, некликабелен (без стрелки, с бейджем).
  rowSoon: { opacity: 0.5, cursor: 'default' },
  rowIcon: { fontSize: '22px', width: '32px', textAlign: 'center', flexShrink: 0 },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' },
  rowSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '11px', color: 'var(--color-text-secondary)' },
  rowArrow: { fontSize: '18px', color: 'var(--color-text-secondary)', flexShrink: 0 },
  soonTag: {
    flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '10px',
    letterSpacing: '1px', color: 'var(--color-text-secondary)', textTransform: 'uppercase'
  }
}
