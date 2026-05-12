/**
 * Заглушка экрана с подробной инфо об упражнении.
 * Потом сюда добавим: видео техники, целевые мышцы, типичные ошибки, советы.
 */
export default function ExerciseInfoModal({ exerciseName, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.icon}>📖</div>
        <div style={styles.title}>{exerciseName}</div>
        <div style={styles.subtitle}>
          Скоро тут будет:<br />
          видео техники, целевые мышцы,<br />
          типичные ошибки и советы
        </div>
        <button onClick={onClose} style={styles.closeButton}>
          ОК
        </button>
      </div>

      <style>{`
        @keyframes infoOverlayFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes infoPanelScaleIn {
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
    background: 'rgba(13, 12, 12, 0.85)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    animation: 'infoOverlayFadeIn 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '28px 22px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    animation: 'infoPanelScaleIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  icon: { fontSize: '36px', lineHeight: 1 },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--color-text)',
    textAlign: 'center'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    marginBottom: '8px'
  },
  closeButton: {
    width: '100%',
    padding: '12px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '1px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer'
  }
}
