import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser, isTelegramEnv, confirm as tgConfirm } from '../lib/telegram'
import { signOut } from '../lib/auth'
import { getWeeklyStreak, getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { getFriendsList } from '../lib/friends-list'
import { getCurrentUser } from '../lib/auth'
import { resolveWeeklyStreak } from '../utils/dates'
import { shareReferralLink } from '../lib/friends'
import { getPrivacy } from '../lib/privacy'
import { getFavoriteExercises, getFavoritesSync } from '../lib/favorite-exercises'
import { getRecords, getRecordsSync } from '../lib/records'
import { hasRecords } from '../components/PersonalRecords'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT } from '../utils/history'
import { EVENTS, on } from '../lib/events'
import ProfileHeader from '../components/ProfileHeader'
import ProfileMetrics from '../components/ProfileMetrics'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import { SectionLabel } from '../components/GroupLabel'

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
  // Рекорды — тот же блок, что внизу экрана статистики. Старт из кеша
  // (мгновенно), сервер догоняет.
  const [records, setRecords] = useState(() => getRecordsSync())
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
      getRecords().then(setRecords)
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
  // В карточке профиля статистика переключается Месяц/Год (по умолчанию — год),
  // поэтому считаем обе сводки сразу.
  const stats = {
    week: summarizeWorkouts(workouts, 'week', new Date()),
    month: summarizeWorkouts(workouts, 'month', new Date()),
    year: summarizeWorkouts(workouts, 'year', new Date()),
    all: summarizeWorkouts(workouts, 'all', new Date())
  }

  // Меню профиля: активности и телесные разделы + системное. Статистика и
  // любимые живут на главной.
  const insideTelegram = isTelegramEnv()

  const menuGroups = [
    {
      title: 'Профиль',
      items: [
        { id: 'personal',     icon: 'ui:personal', iconColor: 'var(--color-text-secondary)', title: 'Личные данные',  subtitle: 'Пол · Рост · Возраст', path: '/personal-data' },
        { id: 'measurements', icon: 'ui:measure',  iconColor: 'var(--color-text-secondary)', title: 'Замеры тела',    subtitle: 'Обхваты · История', path: '/measurements' },
        { id: 'goal',         icon: 'ui:goal',     iconColor: 'var(--color-text-secondary)', title: 'Цель',           subtitle: 'Что хочешь достичь', path: '/goal' }
      ]
    },
    {
      title: 'Система',
      items: [
        { id: 'account',  icon: 'ui:mail',     iconColor: 'var(--color-text-secondary)', title: 'Вход',      subtitle: 'Telegram · Почта', path: '/account' },
        { id: 'settings', icon: 'ui:settings', iconColor: 'var(--color-text-secondary)', title: 'Настройки', subtitle: 'Уведомления · Сброс прогресса', path: '/settings' },
        // Выход есть ТОЛЬКО в браузере. В Telegram выходить некуда: приложение
        // узнаёт человека по подписи Telegram при каждом запуске, и кнопка
        // означала бы «выйти и тут же зайти обратно».
        ...(insideTelegram ? [] : [{
          id: 'logout', icon: 'ui:logout', iconColor: 'var(--color-error)',
          title: 'Выйти', subtitle: 'Вход снова — по коду из письма',
          action: 'logout', danger: true
        }])
      ]
    }
  ]

  const handleSectionTap = async (item) => {
    if (item.action === 'logout') {
      haptic.medium()
      const ok = await tgConfirm('Выйти из аккаунта? Чтобы вернуться, понадобится код из письма.')
      if (!ok) return
      await signOut()
      // Перезагрузка, а не переход: после выхода приложение должно собраться
      // заново, с чистого листа — иначе на экранах останутся данные ушедшего.
      window.location.replace('/')
      return
    }
    if (!item.path) return
    haptic.light()
    navigate(item.path, { state: { from: '/profile' } })
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
  const showRec = privacy.showRecords && hasRecords(records)
  const nothingToShow = !privacy.showStats && !showFav && !showRec
  const sections = [
    nothingToShow
      ? <div key="hidden" style={styles.hiddenNote}>Инфо скрыто</div>
      : (
        <ProfileMetrics
          key="metrics"
          stats={privacy.showStats ? stats : null}
          records={showRec ? records : null}
          favorites={showFav ? favorites : []}
          showWeights={privacy.showWeights}
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
          <SectionLabel style={{ marginTop: gi === 0 ? 'var(--space-10)' : 'var(--space-5)' }}>{group.title}</SectionLabel>
          <div style={styles.groupCard}>
            {group.items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                className={(item.path || item.action) ? 'tg-row' : undefined}
                disabled={!item.path && !item.action}
                style={{
                  ...styles.row,
                  borderTop: idx === 0 ? 'none' : '1px solid var(--border-hairline)'
                }}
              >
                {item.icon.startsWith('ui:') ? (
                  <UiIcon name={item.icon.slice(3)} size={22} color={item.iconColor || 'var(--color-text)'} style={{ width: '32px', height: '22px' }} />
                ) : (
                  <span style={styles.rowIcon}>{item.icon}</span>
                )}
                <div style={styles.rowContent}>
                  <div style={{ ...styles.rowTitle, ...(item.danger ? { color: 'var(--color-error)' } : null) }}>{item.title}</div>
                  <div style={styles.rowSubtitle}>{item.subtitle}</div>
                </div>
                {!item.danger && <span style={styles.rowArrow}>›</span>}
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
  headerWrap: { margin: '0 0 var(--space-4)' },
  hiddenNote: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-text-secondary)',
    textAlign: 'center', padding: 'var(--space-1) var(--space-3)'
  },

  // Как строка меню профиля: серая карточка со скруглением radius-card. Зелёного
  // фона и рамки нет — акцент несут только текст и иконка.
  inviteButton: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)',
    background: 'var(--color-card)', border: 'none',
    borderRadius: 'var(--radius-card)', marginBottom: 'var(--space-5)', minHeight: '64px', textAlign: 'left'
  },
  inviteIcon: { fontSize: 'var(--text-heading-size)', width: '32px', textAlign: 'center', flexShrink: 0 },
  inviteContent: { flex: 1, minWidth: 0 },
  inviteTitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700, color: 'var(--color-primary)', marginBottom: 'var(--space-05)' },
  inviteSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', color: 'var(--color-text-secondary)' },
  inviteArrow: { fontSize: 'var(--text-title-size)', color: 'var(--color-primary)', flexShrink: 0, opacity: 0.7 },

  groupCard: {
    display: 'flex', flexDirection: 'column', background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)', overflow: 'hidden'
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)',
    width: '100%', minHeight: '64px', textAlign: 'left', background: 'transparent', border: 'none'
  },
  rowIcon: { fontSize: 'var(--text-heading-size)', width: '32px', textAlign: 'center', flexShrink: 0 },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700, color: 'var(--color-text)', marginBottom: 'var(--space-05)' },
  rowSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', color: 'var(--color-text-secondary)' },
  rowArrow: { fontSize: 'var(--text-title-size)', color: 'var(--color-text-secondary)', flexShrink: 0 }
}
