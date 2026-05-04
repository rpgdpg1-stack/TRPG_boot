import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'

export default function Home() {
  const navigate = useNavigate()

  const programs = [
    {
      id: 'gym',
      icon: '🏋️',
      title: 'Зал',
      subtitle: 'ПРОГРАММА A • B • C',
      action: 'НАЧАТЬ ДЕНЬ A',
      enabled: true
    },
    {
      id: 'pool',
      icon: '🏊',
      title: 'Бассейн',
      subtitle: 'КАРДИО ПЛАН',
      action: null,
      enabled: false
    },
    {
      id: 'stretch',
      icon: '🧘',
      title: 'Растяжка',
      subtitle: 'МОБИЛЬНОСТЬ',
      action: null,
      enabled: false
    }
  ]

  const handleProgramTap = (program) => {
    haptic.light()
    if (program.id === 'gym') {
      navigate('/workout')
    } else {
      // Заглушка для бассейна и растяжки — пока ничего не делаем
      // На Шаге 6 добавим экран "скоро"
    }
  }

  const handleCreateTap = () => {
    haptic.light()
    // Заглушка — функция будет позже
  }

  return (
    <div className="page page-enter" style={styles.page}>
      {/* Логотип */}
      <div style={styles.logoBlock}>
        <h1 style={styles.logo}>RPG</h1>
        <div style={styles.logoSubtitle}>TRAINING APP</div>
        <div style={styles.dots}>
          {[...Array(7)].map((_, i) => (
            <span key={i} style={styles.dot} />
          ))}
        </div>
      </div>

      {/* Карточки программ */}
      <div style={styles.cards}>
        {programs.map(program => (
          <button
            key={program.id}
            onClick={() => handleProgramTap(program)}
            style={{
              ...styles.programCard,
              opacity: program.enabled ? 1 : 0.55
            }}
          >
            <div style={styles.programIcon}>
              <span style={styles.programIconEmoji}>{program.icon}</span>
            </div>
            <div style={styles.programContent}>
              <div style={styles.programTitle}>{program.title}</div>
              <div style={styles.programSubtitle}>{program.subtitle}</div>
              {program.action && (
                <div style={styles.programAction}>{program.action}</div>
              )}
            </div>
            <div style={styles.programArrow}>›</div>
          </button>
        ))}
      </div>

      {/* Создать тренировку */}
      <button onClick={handleCreateTap} style={styles.createButton}>
        + СОЗДАТЬ ТРЕНИРОВКУ
      </button>
    </div>
  )
}

const styles = {
  page: {
    padding: '32px 16px 24px'
  },
  logoBlock: {
    textAlign: 'center',
    marginBottom: '32px'
  },
  logo: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '72px',
    color: 'var(--color-primary)',
    letterSpacing: '4px',
    lineHeight: 1,
    marginBottom: '8px'
  },
  logoSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    letterSpacing: '4px',
    marginBottom: '12px'
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px'
  },
  dot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: 'var(--color-text-secondary)',
    opacity: 0.5
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px'
  },
  programCard: {
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
  programIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '20px',
    background: 'rgba(255, 255, 255, 0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  programIconEmoji: {
    fontSize: '32px'
  },
  programContent: {
    flex: 1,
    minWidth: 0
  },
  programTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  programSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  programAction: {
    display: 'inline-block',
    marginTop: '8px',
    padding: '5px 10px',
    background: 'var(--color-primary-dark)',
    color: 'var(--color-primary)',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    letterSpacing: '1px',
    borderRadius: '8px'
  },
  programArrow: {
    fontSize: '24px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  },
  createButton: {
    width: '100%',
    padding: '20px',
    border: '1.5px dashed rgba(255, 255, 255, 0.15)',
    borderRadius: 'var(--radius-card)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    background: 'transparent'
  }
}
