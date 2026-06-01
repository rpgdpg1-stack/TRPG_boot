import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'
import MuscleIcon from './MuscleIcon'

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
      id: 'progress',
      path: '/progress',
      label: 'Статистика',
      icon: '📊',
      isActive: location.pathname === '/progress',
      canTap: location.pathname !== '/progress'
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
    // Бицепс флексит при каждом тапе на "Тренировки" (даже если уже активна).
    if (tab.id === 'workouts') setMuscleFlexTick(t => t + 1)
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
                size={24}
                color={tab.isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.5)'}
                flexTrigger={muscleFlexTick}
              />
            ) : tab.iconName ? (
              <UiIcon
                name={tab.iconName}
                size={24}
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
    fontSize: '22px',
    lineHeight: 1,
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