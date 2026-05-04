import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'

export default function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  const tabs = [
    { path: '/', label: 'Главная', icon: '💎' },
    { path: '/workout', label: 'Тренировка', icon: 'A', font: 'tiny5' },
    { path: '/progress', label: 'Прогресс', icon: '📊' }
  ]

  const handleTap = (path) => {
    if (location.pathname === path) return
    haptic.light()
    navigate(path)
  }

  return (
    <nav style={styles.tabbar}>
      {tabs.map(tab => {
        const isActive = location.pathname === tab.path
        return (
          <button
            key={tab.path}
            onClick={() => handleTap(tab.path)}
            style={{
              ...styles.tab,
              ...(isActive ? styles.tabActive : {})
            }}
          >
            <span style={{
              ...styles.icon,
              ...(tab.font === 'tiny5' ? styles.iconTiny5 : {}),
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)'
            }}>
              {tab.icon}
            </span>
            <span style={{
              ...styles.label,
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)'
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
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
    padding: '8px',
    background: 'rgba(34, 34, 34, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    zIndex: 100
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    padding: '8px 16px',
    borderRadius: '16px',
    minWidth: '72px',
    transition: 'background 0.2s ease, transform 0.1s ease'
  },
  tabActive: {
    background: 'rgba(158, 209, 83, 0.12)'
  },
  icon: {
    fontSize: '20px',
    lineHeight: 1
  },
  iconTiny5: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '22px'
  },
  label: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.3px'
  }
}
