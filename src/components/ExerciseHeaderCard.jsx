import ExerciseVideo from './ExerciseVideo'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'

/**
 * Карточка-шапка упражнения (видео-превью + название + теги + подходы).
 *
 * Презентационный компонент, переиспользуется в меню действий (ExerciseActionMenu)
 * и на странице техники (ExerciseInfo). Скругление 49px — как у карточек дня.
 *
 * @param right - опциональный правый блок (например, вес с редактированием).
 *                Раскладка: превью | контент | right.
 */
export default function ExerciseHeaderCard({
  videoUrl,
  previewUrl,
  name,
  muscleGroup,
  subGroup,
  meta,
  right = null,
  style
}) {
  const colors = getMuscleGroupColors(muscleGroup)
  const groupLabel = toTitleCase(MUSCLE_GROUP_LABELS[muscleGroup] || (muscleGroup || '').toUpperCase())
  const subGroupLabel = toTitleCase(SUB_GROUP_LABELS[subGroup] || (subGroup || '').toUpperCase())

  return (
    <div style={{ ...styles.card, ...style }}>
      <div style={styles.preview}>
        <ExerciseVideo videoUrl={videoUrl} previewUrl={previewUrl} size="full" />
      </div>

      <div style={styles.content}>
        <div style={styles.name}>{name}</div>

        <div style={styles.tagsRow}>
          {/* Один тег — подгруппа в цвете основной группы, opacity 0.7 (как на
              карточках упражнений в дне тренировки). */}
          {(subGroupLabel || groupLabel) && (
            <span style={{ ...styles.tag, background: colors.tag, color: 'var(--color-text)', opacity: 0.7 }}>
              {subGroupLabel || groupLabel}
            </span>
          )}
        </div>

        {meta && <div style={styles.meta}>{meta}</div>}
      </div>

      {right}
    </div>
  )
}

function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

const styles = {
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 'var(--space-4)',
    gap: 'var(--space-4)',
    width: '100%',
    minHeight: '150px',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  preview: {
    flexShrink: 0,
    width: '118px',
    height: '118px',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    background: 'var(--color-text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    flex: 1,
    minWidth: 0,
    height: '118px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 'var(--space-2)'
  },
  name: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-body-size)',
    fontWeight: 700,
    lineHeight: '19px',
    color: 'var(--color-text)'
  },
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 'var(--space-15)',
    flexWrap: 'wrap'
  },
  tag: {
    display: 'inline-block',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 700,
    letterSpacing: '0.3px',
    lineHeight: '15px',
    whiteSpace: 'nowrap'
  },
  tagSecondary: {
    background: 'var(--layer-2)',
    color: '#B5B5B5',
    fontWeight: 700
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 500,
    lineHeight: '14px',
    letterSpacing: '0.03em',
    color: 'var(--color-text-secondary)'
  }
}
