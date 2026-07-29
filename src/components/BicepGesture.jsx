import { useEffect, useRef } from 'react'
import UiIcon from './UiIcon'

/**
 * Фирменный жест «+1 мускул» для модалок завершения (силовая, заплыв, любой раздел).
 * Наш бицепс (как на лоадере) качается ОДИН раз и застывает; вокруг непрерывно летят
 * гладкие зелёные искры (круги со свечением, не пиксели); рядом статичный «+1».
 * Никаких очков/мускулов не копится — «+1» = «+1 тренировка» (стрик/счётчики).
 */
export default function BicepGesture({ size = 84 }) {
  const ref = useRef(null)

  useEffect(() => {
    const scene = ref.current
    if (!scene) return
    let alive = true
    const spawn = () => {
      if (!alive || !scene) return
      const dim = 4 + Math.random() * 3
      const p = document.createElement('div')
      p.style.cssText = `
        position:absolute; left:calc(50% + ${Math.random() * 40 - 20}px); top:56%;
        width:${dim}px; height:${dim}px; border-radius:50%;
        background:#9ED153; box-shadow:0 0 6px rgba(158,209,83,0.7); filter:blur(0.4px);
        --drift:${Math.random() * 30 - 15}px; pointer-events:none;
        animation: bgRise ${1 + Math.random() * 0.6}s ease-out forwards;`
      scene.appendChild(p)
      setTimeout(() => p.remove(), 1800)
    }
    const iv = setInterval(spawn, 140)
    for (let i = 0; i < 5; i++) setTimeout(spawn, i * 70)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  return (
    <div ref={ref} style={styles.scene}>
      <div style={styles.biceps}><UiIcon name="muscles" size={size} color="#FADFBE" /></div>
      <div style={styles.plusOne}>+1</div>
      <style>{`
        @keyframes bgFlex {
          0% { transform: rotate(0deg) scale(1); }
          40% { transform: rotate(-6deg) translateY(-2px) scale(1.08); }
          60% { transform: rotate(-6deg) translateY(-2px) scale(1.08); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes bgRise {
          0% { opacity: 0; transform: translateY(0) translateX(0) scale(1); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-72px) translateX(var(--drift,0px)) scale(0.5); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  scene: { position: 'relative', width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  biceps: { display: 'block', animation: 'bgFlex 1.2s ease-in-out', transformOrigin: '60% 85%', position: 'relative', zIndex: 2 },
  plusOne: {
    position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '26px',
    color: 'var(--color-primary)', letterSpacing: '1px', zIndex: 3,
    textShadow: '0 0 10px rgba(158, 209, 83, 0.5)'
  }
}
