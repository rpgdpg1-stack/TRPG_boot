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
import XPBar from '../components/XPBar'
import UiIcon from '../components/UiIcon'
import { getLevelFromXP, getRankByLevel, getLevelProgress, getTotalXPProgress } from '../lib/levels'

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
        { id: 'sections',    icon: '🗂️',            title: 'Разделы',     subtitle: 'Силовая · Плавание · Кардио', path: '/sections' },
        { id: 'favorites',   icon: '❤️',            title: 'Избранное',   subtitle: 'Закреплённые программы',       path: '/favorites' },
        { id: 'daily-boost', icon: '⚡',            title: 'Дневной буст', subtitle: 'Ежедневные квесты',           path: '/daily-boost' },
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

  // Мускул + прогресс-бар (тот же XPBar, что был на главной у игрока) — под
  // карточкой профиля. Прогресс/цвет считаем из мускулов, как в PlayerCard.
  const level = getLevelFromXP(stats.xp)
  const rank = getRankByLevel(level)
  const xpProgress = getLevelProgress(stats.xp)
  const { current: xpCurrent, needed: xpNeeded } = getTotalXPProgress(stats.xp)

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
          onPlaceTap={handlePlaceTap}
        />

        {/* Мускул + прогресс-бар (перенесён с главной, без серии). */}
        <div style={styles.xpCard}>
          <XPBar progress={xpProgress} color={rank.color} current={xpCurrent} needed={xpNeeded} />
        </div>
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
  // Верхний отступ как у playerSticky на главной (16px ниже кнопок Telegram).
  page: {
    paddingTop: 'var(--tg-safe-top)'
  },
  // Тот же блок, что друзья видят при тапе на тебя (PlayerProfileModal): там он
  // ограничен maxWidth 340 — повторяем 1:1 (по центру), иначе на странице профиля
  // он растягивался на всю ширину и выглядел крупнее. ProfileHeader тот же,
  // размеры шрифтов фиксированы — разница была только в ширине контейнера.
  headerWrap: {
    maxWidth: '340px',
    margin: '0 auto 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  // Карточка с мускул+прогресс-баром под шапкой профиля (стиль как у шапки).
  xpCard: {
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)'
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