import { useEffect, useState } from 'react'

export default function Loader({ onFinish }) {
  const [dots, setDots] = useState(1)

  useEffect(() => {
    // Анимация точек: 1 → 2 → 3 → 1 → ...
    const dotsTimer = setInterval(() => {
      setDots(prev => (prev % 3) + 1)
    }, 400)

    // Через 1.8 сек скрываем лоадер
    const finishTimer = setTimeout(onFinish, 1800)

    return () => {
      clearInterval(dotsTimer)
      clearTimeout(finishTimer)
    }
  }, [onFinish])

  return (
    <div style={styles.container}>
      <div style={styles.bicepsWrapper}>
        <span style={styles.biceps} role="img" aria-label="biceps">💪</span>
      </div>

      {/* Контейнер текста — центрирован, точки в отдельном абсолютном блоке справа */}
      <div style={styles.textWrapper}>
        <span style={styles.text}>LOADING</span>
        <span style={styles.dotsBlock}>{'.'.repeat(dots)}</span>
      </div>

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
    gap: '40px'
  },
  bicepsWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '120px',
    height: '120px'
  },
  biceps: {
    // Уменьшили на ~10%: было 96px → стало 86px
    fontSize: '86px',
    display: 'block',
    lineHeight: 1,
    animation: 'flexBiceps 1.8s ease-in-out infinite',
    transformOrigin: '60% 85%',
    filter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)',
    WebkitFilter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)'
  },
  // Обёртка текста — центрирует надпись, точки висят справа отдельно
  textWrapper: {
    position: 'relative',
    display: 'inline-block'
  },
  text: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '16px',
    color: 'var(--color-primary)',
    letterSpacing: '3px'
  },
  // Точки выходят за правую границу слова LOADING — текст центруется по слову
  dotsBlock: {
    position: 'absolute',
    left: '100%',
    top: 0,
    fontFamily: 'var(--font-tiny5)',
    fontSize: '16px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    paddingLeft: '3px'
  }
}
