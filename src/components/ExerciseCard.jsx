/**
 * Карточка упражнения на экране дня тренировки.
 *
 * Д1: только отображение — превью, название, схема, заданный вес юзера.
 * Д2: добавим тап для активации (✅ Готово, молодец) + затемнение
 * Д3: добавим тап-зону на цифру веса → клавиатура + долгое нажатие → меню Инфо/Сменить
 */
export default function ExerciseCard({ slot }) {
  const {
    exercise_name,
    meta_info,
    preview_url,
    is_swapped,
    user_weight_kg
  } = slot

  return (
    <div style={styles.card}>

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

    </div>
  )
}

const styles = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '90px',
    transition: 'opacity 0.25s ease, filter 0.25s ease'
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
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  previewPlaceholder: {
    fontSize: '28px'
  },
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
  }
}
