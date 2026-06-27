/**
 * Переиспользуемая кнопка-действие в стиле пикера: полупрозрачный фон + блюр.
 * Один компонент на все «прибитые» кнопки (Завершить, Сменить, Сохранить и т.п.),
 * высоту/типографику при необходимости можно переопределить через `style`.
 *
 * Виды (variant) и состояния:
 *  - disabled → 'dim': самый прозрачный фон + лёгкий блюр, тусклый текст
 *    (тусклее, чем серая кнопка «Добавить упражнения» в пикере).
 *  - 'neutral': серая полупрозрачная + блюр + пунктир — как «Добавить упражнения».
 *  - 'accent': тот же эффект (полупрозрачность + блюр), но в нашем зелёном акценте.
 *
 * disabled всегда перебивает variant и даёт вид 'dim'.
 */
export default function ActionButton({
  variant = 'neutral',
  disabled = false,
  hug = false,
  onClick,
  children,
  style,
  className = '',
  ...rest
}) {
  const look = disabled ? styles.dim : (styles[variant] || styles.neutral)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press-tile ${className}`.trim()}
      style={{ ...styles.base, ...(hug ? styles.hug : styles.full), ...look, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}

const styles = {
  base: {
    height: '63px',
    flexShrink: 0,
    padding: '0 24px',
    borderRadius: 'var(--radius-card)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '1.5px',
    textAlign: 'center',
    pointerEvents: 'auto',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease'
  },
  // Во всю ширину (кнопки дока: «Сохранить программу» и т.п.).
  full: { width: '100%' },
  // По размеру контента (скругление облегает текст). Контейнер центрирует.
  hug: { width: 'auto', padding: '0 40px' },
  // Выключена: прозрачный фон + лёгкий блюр, текст тусклый. Сплошная тонкая рамка.
  dim: {
    background: 'rgba(34, 34, 34, 0.30)',
    backdropFilter: 'blur(var(--blur-sm))',
    WebkitBackdropFilter: 'blur(var(--blur-sm))',
    border: '1.5px solid rgba(255, 255, 255, 0.12)',
    color: 'rgba(136, 136, 136, 0.55)',
    cursor: 'default'
  },
  // Серая — полупрозрачный фон + блюр, сплошная рамка (пунктир оставлен только
  // кнопке «Добавить упражнение» в конструкторе/пикере).
  neutral: {
    background: 'rgba(34, 34, 34, 0.55)',
    backdropFilter: 'blur(var(--blur-md))',
    WebkitBackdropFilter: 'blur(var(--blur-md))',
    border: '1.5px solid rgba(255, 255, 255, 0.20)',
    color: 'var(--color-text-secondary)'
  },
  // Зелёная — сплошная акцентная заливка + чёрный текст (как кнопка в
  // инфо-попапе рейтинга), сплошная рамка чуть темнее заливки для чёткого края.
  accent: {
    background: 'var(--color-primary)',
    border: '1.5px solid var(--color-primary-dark)',
    color: '#0D0C0C'
  }
}
