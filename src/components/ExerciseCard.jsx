import { useState, useEffect } from 'react'

/**
 * Карточка упражнения на экране дня тренировки.
 *
 * Д2:
 * - Тап → onTap (родитель управляет активацией)
 * - isActive → визуальное состояние "выполнено"
 *   (затемнение + блюр + монохром)
 * - "✅ Готово, молодец!" всплывает по центру при первой активации (1.5 сек)
 *
 * Д3 (потом): тап на цифру веса → клавиатура, долгое нажатие → меню Инфо/Сменить.
 */
export default function ExerciseCard({ slot, isActive = false, onTap }) {
  const {
    exercise_name,
    meta_info,
    preview_url,
    is_swapped,
    user_weight_kg
  } = slot

  // Локальное состояние - показывать ли всплывающую надпись "Готово, молодец!"
  // Триггерится каждый раз при переходе isActive false → true.
  const [showDoneToast, setShowDoneToast] = useState(false)

  useEffect(() => {
    if (isActive) {
      setShowDoneToast(true)
      const timer = setTimeout(() => setShowDoneToast(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  const handleClick = () => {
    if (onTap) onTap(slot)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        ...styles.card,
        cursor: 'pointer',
        // Активная карточка: затемнение + блюр + монохром
        opacity: isActive ? 0.45 : 1,
        filter: isActive ? 'grayscale(0.85) blur(0.4px)' : 'none',
        transition: 'opacity 0.3s ease, filter 0.3s ease'
      }}
    >
      {/* Превью / плейсхолдер */}
      <div style={styles.preview}>
        {preview_url ? (
          <img src={preview_url} alt="" style={styles.previewImg} />
        ) : (
          <div style={styles.previewPlaceholder}>💪</div>
        )}
      </div>

      {/* Контент */}
      <div style={styles.content}>
        <div style={styles.title}>
          {exercise_name}
          {is_swapped && <span style={styles.swappedBadge}>заменено</span>}
        </div>
        <div style={styles.meta}>{meta_info || ''}</div>
      </div>

      {/* Вес */}
      <div style={styles.weightBlock}>
        <div style={styles.weightLabel}>ВЕС</div>
        <div style={styles.weightValue}>
          {user_weight_kg !== null && user_weight_kg !== undefined
            ? `${user_weight_kg}`
            : '—'}
          <span style={styles.weightUnit}>кг</span>
        </div>
      </div>

      {/* Всплывающая надпись "Готово, молодец!" */}
      {showDoneToast && (
        <div style={styles.doneToast}>
          ✅ Готово, молодец!
        </div>
      )}

      <style>{`
        @keyframes doneToastFade {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          75%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '90px'
  },
  preview: {
    flexShrink: 0,
    width: '64px',
    height: '64px',
    borderRadius: '14px',
    overflow: 'hidden',
    background: 'rgba(255, 255, 255, 0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewPlaceholder: { fontSize: '28px' },
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingRight: '4px'
  },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    lineHeight: 1.25,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    flexWrap: 'wrap'
  },
  swappedBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-primary)',
    background: 'rgba(158, 209, 83, 0.12)',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px'
  },
  meta: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px'
  },
  weightBlock: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    minWidth: '64px'
  },
  weightLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  weightValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '20px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '3px'
  },
  weightUnit: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  },
  doneToast: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: '14px',
    padding: '8px 14px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    animation: 'doneToastFade 1.5s ease-out forwards',
    zIndex: 10,
    filter: 'none', // важно: всплывашка не должна блюриться вместе с карточкой
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(158, 209, 83, 0.15)'
  }
}
