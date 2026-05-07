import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { spawnBurst } from './ParticlesBg'

/**
 * Карточка категории на главном экране.
 * Тап → переход на /category/:id, всплеск частиц, хаптик.
 */
export default function CategoryCard({ id, icon, title, subtitle, available = true, comingSoon = false }) {
  const navigate = useNavigate()

  const handleTap = (e) => {
    haptic.light()

    // Всплеск частиц из точки тапа
    const rect = e.currentTarget.getBoundingClientRect()
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 5)

    // Переход на экран категории
    setTimeout(() => navigate(`/category/${id}`), 80)
  }

  return (
    <button
      onClick={handleTap}
      style={{
        ...styles.card,
        opacity: available ? 1 : 0.6
      }}
    >
      <div style={styles.iconWrap}>
        <span style={styles.icon}>{icon}</span>
      </div>

      <div style={styles.content}>
        <div style={styles.title}>{title}</div>
        <div style={styles.subtitle}>
          {subtitle}
          {comingSoon && <span style={styles.soonTag}>СКОРО</span>}
        </div>
      </div>

      <div style={styles.arrow}>›</div>
    </button>
  )
}

const styles = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    textAlign: 'left',
    transition: 'transform 0.1s ease, opacity 0.2s ease'
  },
  iconWrap: {
    width: '56px',
    height: '56px',
    borderRadius: '20px',
    background: 'rgba(255, 255, 255, 0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  icon: {
    fontSize: '32px',
    lineHeight: 1
  },
  content: {
    flex: 1,
    minWidth: 0
  },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '4px'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  soonTag: {
    display: 'inline-block',
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  arrow: {
    fontSize: '24px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}
