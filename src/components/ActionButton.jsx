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
  progress = null,
  ...rest
}) {
  const look = disabled ? styles.dim : (styles[variant] || styles.neutral)
  // Прогресс-заливка за текстом (например, «Завершить»: фон светло-серым
  // растёт по мере отметки упражнений). Только для активной кнопки.
  const showFill = progress != null && !disabled
  const pct = Math.max(0, Math.min(100, progress || 0))
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press-tile ${className}`.trim()}
      style={{ ...styles.base, ...(hug ? styles.hug : styles.full), ...look, ...(showFill ? styles.clip : null), ...style }}
      {...rest}
    >
      {showFill ? (
        <>
          <span style={{ ...styles.fill, width: `${pct}%` }} aria-hidden="true" />
          <span style={styles.label}>{children}</span>
        </>
      ) : children}
    </button>
  )
}

const styles = {
  base: {
    height: '55px',
    flexShrink: 0,
    padding: '0 24px',
    borderRadius: 'var(--radius-pill)',
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
  // Стеклянный акцент: ПОЛУПРОЗРАЧНАЯ заливка акцентного цвета + backdrop-blur —
  // тот же приём, что стеклянная шапка заплыва (контент просвечивает размытым).
  // Цвет по умолчанию зелёный (--color-primary); переопределяется через `style`
  // (напр. голубой у «Завершить» заплыва). Текст белый — на затемнённом стекле читается.
  accent: {
    background: 'color-mix(in srgb, var(--color-primary) 55%, transparent)',
    backdropFilter: 'blur(14px) saturate(180%)',
    WebkitBackdropFilter: 'blur(14px) saturate(180%)',
    border: '1.5px solid var(--color-primary-dark)',
    color: '#FFFFFF',
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.3)'
  },
  // Для прогресс-заливки: обрезаем растущий фон по скруглению кнопки.
  clip: { position: 'relative', overflow: 'hidden' },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    background: 'rgba(255, 255, 255, 0.12)',
    transition: 'width 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
    pointerEvents: 'none'
  },
  label: { position: 'relative', zIndex: 1 }
}
