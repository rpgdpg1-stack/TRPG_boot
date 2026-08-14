import ExerciseVideo from './ExerciseVideo'
import MarqueeTag from './MarqueeTag'
import { exerciseTagLabel } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'

/**
 * Карточка-шапка упражнения (видео-превью + название + теги + подходы).
 *
 * Презентационный компонент, переиспользуется в меню действий (ExerciseActionMenu)
 * и на странице техники (ExerciseInfo). Скругление 49px — как у карточек дня.
 *
 * @param right - опциональный правый блок (например, вес с редактированием).
 *                Раскладка: превью | контент | right.
 * @param custom - своё упражнение пользователя: тег красится акцентным, если
 *                 группа придумана и цветов у неё нет.
 */
export default function ExerciseHeaderCard({
  videoUrl,
  previewUrl,
  name,
  muscleGroup,
  subGroup,
  meta,
  custom = false,
  right = null,
  style
}) {
  const colors = getMuscleGroupColors(muscleGroup, custom)
  // Тег такой же, как на карточках упражнений: «Ноги — Квадрицепс».
  const tagLabel = exerciseTagLabel(muscleGroup, subGroup)

  return (
    <div style={{ ...styles.card, ...style }}>
      <div style={styles.preview}>
        <ExerciseVideo videoUrl={videoUrl} previewUrl={previewUrl} size="full" />
      </div>

      <div style={styles.content}>
        <div style={styles.name}>{name}</div>

        <div style={styles.tagsRow}>
          {/* Один тег — подгруппа в цвете основной группы, opacity 0.7 (как на
              карточках упражнений в дне тренировки). Длинный обрезается
              многоточием и прокатывается по тапу, под правый блок не лезет. */}
          {tagLabel && (
            <MarqueeTag label={tagLabel} background={colors.tag} style={styles.tag} />
          )}
        </div>

        {meta && <div style={styles.meta}>{meta}</div>}
      </div>

      {right}
    </div>
  )
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
    minWidth: 0,
    maxWidth: '100%'
  },
  // Форма пилюли — в MarqueeTag; здесь только приглушение.
  tag: { opacity: 0.7 },
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
