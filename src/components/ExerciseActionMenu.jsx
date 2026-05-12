import { useEffect, useRef } from 'react'

/**
 * Всплывающее меню при долгом нажатии на карточку упражнения.
 *
 * Появляется по центру экрана с тёмным оверлеем.
 * Две кнопки: ℹ️ Инфо и 🔄 Сменить.
 * Закрытие по тапу на оверлей или Cancel.
 */
export default function ExerciseActionMenu({ exerciseName, onInfo, onSwap, onClose }) {
  const menuRef = useRef(null)

  // ESC и тап вне (хотя оверлей это сам и обрабатывает)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        ref={menuRef}
        style={styles.menu}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.exerciseName}>{exerciseName}</div>

        <button onClick={onInfo} style={styles.actionButton}>
          <span style={styles.actionIcon}>ℹ️</span>
          <span style={styles.actionLabel}>Инфо</span>
        </button>

        <button onClick={onSwap} style={styles.actionButton}>
          <span style={styles.actionIcon}>🔄</span>
          <span style={styles.actionLabel}>Сменить</span>
        </button>

        <button onClick={onClose} style={styles.cancelButton}>
          Отмена
        </button>
      </div>

      <style>{`
        @keyframes menuOverlayFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes menuPanelScaleIn {
          0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.75)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  menu: {
    width: '100%',
    maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '20px 16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  exerciseName: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    padding: '4px 8px 8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    marginBottom: '4px',
    lineHeight: 1.3
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '14px',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s ease, transform 0.1s ease',
    cursor: 'pointer'
  },
  actionIcon: { fontSize: '20px', lineHeight: 1, flexShrink: 0 },
  actionLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)'
  },
  cancelButton: {
    marginTop: '6px',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer'
  }
}
