import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import UiIcon from './UiIcon'

/**
 * Награда-вспышка при завершении тренировки: тот же жест, что на лоадере — мускул
 * качается, «+1» улетает вверх, гладкие искры. Проигрывается ОДИН цикл по центру
 * экрана, затем onDone (после чего показывается модалка завершения).
 *
 * Частицы — гладкие круги со свечением (как в лоадере), без пикселей.
 */
const DURATION_MS = 1300

export default function RewardBurst({ onDone }) {
  const sceneRef = useRef(null)

  useEffect(() => {
    const done = setTimeout(() => onDone?.(), DURATION_MS)

    const spawn = () => {
      const scene = sceneRef.current
      if (!scene) return
      const dim = 4 + Math.random() * 3
      const p = document.createElement('div')
      p.style.cssText = `
        position:absolute; width:${dim}px; height:${dim}px; border-radius:50%;
        background:#9ED153; box-shadow:0 0 6px rgba(158,209,83,0.7); filter:blur(0.4px);
        pointer-events:none; z-index:1;`
      p.style.left = `${50 + (Math.random() * 60 - 30)}%`
      p.style.top = `${60 + (Math.random() * 26 - 13)}%`
      p.style.setProperty('--drift', `${Math.random() * 40 - 20}px`)
      p.style.animation = `rbSpark ${1 + Math.random() * 0.6}s ease-out forwards`
      scene.appendChild(p)
      setTimeout(() => p.remove(), 1800)
    }
    const iv = setInterval(spawn, 150)
    for (let i = 0; i < 5; i++) setTimeout(spawn, i * 70)

    return () => { clearTimeout(done); clearInterval(iv) }
  }, [onDone])

  return createPortal(
    <div style={styles.overlay} aria-hidden="true">
      <div ref={sceneRef} style={styles.scene}>
        <div style={styles.biceps}><UiIcon name="muscles" size={88} color="#FADFBE" /></div>
        <div style={styles.plusOne}>+1</div>
      </div>
      <style>{`
        @keyframes rbFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rbFlex {
          0% { transform: rotate(0deg) scale(1); }
          40% { transform: rotate(-6deg) translateY(-2px) scale(1.08); }
          60% { transform: rotate(-6deg) translateY(-2px) scale(1.08); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes rbPlus {
          0% { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.6); }
          20% { opacity: 1; transform: translateX(-50%) translateY(-12px) scale(1); }
          80% { opacity: 1; transform: translateX(-50%) translateY(-74px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-96px) scale(1); }
        }
        @keyframes rbSpark {
          0% { opacity: 0; transform: translateY(0) translateX(0) scale(1); }
          10% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-80px) translateX(var(--drift,0px)) scale(0.5); }
        }
      `}</style>
    </div>,
    document.body
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: 'rgba(13, 12, 12, 0.90)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: 'rbFade 0.2s ease-out forwards'
  },
  scene: { position: 'relative', width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  biceps: { display: 'block', animation: 'rbFlex 1.2s ease-in-out', transformOrigin: '60% 85%', position: 'relative', zIndex: 2 },
  plusOne: {
    position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '32px',
    color: 'var(--color-primary)', letterSpacing: '2px', zIndex: 3, opacity: 0,
    animation: 'rbPlus 1.2s ease-out'
  }
}
