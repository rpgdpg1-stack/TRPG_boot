import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'

/**
 * Таб-бар с тремя кнопками: Прогресс / Тренировки / Настройки
 * Активная кнопка поднимается на 5px и масштабируется.
 * Под активной появляется пиксельная подсветка из 4 квадратиков.
 */
export default function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  // Если мы на главной или на дочерних экранах /category /program — активна "Тренировки"
  const isWorkoutSection = location.pathname === '/' ||
                           location.pathname.startsWith('/category') ||
                           location.pathname.startsWith('/program')

  const tabs = [
    {
      id: 'progress',
      path: '/progress',
      label: 'Прогресс',
      icon: '📊',
      isActive: location.pathname === '/progress'
    },
    {
      id: 'workouts',
      path: '/',
      label: 'Тренировки',
      icon: '💪',
      isActive: isWorkoutSection
    },
    {
      id: 'settings',
      path: '/settings',
      label: 'Настройки',
      icon: '⚙️',
      isActive: location.pathname === '/settings'
    }
  ]

  const handleTap = (tab) => {
    if (tab.isActive) return
    haptic.light()
    navigate(tab.path)
  }

  return (
    <nav style={styles.tabbar}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => handleTap(tab)}
          style={styles.tab}
        >
          {/* Иконка с эффектом выпирания при активности */}
          <div style={{
            ...styles.iconWrap,
            transform: tab.isActive ? 'translateY(-5px) scale(1.08)' : 'translateY(0) scale(1)'
          }}>
            <span style={{
              ...styles.icon,
              filter: tab.isActive ? 'none' : 'grayscale(0.5) opacity(0.6)'
            }}>
              {tab.icon}
            </span>
          </div>

          {/* Лейбл */}
          <span style={{
            ...styles.label,
            color: tab.isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            transform: tab.isActive ? 'translateY(-2px)' : 'translateY(0)'
          }}>
            {tab.label}
          </span>

          {/* Пиксельная подсветка под активной */}
          {tab.isActive && (
            <div style={styles.pixelGlow}>
              <span style={styles.pixel} />
              <span style={styles.pixel} />
              <span style={styles.pixel} />
              <span style={styles.pixel} />
            </div>
          )}
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
    gap: '4px',
    padding: '10px',
    background: 'rgba(34, 34, 34, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    zIndex: 100
  },
  tab: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '2px',
    padding: '6px 16px 4px',
    minWidth: '76px',
    height: '50px'
  },
  iconWrap: {
    transition: 'transform 0.25s var(--ease-ios)',
    lineHeight: 1
  },
  icon: {
    fontSize: '22px',
    transition: 'filter 0.2s ease',
    display: 'block'
  },
  label: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    transition: 'transform 0.25s var(--ease-ios), color 0.2s ease'
  },
  pixelGlow: {
    position: 'absolute',
    bottom: '-2px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '2px'
  },
  pixel: {
    width: '3px',
    height: '3px',
    background: 'var(--color-primary)',
    boxShadow: '0 0 6px var(--color-primary)'
  }
}
