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
    padding: '16px',
    gap: '16px',
    width: '100%',
    minHeight: '150px',
    background: '#1C1C1C',
    borderRadius: '33px',
    overflow: 'hidden'
  },
  preview: {
    flexShrink: 0,
    width: '118px',
    height: '118px',
    borderRadius: '33px',
    overflow: 'hidden',
    background: '#FFFFFF',
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
    gap: '8px'
  },
  name: {
    fontFamily: 'var(--font-geist)',
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: '19px',
    color: '#F0F0F0'
  },
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#B5B5B5',
    fontWeight: 600
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '14px',
    letterSpacing: '0.03em',
    color: '#A8A8A8'
  }
}
