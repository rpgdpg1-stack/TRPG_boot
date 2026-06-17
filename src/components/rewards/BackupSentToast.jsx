import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import MuscleIcon from '../MuscleIcon'

/**
 * Модалка-подтверждение после того как ТЫ подстраховал игрока.
 * Показывает что target получил +100, а ты +20 за поддержку.
 * Анимированный бицепс + искорки (как в завершении тренировки).
 *
 * @param targetName   - имя того кого подстраховал
 * @param bonus        - сколько получил ты (по умолчанию 20)
 * @param onConfirm    - закрыть
 */
export default function BackupSentToast({ targetName, bonus = 20, onConfirm }) {
  const sceneRef = useRef(null)

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    let isActive = true
    const colors = ['#9ED153', '#FADFBE', '#FFD700']

    const spawn = () => {
      if (!isActive || !scene) return
      const spark = document.createElement('div')
      const offsetX = (Math.random() * 30 - 15)
      const driftY = -(40 + Math.random() * 30)
      const driftX = (Math.random() * 16 - 8)
      const size = 2 + Math.floor(Math.random() * 2)
      const color = colors[Math.floor(Math.random() * colors.length)]
      spark.style.cssText = `
        position: absolute;
        left: calc(50% + ${offsetX}px);
        top: 50%;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        box-shadow: 0 0 6px ${color};
        --burst-x: ${driftX}px;
        --burst-y: ${driftY}px;
        animation: particleBurst 1.2s ease-out forwards;
        pointer-events: none;
      `
      scene.appendChild(spark)
      setTimeout(() => spark.remove(), 1300)
    }

    const interval = setInterval(spawn, 110)
    for (let i = 0; i < 5; i++) setTimeout(spawn, i * 50)
    return () => { isActive = false; clearInterval(interval) }
  }, [])

  return createPortal(
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div ref={sceneRef} style={styles.scene}>
          <span style={styles.biceps}>
            <MuscleIcon size={56} earned={true} flexTrigger={1} />
          </span>
        </div>

        <div style={styles.title}>ПОДДЕРЖКА ОТПРАВЛЕНА</div>
        <div style={styles.subtitle}>
          {targetName ? `${targetName} получает` : 'Игрок получает'} +100 <MuscleIcon size={14} earned={true} />
        </div>

        <div style={styles.bonusBadge}>
          +{bonus} <MuscleIcon size={20} earned={true} /> тебе за поддержку
        </div>

        <button onClick={onConfirm} style={styles.button}>ОК</button>
      </div>

      <style>{`
        @keyframes backupSentOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes backupSentPanel {
          0%   { opacity: 0; transform: scale(0.85) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.9)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
    padding: '20px',
    animation: 'backupSentOverlay 0.25s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(158, 209, 83, 0.25)',
    borderRadius: '28px',
    padding: '28px 24px 22px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    animation: 'backupSentPanel 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(158, 209, 83, 0.15)'
  },
  scene: {
    position: 'relative',
    width: '100px',
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible'
  },
  biceps: {
    display: 'inline-flex',
    filter: 'drop-shadow(0 0 14px rgba(250, 223, 190, 0.4))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '17px',
    color: 'var(--color-primary)',
    letterSpacing: '2px',
    textAlign: 'center'
  },
  subtitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  },
  bonusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    padding: '8px 16px',
    background: 'rgba(158, 209, 83, 0.1)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: '12px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    textShadow: '0 0 10px rgba(158, 209, 83, 0.4)'
  },
  button: {
    width: '100%',
    marginTop: '10px',
    padding: '14px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '2px',
    borderRadius: '14px',
    border: 'none',
    cursor: 'pointer'
  }
}