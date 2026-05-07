/**
 * Пиксельный значок текущего дня программы (A / B / C).
 * Появляется в углу карточки программы если пользователь уже начал тренироваться.
 */
export default function DayBadge({ day, size = 32 }) {
  if (!day) return null

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(158, 209, 83, 0.15)',
        border: '1.5px solid var(--color-primary)',
        borderRadius: '8px',
        fontFamily: 'var(--font-tiny5)',
        fontSize: size * 0.55 + 'px',
        color: 'var(--color-primary)',
        letterSpacing: '0',
        lineHeight: 1
      }}
    >
      {day}
    </div>
  )
}
