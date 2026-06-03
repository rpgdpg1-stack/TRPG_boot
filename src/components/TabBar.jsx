import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'
import MuscleIcon from './MuscleIcon'
import { getMyFriendsPlace } from '../lib/leaderboard'
import { EVENTS, on } from '../lib/events'

/**
 * Таб-бар — 3 вкладки: Статистика / Тренировки / Профиль.
 *
 * Восстановление (Recovery) перенесено внутрь профиля — оно будет доступно
 * из настроек профиля (страницу пока не переделываем, но из таб-бара убрали).
 *
 * НЕ показывается на экранах тренировки (/workout/...) и замены упражнения
 * (/swap/...) — там юзеру нужен фокус, таб-бар отвлекает и закрывает
 * нижнюю кнопку.
 */
export default function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  // Тик для разового "флекса" бицепса на кнопке Тренировки при каждом нажатии.
  const [muscleFlexTick, setMuscleFlexTick] = useState(0)
  // Тик для "pop"-увеличения иконки профиля при тапе.
  const [profilePopTick, setProfilePopTick] = useState(0)
  // Тик для "pop" кубка рейтинга при тапе.
  const [ratingPopTick, setRatingPopTick] = useState(0)
  // Место среди друзей для бейджа #N на вкладке рейтинга.
  const [friendsPlace, setFriendsPlace] = useState(1)

  useEffect(() => {
    const load = () => { getMyFriendsPlace().then(setFriendsPlace) }
    load()
    const offReady = on(EVENTS.USER_READY, load)
    const offChanged = on(EVENTS.USER_CHANGED, load)
    return () => { offReady(); offChanged() }
  }, [])

  // Прячем таб-бар на экранах тренировки и замены упражнений
  const isHiddenOnPath =
    location.pathname.startsWith('/workout') ||
    location.pathname.startsWith('/swap') ||
    location.pathname.startsWith('/exercise')

  if (isHiddenOnPath) return null

  const isWorkoutSection = location.pathname === '/' ||
                           location.pathname.startsWith('/category')

  const isExactHome = location.pathname === '/'

  const tabs = [
    {
      id: 'rating',
      path: '/leaderboard?tab=friends',
      label: 'Рейтинг',
      iconName: 'leaderboard',
      isActive: location.pathname === '/leaderboard',
      canTap: location.pathname !== '/leaderboard'
    },
    {
      id: 'workouts',
      path: '/',
      label: 'Тренировки',
      iconName: 'muscles',
      isActive: isWorkoutSection,
      canTap: !isExactHome
    },
    {
      id: 'profile',
      path: '/profile',
      label: 'Профиль',
      iconName: 'profile',
      isActive: location.pathname === '/profile',
      canTap: location.pathname !== '/profile'
    }
  ]

  const handleTap = (tab) => {
    haptic.light()
    // Анимации при каждом тапе (даже если вкладка уже активна).
    if (tab.id === 'workouts') setMuscleFlexTick(t => t + 1)
    if (tab.id === 'profile') setProfilePopTick(t => t + 1)
    if (tab.id === 'rating') setRatingPopTick(t => t + 1)
    if (!tab.canTap) return
    navigate(tab.path)
  }

  return (
    <nav style={styles.tabbar}>
      <style>{`
        @keyframes tabIconPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.28); }
          100% { transform: scale(1); }
        }
      `}</style>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => handleTap(tab)}
          style={{
            ...styles.tab,
            background: tab.isActive
              ? 'rgba(158, 209, 83, 0.10)'
              : 'transparent',
            boxShadow: tab.isActive
              ? 'inset 0 0 0 1px rgba(158, 209, 83, 0.25)'
              : 'none',
            cursor: tab.canTap ? 'pointer' : 'default'
          }}
        >
          <span style={{
            ...styles.icon,
            opacity: tab.isActive ? 1 : 0.45,
            filter: tab.isActive ? 'drop-shadow(0 0 6px rgba(158, 209, 83, 0.4))' : 'none'
          }}>
            {tab.id === 'workouts' ? (
              <MuscleIcon
                size={32}
                color={tab.isActive ? '#FADFBE' : 'rgba(255,255,255,0.5)'}
                flexTrigger={muscleFlexTick}
              />
            ) : tab.id === 'profile' ? (
              <span
                key={`profilepop-${profilePopTick}`}
                style={{
                  display: 'inline-flex',
                  animation: profilePopTick ? 'tabIconPop 0.4s ease-out' : 'none'
                }}
              >
                <UiIcon
                  name="profile"
                  size={32}
                  color={tab.isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.5)'}
                />
              </span>
            ) : tab.id === 'rating' ? (
              <span
                key={`ratingpop-${ratingPopTick}`}
                style={{
                  display: 'inline-flex',
                  animation: ratingPopTick ? 'tabIconPop 0.4s ease-out' : 'none'
                }}
              >
                <UiIcon
                  name="leaderboard"
                  size={32}
                  color={tab.isActive ? '#FFD700' : 'rgba(255,255,255,0.5)'}
                />
              </span>
            ) : tab.iconName ? (
              <UiIcon
                name={tab.iconName}
                size={32}
                color={tab.isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.5)'}
              />
            ) : (
              tab.icon
            )}
          </span>
          <span style={{
            ...styles.label,
            color: tab.isActive ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.5)'
          }}>
            {tab.id === 'rating' ? (
              <span style={{
                fontFamily: 'var(--font-tiny5)',
                letterSpacing: '0.5px',
                color: tab.isActive ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.5)'
              }}>
                #{friendsPlace}
              </span>
            ) : (
              tab.label
            )}
          </span>
        </button>
      ))}
    </nav>
  )
}

const styles = {
  tabbar: {
    position: 'fixed',
    bottom: 'var(--tabbar-bottom)',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px',
    height: 'var(--tabbar-height)',
    background: 'rgba(20, 20, 20, 0.55)',
    backdropFilter: 'blur(32px) saturate(160%)',
    WebkitBackdropFilter: 'blur(32px) saturate(160%)',
    borderRadius: 'var(--radius-card)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(255, 255, 255, 0.03)',
    zIndex: 100
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '0 12px',
    minWidth: '78px',
    height: 'calc(var(--tabbar-height) - 8px)',
    borderRadius: 'var(--radius-card)',
    transition: 'background 0.25s ease, box-shadow 0.25s ease',
    border: 'none'
  },
  icon: {
    fontSize: '30px',
    lineHeight: 1,
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.25s ease, filter 0.25s ease'
  },
  label: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    transition: 'color 0.25s ease',
    whiteSpace: 'nowrap'
  }
}