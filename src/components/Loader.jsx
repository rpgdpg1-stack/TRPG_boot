import { useEffect, useState } from 'react'

export default function Loader({ onFinish }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Прогресс-бар плавно заполняется за 1.5 секунды
    const duration = 1500
    const interval = 30
    const step = (interval / duration) * 100

    const timer = setInterval(() => {
      setProgress(prev => {
        const next = prev + step
        if (next >= 100) {
          clearInterval(timer)
          // Когда дошёл до 100% — вызываем onFinish (родитель скроет лоадер)
          setTimeout(onFinish, 100)
          return 100
        }
        return next
      })
    }, interval)

    return () => clearInterval(timer)
  }, [onFinish])

  return (
    <div style={styles.container}>
      <div style={styles.bicepsWrapper}>
        <span style={styles.biceps}>💪</span>
      </div>

      <div style={styles.barContainer}>
        <div style={{ ...styles.barFill, width: `${progress}%` }} />
      </div>

      <div style={styles.text}>RPG LOADING...</div>

      <style>{`
        @keyframes flexBiceps {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.25); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    gap: '32px'
  },
  bicepsWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '120px',
    height: '120px'
  },
  biceps: {
    fontSize: '80px',
    display: 'block',
    animation: 'flexBiceps 0.8s ease-in-out infinite',
    transformOrigin: 'center',
    // Делаем эмодзи "пиксельным" — отключаем сглаживание
    imageRendering: 'pixelated',
    filter: 'contrast(1.05)'
  },
  barContainer: {
    width: '180px',
    height: '4px',
    background: '#222222',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  barFill: {
    height: '100%',
    background: 'var(--color-primary)',
    transition: 'width 0.03s linear'
  },
  text: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--color-primary)',
    letterSpacing: '2px'
  }
}
