/**
 * Скелетон карточки упражнения на время загрузки дня.
 */
export default function SkeletonCard() {
  return (
    <div style={skeletonStyles.card}>
      <div className="skel" style={skeletonStyles.thumb} />
      {/* Две строки, а не три: подходы с карточки убраны, и лишняя полоска
          обещала бы контент, которого после загрузки не появится. */}
      <div style={skeletonStyles.lines}>
        <div className="skel" style={{ ...skeletonStyles.line, width: '72%' }} />
        <div className="skel" style={{ ...skeletonStyles.line, width: '44%', height: '12px' }} />
      </div>
      <div className="skel" style={skeletonStyles.weight} />
    </div>
  )
}

const skeletonStyles = {
  card: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    // Размеры — ровно как у настоящей карточки (ExerciseCard), иначе при
    // подгрузке список дёргается.
    minHeight: '117px',
    borderRadius: 'var(--radius-day-card)',
    background: 'var(--surface)'
  },
  thumb: {
    flexShrink: 0,
    width: '85px',
    height: '85px',
    borderRadius: 'var(--radius-day-thumb)'
  },
  lines: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)'
  },
  line: {
    height: '16px',
    borderRadius: 'var(--radius-xs)'
  },
  weight: {
    flexShrink: 0,
    width: '30px',
    height: '24px',
    borderRadius: 'var(--radius-xs)'
  }
}

// Реальная позиция скролла. ExerciseActionMenu на время открытого меню фиксирует
// body (position:fixed; top:-scrollY) — тогда window.scrollY === 0, а настоящая
// позиция спрятана в body.style.top. Иначе берём обычный window.scrollY.
