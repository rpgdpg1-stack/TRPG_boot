import { describeWorkout, formatWorkoutDateShort } from '../utils/history'
import UiIcon from './UiIcon'

/**
 * Одна строка истории тренировок. Переиспользуется на главной, в профиле
 * и на странице /history.
 *
 * Формат силовой: [иконка] Сплит · A · 02.05.26 ✔
 * Формат заплыва: [иконка] Заплыв 45 · 02.05.26 ✔
 * Иконка — SVG раздела (power/swimming), цвет в тон раздела.
 */
export default function HistoryRow({ workout }) {
  const { iconName, title, variant } = describeWorkout(workout)
  const iconColor = iconName === 'swimming' ? 'var(--cat-pool)' : 'var(--color-primary)'

  return (
    <div style={styles.row} className="tg-row">
      <span style={styles.icon}>
        <UiIcon name={iconName} size={18} color={iconColor} />
      </span>
      <div style={styles.text}>
        <span style={styles.title}>{title}</span>
        {variant && (
          <>
            <span style={styles.sep}> · </span>
            <span style={styles.variant}>{variant}</span>
          </>
        )}
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
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    flexShrink: 0,
    width: '24px'
  },
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