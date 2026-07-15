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
 *  - 'graphite': сплошная графитовая заливка (--cat-gym) + тёмный текст — цвет раздела
 *    Силовая. Кнопка «Начать» в дне тренировки.
 *  - 'gray': сплошная светло-серая заливка (--neutral-600) + БЕЛЫЙ текст — нейтральное
 *    действие без фирменного зелёного (Добавить друга, Закрепить, Сохранить, Сменить).
 *  - 'ghost': прозрачный фон + тонкая рамка + приглушённый текст — вторичное действие
 *    рядом с основным (Назад / Отмена в модалках).
 *
 * Размер (size):
 *  - 'md' (по умолчанию): высота --btn-height (55), пилюля. Прибитые док-кнопки.
 *  - 'sm': высота --btn-height-sm (46), радиус --radius-medium. Кнопки в модалках.
 *
 * disabled всегда перебивает variant и даёт вид 'dim'.
 */
export default function ActionButton({
  variant = 'neutral',
  size = 'md',
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
  const sizing = styles[size] || styles.md
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
      style={{ ...styles.base, ...sizing, ...(hug ? styles.hug : styles.full), ...look, ...(showFill ? styles.clip : null), ...style }}
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
    flexShrink: 0,
    fontFamily: 'var(--font-manrope)',
    textAlign: 'center',
    pointerEvents: 'auto',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease'
  },
  // Размеры (высота/скругление/типографика из токенов).
  md: {
    height: 'var(--btn-height)',
    padding: '0 24px',
    borderRadius: 'var(--radius-pill)',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '1.5px'
  },
  sm: {
    height: 'var(--btn-height-sm)',
    padding: '0 18px',
    borderRadius: 'var(--radius-medium)',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.3px'
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
  // Зелёная — сплошная акцентная заливка + чёрный текст (как кнопка в инфо-попапе
  // рейтинга), сплошная рамка чуть темнее заливки. Цвет переопределяется через `style`
  // (напр. «Завершить» заплыва — голубой). БЕЗ блюра — обычная залитая кнопка.
  accent: {
    background: 'var(--color-primary)',
    border: '1.5px solid var(--color-primary-dark)',
    color: '#0D0C0C'
  },
  // Графит — сплошная заливка цвета раздела Силовая (--cat-gym) + тёмный текст.
  // Кнопка «Начать» в дне тренировки. БЕЗ блюра (обычная залитая кнопка).
  graphite: {
    background: 'var(--cat-gym)',
    border: '1.5px solid rgba(0, 0, 0, 0.18)',
    color: '#0D0C0C'
  },
  // Светло-серая — сплошная нейтральная заливка (--neutral-600) + БЕЛЫЙ текст, тонкая
  // светлая рамка. Нейтральные действия без фирменного зелёного акцента.
  gray: {
    background: 'var(--neutral-600)',
    border: '1.5px solid rgba(255, 255, 255, 0.14)',
    color: 'var(--color-text)'
  },
  // Прозрачная — тонкая рамка + приглушённый текст. Вторичное действие (Назад/Отмена).
  ghost: {
    background: 'transparent',
    border: '1.5px solid rgba(255, 255, 255, 0.14)',
    color: 'var(--color-text-secondary)'
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
