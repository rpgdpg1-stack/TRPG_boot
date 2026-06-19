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
      style={{ ...styles.base, ...look, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}

const styles = {
  base: {
    width: '100%',
    padding: '18px',
    borderRadius: 'var(--radius-card)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '1.5px',
    textAlign: 'center',
    pointerEvents: 'auto',
    cursor: 'pointer',
    transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease'
  },
  // Выключена: прозрачный фон + лёгкий блюр, текст тусклый. Без обводки.
  dim: {
    background: 'rgba(34, 34, 34, 0.30)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: 'none',
    color: 'rgba(136, 136, 136, 0.55)',
    cursor: 'default'
  },
  // Серая — полупрозрачный фон + блюр, без обводки (пунктир только у кнопки
  // «Добавить упражнение» в конструкторе/пикере, тут не нужен).
  neutral: {
    background: 'rgba(34, 34, 34, 0.55)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: 'none',
    color: 'var(--color-text-secondary)'
  },
  // Зелёная — сплошная акцентная заливка + чёрный текст (как кнопка в
  // инфо-попапе рейтинга). Без обводки.
  accent: {
    background: 'var(--color-primary)',
    border: 'none',
    color: '#0D0C0C'
  }
}
