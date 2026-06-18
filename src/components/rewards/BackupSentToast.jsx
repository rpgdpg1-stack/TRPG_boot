import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import MuscleIcon from '../MuscleIcon'

/**
 * Модалка-подтверждение после того как ТЫ подстраховал игрока(ов).
 * Акцент — на ТВОём бонусе (крупно/жирно), отправленное другу — помельче.
 * Анимированный бицепс + искорки (как в завершении тренировки).
 *
 * Одиночная подстраховка: targetName + reward=100 + bonus=20.
 * Пакетная («подстраховать всех»): count>1, reward=N×100, bonus=N×20.
 *
 * @param targetName   - имя того кого подстраховал (одиночная)
 * @param count        - сколько друзей подстраховал разом (по умолчанию 1)
 * @param reward       - сколько ушло друзьям суммарно (по умолчанию 100)
 * @param bonus        - сколько получил ты суммарно (по умолчанию 20)
 * @param onConfirm    - закрыть
 */
function pluralFriendsDone(n) {
  const last = n % 10, lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} друзей подстраховано`
  if (last === 1) return `${n} друг подстрахован`
  if (last >= 2 && last <= 4) return `${n} друга подстраховано`
  return `${n} друзей подстраховано`
}

export default function BackupSentToast({ targetName, count = 1, reward = 100, bonus = 20, onConfirm }) {
  const isBatch = count > 1
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

        {isBatch && <div style={styles.batchLine}>{pluralFriendsDone(count)}</div>}

        <div style={styles.subtitle}>
          {isBatch
            ? <>друзьям отправлено +{reward} <MuscleIcon size={13} earned={true} /></>
            : <>{targetName ? `${targetName} получает` : 'Игрок получает'} +{reward} <MuscleIcon size={13} earned={true} /></>}
        </div>

        <div style={styles.bonusBadge}>
          +{bonus} <MuscleIcon size={24} earned={true} /> тебе за поддержку
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
  batchLine: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text)',
    textAlign: 'center'
  },
  // Что ушло другу — помельче (второстепенно).
  subtitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  },
  // Твой бонус — главный акцент: крупнее и жирнее.
  bonusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    marginTop: '4px',
    padding: '10px 18px',
    background: 'rgba(158, 209, 83, 0.12)',
    border: '1px solid rgba(158, 209, 83, 0.35)',
    borderRadius: '14px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '17px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
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