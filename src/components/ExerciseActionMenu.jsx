import { useEffect, useRef } from 'react'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'

/**
 * Всплывающее меню при долгом нажатии на карточку упражнения.
 *
 * Сверху — визуальная мини-карточка упражнения в том же стиле что и большая
 * карточка на экране тренировки: картинка слева, справа название и под ним
 * два тега (цветной тег группы мышц + серый тег подгруппы). По картинке
 * + тегам юзер сразу видит что зажал именно то упражнение что хотел.
 *
 * Размеры уменьшены под маленькую карточку в модалке, но иерархия и цвета
 * те же что и в основной карточке — единый язык интерфейса.
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

  if (!slot) return null

  // Цвета и подписи как в большой карточке. Локальный toTitleCase чтобы
  // не плодить хелперы в общем модуле — пока используется только тут и в ExerciseCard.
  const colors = getMuscleGroupColors(slot.muscle_group)
  const groupLabelRaw = MUSCLE_GROUP_LABELS[slot.muscle_group] || (slot.muscle_group || '').toUpperCase()
  const subGroupLabelRaw = SUB_GROUP_LABELS[slot.sub_group] || (slot.sub_group || '').toUpperCase()
  const groupLabel = toTitleCase(groupLabelRaw)
  const subGroupLabel = toTitleCase(subGroupLabelRaw)

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        ref={menuRef}
        style={styles.menu}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Мини-карточка упражнения — тот же стиль что на экране тренировки,
            но уменьшенный: картинка 64x64, название мельче, теги компактнее. */}
        <div style={styles.exerciseCard}>
          <div style={styles.preview}>
            {slot.preview_url ? (
              <img src={slot.preview_url} alt="" style={styles.previewImg} draggable={false} />
            ) : (
              <div style={styles.previewPlaceholder}>💪</div>
            )}
          </div>

          <div style={styles.cardContent}>
            {/* 1. Название упражнения */}
            <div style={styles.exerciseName}>{slot.exercise_name}</div>

            {/* 2. Ряд тегов: цветной тег группы + серый тег подгруппы */}
            <div style={styles.tagsRow}>
              {groupLabel && (
                <span style={{ ...styles.tag, background: colors.tag, color: '#FFFFFF' }}>
                  {groupLabel}
                </span>
              )}
              {subGroupLabel && (
                <span style={{ ...styles.tag, ...styles.tagSecondary }}>
                  {subGroupLabel}
                </span>
              )}
            </div>

            {/* 3. Подходы — мелкой серой строкой под тегами */}
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

/**
 * "СПИНА" → "Спина", "БИЦЕПС БЕДРА" → "Бицепс бедра".
 */
function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
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

  // Мини-карточка упражнения. Картинка 64x64 слева, текст в три уровня справа.
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
    gap: '5px'
  },
  exerciseName: {
    fontFamily: 'var(--font-geist)',
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: '16px',
    color: 'var(--color-text)'
  },
  // Те же правила что в большой карточке, но размеры тегов меньше:
  // padding 2x8 (вместо 3x10), шрифт 10px (вместо 11), радиус "таблетки" сохраняем
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '5px',
    flexWrap: 'wrap'
  },
  tag: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.2px',
    lineHeight: '13px',
    whiteSpace: 'nowrap'
  },
  tagSecondary: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#A0A0A0',
    fontWeight: 600
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.03em',
    color: '#888888',
    lineHeight: '13px'
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