import { useEffect, useRef } from 'react'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import ExerciseVideo from './ExerciseVideo'
import UiIcon from './UiIcon'

/**
 * Всплывающее меню при долгом нажатии на карточку упражнения.
 *
 * НОВЫЙ ВИЗУАЛ:
 *  - Сверху на всю ширину модалки — квадратное зацикленное видео со
 *    скруглением 33px (как карточки упражнений)
 *  - Если video_url нет — fallback на preview_url, потом на 💪
 *  - Под видео — название упражнения (крупно, по центру)
 *  - Под названием — два тега: цветной тег группы + серый тег подгруппы
 *  - Под тегами — подходы серым (если есть)
 *  - Две кнопки: ℹ️ Инфо и 🔄 Сменить (без изменений)
 *
 * Размеры текста увеличены т.к. видео сверху "съело" компактный мини-формат,
 * текст теперь центральный элемент и должен читаться комфортно.
 *
 * Закрытие: тап по оверлею или Cancel.
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

        {/* Видео сверху на всю ширину модалки, квадратное, скругление 33 */}
        <div style={styles.videoBlock}>
          <ExerciseVideo
            videoUrl={slot.video_url}
            previewUrl={slot.preview_url}
            size="full"
          />
        </div>

        {/* Название упражнения — крупно, по центру */}
        <div style={styles.exerciseName}>{slot.exercise_name}</div>

        {/* Теги: группа (цветная) + подгруппа (серая) */}
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

        {/* Подходы — серой строкой под тегами */}
        {slot.meta_info && (
          <div style={styles.meta}>{slot.meta_info}</div>
        )}

        {/* Кнопки действий */}
        <div style={styles.actionsBlock}>
          <button onClick={onInfo} style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <UiIcon name="info" size={20} color="#3FA2F7" />
            </span>
            <span style={styles.actionLabel}>Инфо</span>
          </button>

          <button onClick={onSwap} style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <UiIcon name="change" size={20} color="#FF8C42" />
            </span>
            <span style={styles.actionLabel}>Сменить</span>
          </button>
        </div>

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
  // Модалка чуть шире т.к. сверху квадратное видео — на узкой смотрится мелко.
  menu: {
    width: '100%',
    maxWidth: '360px',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '33px',
    padding: '14px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  videoBlock: {
    width: '100%',
    marginBottom: '4px'
  },
  exerciseName: {
    fontFamily: 'var(--font-geist)',
    fontSize: '17px',
    fontWeight: 700,
    lineHeight: '21px',
    color: 'var(--color-text)',
    textAlign: 'center',
    marginTop: '6px',
    padding: '0 4px'
  },
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flexWrap: 'wrap'
  },
  tag: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '999px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    lineHeight: '15px',
    whiteSpace: 'nowrap'
  },
  tagSecondary: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#A0A0A0',
    fontWeight: 600
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 500,
    letterSpacing: '0.03em',
    color: '#888888',
    lineHeight: '15px'
  },

  // Блок с кнопками действий — сверху отступ, чтобы отделить от инфо
  actionsBlock: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '8px'
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
    marginTop: '2px',
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