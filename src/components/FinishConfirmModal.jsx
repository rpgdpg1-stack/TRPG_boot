import { useRef } from 'react'
/**
 * Минималистичное подтверждение завершения тренировки.
 *
 * Защита от случайного раннего завершения: текст зависит от прогресса —
 * «Все упражнения выполнены» либо «Выполнено X из Y». Две кнопки: Назад /
 * Завершить. Тап по фону = Назад.
 *
 * @param done    - сколько упражнений отмечено
 * @param total   - всего упражнений
 * `closing` — панель уезжает, а затемнение ОСТАЁТСЯ: следом встаёт модалка
 * завершения, и переход между ними читается как одна сцена (без мигания фона).
 *
 * @param onConfirm - тап «Завершить»
 * @param onCancel  - тап «Назад» / по фону
 */
import ActionButton from './ActionButton'
import { useScrollLock } from '../lib/use-scroll-lock'

export const CONFIRM_EXIT_MS = 180

export default function FinishConfirmModal({ done, total, closing = false, onConfirm, onCancel }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const allDone = total > 0 && done >= total

  return (
    <div ref={overlayRef} style={styles.overlay} onClick={closing ? undefined : onCancel}>
      <div
        style={{ ...styles.modal, ...(closing ? styles.modalClosing : null) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.title}>
          {allDone ? 'Все упражнения выполнены' : `Выполнено ${done} из ${total}`}
        </div>
        <div style={styles.subtitle}>Завершить тренировку?</div>

        <div style={styles.row}>
          <ActionButton variant="ghost" size="sm" onClick={onCancel} style={{ flex: 1 }}>
            Назад
          </ActionButton>
          <ActionButton variant="accent" size="sm" onClick={onConfirm} style={{ flex: 1 }}>
            Завершить
          </ActionButton>
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
    padding: 'var(--space-6)',
    // Гасим прокрутку страницы под модалкой (как в AnchorMenu) — без position:fixed
    // на body, иначе прыгает закреплённая шапка дня.
    touchAction: 'none',
    overscrollBehavior: 'contain',
    animation: 'finishConfirmOverlayIn 0.2s ease-out forwards'
  },
  modal: {
    width: '100%',
    maxWidth: '300px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-15)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: 'finishConfirmIn 0.28s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    transition: `opacity ${CONFIRM_EXIT_MS}ms ease, transform ${CONFIRM_EXIT_MS}ms var(--ease-ios)`
  },
  // Уход панели перед появлением модалки завершения (фон при этом не мигает).
  modalClosing: { opacity: 0, transform: 'scale(0.96)', animation: 'none' },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-body-size)',
    letterSpacing: '0.5px',
    color: 'var(--color-text)',
    textAlign: 'center'
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center'
  },
  row: {
    display: 'flex',
    gap: 'var(--space-3)',
    width: '100%',
    marginTop: 'var(--space-4)'
  }
}
