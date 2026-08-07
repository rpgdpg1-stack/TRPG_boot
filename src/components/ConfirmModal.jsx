import { useRef } from 'react'
import { createPortal } from 'react-dom'
import ModalButton from './ModalButton'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Модалка-подтверждение «да / нет» — ОДНА на проект.
 *
 * Была скопирована трижды (выход из конструктора, отмена силовой, отмена
 * заплыва) и в каждой копии выглядела по-своему: где пилюли, где прямоугольники
 * с обводкой, где белая подпись, где серая. Собрано в компонент:
 *  - заголовок белым, пояснение под ним — СЕРЫМ (главное в модалке одно);
 *  - действия — серые пилюли `ModalButton` без обводки, отклик = подсветка фона
 *    при удержании (без scale), как в нативном алерте iOS;
 *  - деструктивное действие красит только ТЕКСТ (`danger`), фон общий серый;
 *  - «остаться» = тап мимо модалки.
 *
 * <ConfirmModal
 *   title="Отменить тренировку?"
 *   text="Прогресс не сохранится и в историю не попадёт."
 *   actions={[{ label: 'Нет', onClick }, { label: 'Да, отменить', onClick, danger: true }]}
 *   onClose={...}
 * />
 */
export default function ConfirmModal({ title, text, actions = [], onClose }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)

  return createPortal(
    <div ref={overlayRef} style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>{title}</div>
        {text && <div style={styles.text}>{text}</div>}

        <div style={styles.buttonsRow}>
          {actions.map((a) => (
            <ModalButton
              key={a.label}
              onClick={a.onClick}
              style={{ flex: 1, ...(a.danger ? styles.danger : null) }}
            >
              {a.label}
            </ModalButton>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top) + 30px) var(--space-5) var(--space-5)'
  },
  modal: {
    width: '100%', maxWidth: '360px',
    background: 'var(--surface-raised)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    boxShadow: 'var(--shadow-modal)'
  },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-text)', textAlign: 'center'
  },
  // Пояснение всегда тише заголовка — иначе в модалке два «главных» текста.
  text: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-text)', color: 'var(--color-text-secondary)',
    textAlign: 'center', lineHeight: 1.4, marginBottom: 'var(--space-4)'
  },
  buttonsRow: { display: 'flex', gap: 'var(--space-2)', width: '100%' },
  // Деструктив — только цветом текста: заливка и отклик общие для всех кнопок.
  danger: { color: 'var(--color-error)' }
}
