import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'

/**
 * Таб-бар: Прогресс / Тренировки / Настройки.
 *
 * Е1-fix: "Тренировки" теперь возвращает на главную (/) с любого
 * экрана раздела тренировок (категория/программа/день).
 * Если уже на главной — ничего не делает.
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
      // Прогресс — если уже на /progress, не реагируем
      canTap: location.pathname !== '/progress'
    },
    {
      id: 'workouts',
      path: '/',
      label: 'Тренировки',
      icon: '💪',
      isActive: isWorkoutSection,
      // Тренировки активны на всем разделе, но кликабельны только если НЕ ровно на /
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
            background: tab.isActive && isExactHome === (tab.id === 'workouts') && tab.id === 'workouts'
              ? 'rgba(255, 255, 255, 0.08)'
              : tab.isActive
                ? 'rgba(255, 255, 255, 0.08)'
                : 'transparent',
            cursor: tab.canTap ? 'pointer' : 'default'
          }}
        >
          <span style={{
            ...styles.icon,
            opacity: tab.isActive ? 1 : 0.55
          }}>
            {tab.icon}
          </span>
          <span style={{
            ...styles.label,
            color: tab.isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)'
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
    background: 'rgba(34, 34, 34, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 'var(--radius-card)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
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
    transition: 'background 0.2s ease'
  },
  icon: { fontSize: '22px', lineHeight: 1, transition: 'opacity 0.2s ease' },
  label: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    transition: 'color 0.2s ease'
  }
}
