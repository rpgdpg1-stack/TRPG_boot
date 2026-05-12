import { useEffect, useRef } from 'react'

/**
 * Модалка завершения тренировки.
 *
 * Правка #7: добавлена защита от потери прогресса при плохом интернете.
 * Три состояния:
 *  - idle    → стандартный вид с кнопкой ОК
 *  - saving  → "Сохранение..." с заблокированной кнопкой
 *  - error   → красная плашка + кнопка "Повторить" (можно тыкать пока не получится)
 *
 * Логика сохранения теперь в родителе (WorkoutDay), модалка только показывает UI.
 *
 * @param reward    - сколько мускулов начисляется
 * @param status    - 'idle' | 'saving' | 'error'
 * @param errorMsg  - текст ошибки если status === 'error'
 * @param onConfirm - вызывается при тапе на ОК/Повторить
 */
export default function WorkoutFinishedModal({ reward = 150, status = 'idle', errorMsg = '', onConfirm }) {
  const sceneRef = useRef(null)

  // Спавним пиксельные искорки из огонька (как у горящих огоньков стрика)
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    let isActive = true
    const colors = ['#FFD700', '#FF8C42', '#E84545']

    const spawnSpark = () => {
      if (!isActive || !scene) return

      const spark = document.createElement('div')
      const offsetX = (Math.random() * 30 - 15)
      const driftY = -(50 + Math.random() * 30)
      const driftX = (Math.random() * 16 - 8)
      const size = 2 + Math.floor(Math.random() * 2)
      const color = colors[Math.floor(Math.random() * colors.length)]
      const duration = (1 + Math.random() * 0.5) + 's'

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
        animation: particleBurst ${duration} ease-out forwards;
        pointer-events: none;
      `
      scene.appendChild(spark)
      setTimeout(() => spark.remove(), 1800)
    }

    const interval = setInterval(spawnSpark, 90)
    for (let i = 0; i < 6; i++) setTimeout(spawnSpark, i * 40)

    return () => {
      isActive = false
      clearInterval(interval)
    }
  }, [])

  // Тексты для кнопки и заголовка в зависимости от состояния
  const isSaving = status === 'saving'
  const isError = status === 'error'

  const titleText = isError ? 'НЕ УДАЛОСЬ СОХРАНИТЬ' : 'ТРЕНИРОВКА ЗАВЕРШЕНА'
  const buttonText = isSaving
    ? 'СОХРАНЕНИЕ...'
    : isError
      ? 'ПОВТОРИТЬ'
      : 'ОК'

  const handleClick = () => {
    if (isSaving) return // блокируем повторные клики во время сохранения
    onConfirm?.()
  }

  return (
    <div style={styles.overlay}>
      <div style={{
        ...styles.modal,
        ...(isError ? styles.modalError : {})
      }}>

        {/* Огонёк со спаунящимися искрами */}
        <div ref={sceneRef} style={styles.scene}>
          <div style={styles.flame}>{isError ? '⚠️' : '🔥'}</div>
        </div>

        {/* Заголовок */}
        <div style={{
          ...styles.title,
          color: isError ? '#FF8C42' : 'var(--color-text)'
        }}>
          {titleText}
        </div>

        {/* В норме — бейдж награды. При ошибке — сообщение */}
        {isError ? (
          <div style={styles.errorMessage}>
            {errorMsg || 'Проверь подключение к интернету и попробуй ещё раз.'}
          </div>
        ) : (
          <div style={styles.rewardBadge}>+{reward} 💪</div>
        )}

        {/* Кнопка действия */}
        <button
          onClick={handleClick}
          disabled={isSaving}
          style={{
            ...styles.confirmButton,
            ...(isError ? styles.confirmButtonError : {}),
            opacity: isSaving ? 0.6 : 1,
            cursor: isSaving ? 'default' : 'pointer'
          }}
        >
          {buttonText}
        </button>

      </div>

      <style>{`
        @keyframes flameModalFloat {
          0%, 100% { transform: scale(1) translateY(0); }
          50%      { transform: scale(1.05) translateY(-4px); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modalScaleIn {
          0%   { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    animation: 'modalFadeIn 0.3s ease-out forwards',
    padding: '20px'
  },
  modal: {
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(158, 209, 83, 0.2)',
    borderRadius: '24px',
    padding: '32px 24px 24px',
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    animation: 'modalScaleIn 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 140, 66, 0.15)'
  },
  modalError: {
    border: '1px solid rgba(255, 140, 66, 0.3)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 140, 66, 0.2)'
  },
  scene: {
    position: 'relative',
    width: '120px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible'
  },
  flame: {
    fontSize: '70px',
    lineHeight: 1,
    filter: 'drop-shadow(0 0 14px rgba(255, 140, 66, 0.7))',
    animation: 'flameModalFloat 1.6s ease-in-out infinite'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    letterSpacing: '2px',
    textAlign: 'center'
  },
  rewardBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '24px',
    color: 'var(--color-primary)',
    letterSpacing: '2px',
    padding: '8px 16px',
    background: 'rgba(158, 209, 83, 0.1)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: '12px',
    textShadow: '0 0 10px rgba(158, 209, 83, 0.5)'
  },
  errorMessage: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    padding: '8px 4px'
  },
  confirmButton: {
    marginTop: '8px',
    width: '100%',
    padding: '14px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    borderRadius: '14px',
    border: 'none',
    transition: 'opacity 0.2s ease, transform 0.12s ease'
  },
  confirmButtonError: {
    background: '#FF8C42',
    color: '#0D0C0C'
  }
}