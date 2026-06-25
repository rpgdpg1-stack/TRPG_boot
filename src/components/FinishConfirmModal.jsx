/**
 * Минималистичное подтверждение завершения тренировки.
 *
 * Защита от случайного раннего завершения: текст зависит от прогресса —
 * «Все упражнения выполнены» либо «Выполнено X из Y». Две кнопки: Назад /
 * Завершить. Тап по фону = Назад.
 *
 * @param done    - сколько упражнений отмечено
 * @param total   - всего упражнений
 * @param onConfirm - тап «Завершить»
 * @param onCancel  - тап «Назад» / по фону
 */
export default function FinishConfirmModal({ done, total, onConfirm, onCancel }) {
  const allDone = total > 0 && done >= total

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>
          {allDone ? 'Все упражнения выполнены' : `Выполнено ${done} из ${total}`}
        </div>
        <div style={styles.subtitle}>Завершить тренировку?</div>

        <div style={styles.row}>
          <button type="button" style={styles.cancel} onClick={onCancel}>
            Назад
          </button>
          <button type="button" style={styles.confirm} onClick={onConfirm}>
            Завершить
          </button>
        </div>
      </div>

      <style>{`
        @keyframes finishConfirmOverlayIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes finishConfirmIn {
          0%   { opacity: 0; transform: scale(0.92); }
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
    background: 'rgba(13, 12, 12, 0.8)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '24px',
    animation: 'finishConfirmOverlayIn 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '300px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: '22px 20px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: 'finishConfirmIn 0.28s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '16px',
    letterSpacing: '0.5px',
    color: 'var(--color-text)',
    textAlign: 'center'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center'
  },
  row: {
    display: 'flex',
    gap: '10px',
    width: '100%',
    marginTop: '14px'
  },
  cancel: {
    flex: 1,
    padding: '12px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '12px',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  confirm: {
    flex: 1,
    padding: '12px',
    background: 'var(--color-primary)',
    border: 'none',
    borderRadius: '12px',
    color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  }
}
