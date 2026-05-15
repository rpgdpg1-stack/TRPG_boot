import { useEffect, useRef } from 'react'
import { SUB_GROUP_LABELS } from '../features/programs/labels'

/**
 * Всплывающее меню при долгом нажатии на карточку упражнения.
 *
 * Сверху — визуальная мини-карточка упражнения (картинка слева, название и
 * meta_info справа), чтобы юзер по картинке сразу понимал что это то самое
 * упражнение которое он зажал. Без вчитывания в текст.
 *
 * Две кнопки: ℹ️ Инфо и 🔄 Сменить. Закрытие по тапу на оверлей или Cancel.
 */
export default function ExerciseActionMenu({ slot, onInfo, onSwap, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Защита на случай если slot не передали (старый код где-то)
  if (!slot) return null

  const subGroupLabel = SUB_GROUP_LABELS[slot.sub_group] || (slot.sub_group || '').toUpperCase()

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        ref={menuRef}
        style={styles.menu}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Визуальная мини-карточка — как в свапе, чтобы по картинке было видно */}
        <div style={styles.exerciseCard}>
          <div style={styles.preview}>
            {slot.preview_url ? (
              <img src={slot.preview_url} alt="" style={styles.previewImg} draggable={false} />
            ) : (
              <div style={styles.previewPlaceholder}>💪</div>
            )}
          </div>

          <div style={styles.cardContent}>
            {subGroupLabel && (
              <div style={styles.subGroupLabel}>{subGroupLabel}</div>
            )}
            <div style={styles.exerciseName}>{slot.exercise_name}</div>
            {slot.meta_info && (
              <div style={styles.meta}>{slot.meta_info}</div>
            )}
          </div>
        </div>

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
    maxWidth: '340px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '16px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },

  // Мини-карточка упражнения: визуально похожа на карточку в свапе.
  // Картинка слева 64x64, текст справа в три строки (подгруппа / название / meta).
  exerciseCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '16px',
    marginBottom: '4px'
  },
  preview: {
    flexShrink: 0,
    width: '64px',
    height: '64px',
    borderRadius: '14px',
    overflow: 'hidden',
    background: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  previewPlaceholder: {
    fontSize: '28px',
    opacity: 0.4
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  subGroupLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    fontWeight: 800,
    lineHeight: '12px',
    letterSpacing: '0.2em',
    color: '#888888',
    textTransform: 'uppercase'
  },
  exerciseName: {
    fontFamily: 'var(--font-geist)',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: '18px',
    color: 'var(--color-text)'
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    color: '#888888'
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
    marginTop: '4px',
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