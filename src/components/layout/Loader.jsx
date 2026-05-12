import { useEffect, useRef } from 'react'

/**
 * Стартовый экран загрузки.
 *
 * Закрывается когда выполнены ОБА условия:
 *  1) Прошло минимум MIN_DURATION_MS (1500мс) — анимация не успевает мигнуть
 *  2) Promise readyPromise (ensureAuth) зарезолвился — юзер точно готов
 *
 * Если интернет тормозит и auth идёт 4 секунды — Loader честно ждёт 4 секунды.
 * Если auth моментальный — всё равно показываем минимум 1.5с (анимация).
 *
 * Раньше Loader закрывался по таймеру 1.8с независимо от auth, из-за чего
 * WorkoutDay был вынужден поллить getCurrentUser() каждые 100мс. Теперь — нет.
 */
export default function Loader({ onFinish, readyPromise }) {
  const sceneRef = useRef(null)
  const MIN_DURATION_MS = 1500

  useEffect(() => {
    let cancelled = false

    // Promise который зарезолвится через MIN_DURATION_MS
    const minDelay = new Promise(resolve => setTimeout(resolve, MIN_DURATION_MS))

    // Promise готовности юзера. Если readyPromise не передан или упал —
    // не блокируем закрытие; покажем экран, ошибки обработаем выше.
    const ready = readyPromise
      ? Promise.resolve(readyPromise).catch(err => {
          console.warn('[Loader] readyPromise rejected, closing anyway:', err)
        })
      : Promise.resolve()

    // Ждём оба и закрываемся
    Promise.all([minDelay, ready]).then(() => {
      if (!cancelled) onFinish?.()
    })

    // Спавнинг частиц — как было
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
      const startX = 50 + (Math.random() * 60 - 30)
      const startY = 60 + (Math.random() * 30 - 15)
      const drift = (Math.random() * 40 - 20) + 'px'
      const duration = (1 + Math.random() * 0.8) + 's'

      particle.style.left = startX + '%'
      particle.style.top = startY + '%'
      particle.style.setProperty('--drift', drift)
      particle.style.animation = `particleFloat ${duration} ease-out forwards`

      scene.appendChild(particle)
      setTimeout(() => particle.remove(), 2000)
    }

    const particleTimer = setInterval(spawnParticle, 250)
    for (let i = 0; i < 4; i++) setTimeout(spawnParticle, i * 60)

    return () => {
      cancelled = true
      clearInterval(particleTimer)
    }
  }, [onFinish, readyPromise])

  return (
    <div style={styles.container}>
      <div ref={sceneRef} style={styles.scene}>
        <div style={styles.biceps} role="img" aria-label="biceps">💪</div>
        <div style={styles.plusOne}>+1</div>
      </div>

      <div style={styles.logoBlock}>
        <span style={styles.logo}>RPG</span>
        <span style={styles.logoSubtitle}>TRAINING APP</span>
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
        @keyframes logoFadeIn {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
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
    gap: '24px'
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
  },
  logoBlock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    animation: 'logoFadeIn 0.6s ease-out 0.3s both'
  },
  logo: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '20px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    lineHeight: 1
  },
  logoSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  }
}
