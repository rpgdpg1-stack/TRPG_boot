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
  // Выключена: прозрачнее серой кнопки пикера + лёгкий блюр, текст тусклый.
  dim: {
    background: 'rgba(34, 34, 34, 0.30)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1.5px dashed rgba(255, 255, 255, 0.10)',
    color: 'rgba(136, 136, 136, 0.55)',
    cursor: 'default'
  },
  // Серая — как «Добавить упражнения» в пикере.
  neutral: {
    background: 'rgba(34, 34, 34, 0.55)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1.5px dashed rgba(255, 255, 255, 0.18)',
    color: 'var(--color-text-secondary)'
  },
  // Зелёная — тот же полупрозрачный эффект + блюр, акцент наш зелёный.
  accent: {
    background: 'rgba(158, 209, 83, 0.16)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1.5px solid rgba(158, 209, 83, 0.55)',
    color: 'var(--color-primary)'
  }
}
