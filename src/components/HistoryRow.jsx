import { describeWorkout, formatWorkoutDateShort, getDayMuscleTags } from '../utils/history'
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
  const muscleTags = variant ? getDayMuscleTags(workout.program_id, variant) : []

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
        {muscleTags.map(t => (
          <span key={t.key} style={{ ...styles.muscleTag, background: `${t.color}33`, color: t.color }}>
            {t.label}
          </span>
        ))}
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
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: '4px'
  },
  title: { fontWeight: 700, whiteSpace: 'nowrap' },
  variant: { fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  sep: { color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  date: { color: 'var(--color-text-secondary)', fontWeight: 500 },
  check: { flexShrink: 0, fontSize: '13px', color: 'var(--color-text-secondary)', opacity: 0.5 },
  muscleTag: {
    marginLeft: '6px',
    padding: '2px 8px',
    borderRadius: '999px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.2px',
    lineHeight: '14px',
    whiteSpace: 'nowrap'
  }
}