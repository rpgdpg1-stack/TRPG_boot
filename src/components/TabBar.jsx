import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'

/**
 * Таб-бар — премиум-look (E3):
 * - Полупрозрачный фон с сильным блюром, "стеклянный" эффект
 * - Активная вкладка — тонкое зелёное свечение
 * - "Тренировки" возвращает на главную с любого экрана раздела
 */
export default function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  const isWorkoutSection = location.pathname === '/' ||
                           location.pathname.startsWith('/category') ||
                           location.pathname.startsWith('/program') ||
                           location.pathname.startsWith('/workout')

  const isExactHome = location.pathname === '/'

  const tabs = [
    {
      id: 'progress',
      path: '/progress',
      label: 'Прогресс',
      icon: '📊',
      isActive: location.pathname === '/progress',
      canTap: location.pathname !== '/progress'
    },
    {
      id: 'workouts',
      path: '/',
      label: 'Тренировки',
      icon: '💪',
      isActive: isWorkoutSection,
      canTap: !isExactHome
    },
    {
      id: 'settings',
      path: '/settings',
      label: 'Настройки',
      icon: '⚙️',
      isActive: location.pathname === '/settings',
      canTap: location.pathname !== '/settings'
    }
  ]

  const handleTap = (tab) => {
    if (!tab.canTap) return
    haptic.light()
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
            {tab.icon}
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
    // E3: премиум стекло — сильнее блюр, меньше серого
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
    padding: '0 18px',
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
    transition: 'color 0.25s ease'
  }
}
