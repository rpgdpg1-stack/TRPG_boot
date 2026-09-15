import ExerciseVideo from './ExerciseVideo'
import MarqueeTag from './MarqueeTag'
import { exerciseTagLabel } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'

/**
 * Карточка-шапка экрана техники (ExerciseInfo).
 *
 * Раскладка колонкой (вариант от 16.09.2026): ролик во ВСЮ ширину карточки
 * (поля 16 по кругу, скругление прежнее) — на технике смотрят движение, и
 * миниатюра 118px для этого мелкая. Под роликом — название тем же шрифтом,
 * тег и подходы.
 *
 * Подходы («3 × 10-12») показываем в двух местах: здесь и в меню долгого
 * нажатия (ExerciseActionMenu). Больше нигде.
 *
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
  style
}) {
  const colors = getMuscleGroupColors(muscleGroup, custom)
  // Тег такой же, как на карточках упражнений: «Ноги — Квадрицепс».
  const tagLabel = exerciseTagLabel(muscleGroup, subGroup)

  return (
    <div style={{ ...styles.card, ...style }}>
      <div style={styles.preview}>
        {/* Кадр крупный — и кнопка ▶ крупнее, чем в миниатюре модалки. */}
        <ExerciseVideo videoUrl={videoUrl} previewUrl={previewUrl} size="full" playSize={60} />
      </div>

      <div style={styles.content}>
        <div style={styles.name}>{name}</div>

        {tagLabel && (
          <div style={styles.tagsRow}>
            <MarqueeTag label={tagLabel} background={colors.tag} style={styles.tag} />
          </div>
        )}

        {meta && <div style={styles.meta}>{meta}</div>}
      </div>
    </div>
  )
}

const styles = {
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--space-4)',
    gap: 'var(--space-4)',
    width: '100%',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  // Квадрат во всю ширину: высоту даёт aspect-ratio самого ExerciseVideo.
  preview: {
    width: '100%',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    background: 'var(--color-text)'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: '0 var(--space-1) var(--space-1)'
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
  // Тот же вид подходов, что в меню долгого нажатия.
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 500,
    lineHeight: '14px',
    letterSpacing: '0.03em',
    color: 'var(--color-text-secondary)'
  }
}
