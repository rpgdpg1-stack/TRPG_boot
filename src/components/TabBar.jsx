import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'
import MuscleIcon from './MuscleIcon'

/**
 * Таб-бар — 3 вкладки: Друзья / Тренировки / Профиль.
 *
 * Цвета:
 *  - Активный таб: фон сплошной серый (--color-card-hover), лейбл белый.
 *  - Друзья: иконка БЕЛАЯ при активе
 *  - Тренировки: иконка бицепса бежевая (#FADFBE) при активе
 *  - Профиль: иконка БЕЛАЯ при активе
 *  - Неактив везде: иконка/лейбл rgba(255,255,255,0.5)
 *
 * Не показывается на экранах тренировки (/workout/...), замены (/swap/...)
 * и инфо упражнения (/exercise/...).
 */
export default function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  const [muscleFlexTick, setMuscleFlexTick] = useState(0)
  const [profilePopTick, setProfilePopTick] = useState(0)
  const [friendsPopTick, setFriendsPopTick] = useState(0)

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
      id: 'friends',
      path: '/friends',
      label: 'Друзья',
      iconName: 'friends',
      isActive: location.pathname === '/friends',
      canTap: location.pathname !== '/friends'
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
    if (tab.id === 'workouts') setMuscleFlexTick(t => t + 1)
    if (tab.id === 'profile') setProfilePopTick(t => t + 1)
    if (tab.id === 'friends') setFriendsPopTick(t => t + 1)
    if (!tab.canTap) return
    navigate(tab.path)
  }

  return (
    <nav style={styles.tabbar}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => handleTap(tab)}
          style={{
            ...styles.tab,
            background: tab.isActive
              ? 'var(--color-card-hover)'
              : 'transparent',
            boxShadow: 'none',
            cursor: tab.canTap ? 'pointer' : 'default'
          }}
        >
          <span style={{
            ...styles.icon,
            opacity: tab.isActive ? 1 : 0.45
          }}>
            {tab.id === 'workouts' ? (
              <MuscleIcon
                size={32}
                color={tab.isActive ? '#FADFBE' : 'rgba(255,255,255,0.5)'}
                flexTrigger={tab.isActive ? muscleFlexTick : 0}
              />
            ) : tab.id === 'profile' ? (
              <span
                key={`profilepop-${profilePopTick}`}
                style={{
                  display: 'inline-flex',
                  transformOrigin: 'center center',
                  animation: (profilePopTick && tab.isActive) ? 'tabIconPop 0.4s ease-out' : 'none'
                }}
              >
                <UiIcon
                  name="profile"
                  size={32}
                  color={tab.isActive ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
                />
              </span>
            ) : tab.id === 'friends' ? (
              <span
                key={`friendspop-${friendsPopTick}`}
                style={{
                  display: 'inline-flex',
                  transformOrigin: 'center center',
                  animation: (friendsPopTick && tab.isActive) ? 'tabIconPop 0.4s ease-out' : 'none'
                }}
              >
                <UiIcon
                  name="friends"
                  size={32}
                  color={tab.isActive ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
                />
              </span>
            ) : null}
          </span>
          <span style={{
            ...styles.label,
            color: tab.isActive ? 'var(--color-text)' : 'rgba(255, 255, 255, 0.5)'
          }}>
            {tab.label}
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
    gap: '0',
    padding: '4px',
    height: 'var(--tabbar-height)',
    // Фон как у самой прозрачной кнопки «Завершить» (вариант dim ActionButton):
    // лёгкий тёмный фон + слабый блюр. Токены: surface-dim + border.
    background: 'var(--color-surface-dim)',
    backdropFilter: 'blur(var(--blur-sm))',
    WebkitBackdropFilter: 'blur(var(--blur-sm))',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--color-border)',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    zIndex: 100
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '0 12px',
    width: '90px',
    height: 'calc(var(--tabbar-height) - 8px)',
    borderRadius: 'var(--radius-pill)',
    transition: 'background 0.25s ease, box-shadow 0.25s ease',
    border: 'none'
  },
  icon: {
    width: '32px',
    height: '32px',
    lineHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.25s ease'
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