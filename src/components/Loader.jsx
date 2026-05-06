import { useEffect } from 'react'

export default function Loader({ onFinish }) {
  useEffect(() => {
    // Через 1.8 сек скрываем лоадер
    const finishTimer = setTimeout(onFinish, 1800)
    return () => clearTimeout(finishTimer)
  }, [onFinish])

  return (
    <div style={styles.container}>
      <div style={styles.bicepsWrapper}>
        <span style={styles.biceps} role="img" aria-label="biceps">💪</span>
      </div>

      <div style={styles.text}>LOADING</div>

      <style>{`
        @keyframes flexBiceps {
          0%   { transform: rotate(0deg) scale(1); }
          45%  { transform: rotate(-6deg) translateY(-2px) scale(1.06); }
          55%  { transform: rotate(-6deg) translateY(-2px) scale(1.06); }
          100% { transform: rotate(0deg) scale(1); }
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
    // Отступ между бицепсом и надписью — 24px
    gap: '24px'
  },
  bicepsWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '110px',
    height: '110px'
  },
  biceps: {
    // Уменьшили ещё на 10%: было 86px → стало 77px
    fontSize: '77px',
    display: 'block',
    lineHeight: 1,
    animation: 'flexBiceps 1.8s ease-in-out infinite',
    transformOrigin: '60% 85%',
    filter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)',
    WebkitFilter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)'
  },
  text: {
    fontFamily: 'var(--font-tiny5)',
    // Уменьшили на ~15%: было 16px → стало 14px
    fontSize: '14px',
    color: 'var(--color-primary)',
    letterSpacing: '3px'
  }
}
