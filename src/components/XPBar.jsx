/**
 * Пиксельный XP-бар со свечением.
 * Состоит из дискретных квадратов (визуально пиксельный).
 * Заполнение со светящимся glow эффектом.
 */
export default function XPBar({ progress = 0, color = '#9ED153', segments = 20 }) {
  // Сколько сегментов заполнено
  const filledCount = Math.round((progress / 100) * segments)

  return (
    <div style={styles.container}>
      {Array.from({ length: segments }).map((_, i) => {
        const isFilled = i < filledCount
        const isLastFilled = i === filledCount - 1

        return (
          <div
            key={i}
            style={{
              ...styles.segment,
              background: isFilled ? color : 'rgba(255, 255, 255, 0.06)',
              boxShadow: isLastFilled
                ? `0 0 8px ${color}, 0 0 4px ${color}`
                : 'none',
              opacity: isFilled ? 1 : 0.6
            }}
          />
        )
      })}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    gap: '2px',
    width: '100%',
    height: '14px',
    padding: '2px',
    background: 'rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '4px'
  },
  segment: {
    flex: 1,
    height: '100%',
    transition: 'background 0.4s ease, opacity 0.4s ease, box-shadow 0.4s ease'
  }
}
