import { useEffect, useRef } from 'react'

export default function Loader({ onFinish }) {
  const sceneRef = useRef(null)

  useEffect(() => {
    // 1) Закрываем лоадер через 1.8 сек
    const finishTimer = setTimeout(onFinish, 1800)

    // 2) Спавним частицы вокруг бицепса каждые 250 мс
    const spawnParticle = () => {
      const scene = sceneRef.current
      if (!scene) return

      const particle = document.createElement('div')
      particle.style.cssText = `
        position: absolute;
        width: 4px;
        height: 4px;
        background: #9ED153;
        z-index: 1;
        pointer-events: none;
      `

      // Случайная стартовая позиция вокруг бицепса
      const startX = 50 + (Math.random() * 60 - 30) // 35-65%
      const startY = 60 + (Math.random() * 30 - 15) // 50-75%
      const drift = (Math.random() * 40 - 20) + 'px'
      const duration = (1 + Math.random() * 0.8) + 's'

      particle.style.left = startX + '%'
      particle.style.top = startY + '%'
      particle.style.setProperty('--drift', drift)
      particle.style.animation = `particleFloat ${duration} ease-out forwards`

      scene.appendChild(particle)

      // Удаляем частицу из DOM после анимации (чтоб не копилось)
      setTimeout(() => particle.remove(), 2000)
    }

    const particleTimer = setInterval(spawnParticle, 250)

    // Стартовый "взрыв" из 4 частиц сразу
    for (let i = 0; i < 4; i++) {
      setTimeout(spawnParticle, i * 60)
    }

    // Очистка таймеров при закрытии лоадера
    return () => {
      clearTimeout(finishTimer)
      clearInterval(particleTimer)
    }
  }, [onFinish])

  return (
    <div style={styles.container}>
      <div ref={sceneRef} style={styles.scene}>
        <div style={styles.biceps} role="img" aria-label="biceps">💪</div>
        <div style={styles.plusOne}>+1</div>
      </div>

      <style>{`
        @keyframes flexBiceps {
          0%   { transform: rotate(0deg) scale(1); }
          45%  { transform: rotate(-6deg) translateY(-2px) scale(1.06); }
          55%  { transform: rotate(-6deg) translateY(-2px) scale(1.06); }
          100% { transform: rotate(0deg) scale(1); }
        }

        @keyframes particleFloat {
          0%   { opacity: 0; transform: translateY(0) translateX(0) scale(1); }
          10%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-80px) translateX(var(--drift, 0px)) scale(0.5); }
        }

        @keyframes plusOneFly {
          0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.6); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
          80%  { opacity: 1; transform: translateX(-50%) translateY(-70px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-90px) scale(1); }
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
    zIndex: 9999
  },
  scene: {
    position: 'relative',
    width: '200px',
    height: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  biceps: {
    fontSize: '77px',
    lineHeight: 1,
    display: 'block',
    animation: 'flexBiceps 1.8s ease-in-out infinite',
    transformOrigin: '60% 85%',
    filter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)',
    WebkitFilter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)',
    position: 'relative',
    zIndex: 2
  },
  plusOne: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '32px',
    color: 'var(--color-primary)',
    letterSpacing: '2px',
    zIndex: 3,
    opacity: 0,
    animation: 'plusOneFly 1.8s ease-out infinite'
  }
}
