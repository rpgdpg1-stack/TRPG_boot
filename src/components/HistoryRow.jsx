import { describeWorkout, formatWorkoutDateShort } from '../utils/history'

/**
 * Одна строка истории тренировок. Переиспользуется на главной, в профиле
 * и на странице /history.
 *
 * Формат: 🏋️ Сплит · День A · 02.05.26 ✔
 * Галочка серая, ненавязчивая.
 */
export default function HistoryRow({ workout }) {
  const { emoji, title, variant } = describeWorkout(workout)

  return (
    <div style={styles.row} className="tg-row">
      <span style={styles.emoji}>{emoji}</span>
      <div style={styles.text}>
        <span style={styles.title}>{title}</span>
        <span style={styles.sep}> · </span>
        <span style={styles.variant}>{variant}</span>
        <span style={styles.sep}> · </span>
        <span style={styles.date}>{formatWorkoutDateShort(workout.finished_at)}</span>
      </div>
      <span style={styles.check}>✔</span>
    </div>
  )
}

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    minHeight: '48px'
  },
  emoji: { fontSize: '18px', lineHeight: 1, flexShrink: 0, width: '24px', textAlign: 'center' },
  text: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  title: { fontWeight: 700 },
  variant: { fontWeight: 500, color: 'var(--color-text-secondary)' },
  sep: { color: 'var(--color-text-secondary)' },
  date: { color: 'var(--color-text-secondary)', fontWeight: 500 },
  check: { flexShrink: 0, fontSize: '13px', color: 'var(--color-text-secondary)', opacity: 0.5 }
}