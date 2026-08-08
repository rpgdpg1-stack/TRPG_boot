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
 *  - 'gray': сплошная светло-серая заливка (--neutral-600) + БЕЛЫЙ текст — нейтральное
 *    действие без фирменного зелёного (Добавить друга, Закрепить, Сохранить, Сменить).
 *  - 'ghost': прозрачный фон + тонкая рамка + приглушённый текст — вторичное действие
 *    рядом с основным (Назад / Отмена в модалках).
 *
 * Размер (size):
 *  - 'md' (по умолчанию): высота --btn-height (56). Прибитые док-кнопки экрана.
 *  - 'sm': высота --btn-height-sm (48). Кнопки в модалках и внутри карточек.
 * Скругление у обоих — пилюля (--radius-pill). Текст — единый токен Button (14/800).
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
    // Иконка ↔ текст — единый зазор во всех кнопках (4px).
    gap: 'var(--space-1)',
    transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease'
  },
  // Размеры (высота/скругление/типографика из токенов).
  // Large — основной CTA. Высота 52, текст 16, паддинг 18.
  md: {
    height: 'var(--btn-height)',
    padding: '0 18px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-button-lg-size)',
    fontWeight: 'var(--text-button-weight)',
    letterSpacing: '0.3px'
  },
  // Medium — обычные действия. Высота 36, текст 14, паддинг 12.
  sm: {
    height: 'var(--btn-height-sm)',
    padding: '0 var(--space-3)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 'var(--text-button-weight)',
    letterSpacing: '0.3px'
  },
  // Small — компактные (заметка/инлайн). Высота 30, текст 14, паддинг 10, gap 3.
  xs: {
    height: 'var(--btn-height-xs)',
    padding: '0 10px',
    gap: '3px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 'var(--text-button-weight)',
    letterSpacing: '0.3px'
  },
  // Во всю ширину (кнопки дока: «Сохранить программу» и т.п.).
  full: { width: '100%' },
  // По размеру контента (скругление облегает текст). Паддинг задаёт размер (md/sm/xs).
  hug: { width: 'auto' },
  // Выключена: прозрачный фон + лёгкий блюр, текст тусклый. БЕЗ обводки.
  dim: {
    background: 'rgba(34, 34, 34, 0.30)',
    backdropFilter: 'blur(var(--blur-sm))',
    WebkitBackdropFilter: 'blur(var(--blur-sm))',
    color: 'rgba(136, 136, 136, 0.55)',
    cursor: 'default'
  },
  // Серая — полупрозрачный фон + блюр, сплошная рамка (пунктир оставлен только
  // кнопке «Добавить упражнение» в конструкторе/пикере).
  // Серая — полупрозрачный фон + блюр, сплошная рамка. Текст АКЦЕНТНЫЙ зелёный:
  // это активное действие («Завершить», «Добавить упражнения», «Сменить»), просто
  // без залитого фона. Цвет текста при необходимости перебивается через `style`
  // (напр. красный на достигнутом лимите).
  neutral: {
    background: 'rgba(34, 34, 34, 0.55)',
    backdropFilter: 'blur(var(--blur-md))',
    WebkitBackdropFilter: 'blur(var(--blur-md))',
    color: 'var(--color-primary)'
  },
  // Primary-tonal — тёмная поверхность + ЗЕЛЁНЫЙ текст, БЕЗ обводки и БЕЗ блюра.
  // Акцентное действие без заливки (напр. «Завершить»). Пробуем как замену neutral.
  tonal: {
    background: 'var(--surface-raised)',
    color: 'var(--color-primary)'
  },
  // Зелёная — сплошная акцентная заливка + чёрный текст (как кнопка в инфо-попапе
  // рейтинга), сплошная рамка чуть темнее заливки. Цвет переопределяется через `style`
  // (напр. «Завершить» заплыва — голубой). БЕЗ блюра — обычная залитая кнопка.
  accent: {
    background: 'var(--color-primary)',
    color: 'var(--accent-on)'
  },
  // ГЛАВНЫЙ CTA «Начать» — фирменная зелёная заливка + БЕЛЫЙ текст, БЕЗ обводки.
  // Единый вид старта во всех разделах (цвет раздела живёт на иконке/данных, а не
  // на кнопке действия — как оранжевый Record у Strava в любом спорте).
  primary: {
    background: 'var(--color-primary)',
    border: 'none',
    color: 'var(--accent-on)'
  },
  // Светло-серая — сплошная нейтральная заливка (--neutral-600) + БЕЛЫЙ текст, тонкая
  // светлая рамка. Нейтральные действия без фирменного зелёного акцента.
  gray: {
    background: 'var(--neutral-600)',
    color: 'var(--color-text)'
  },
  // Прозрачная — только текст, БЕЗ фона и обводки (tertiary). Вторичное действие (Назад/Отмена).
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-secondary)'
  },
  // Для прогресс-заливки: обрезаем растущий фон по скруглению кнопки.
  clip: { position: 'relative', overflow: 'hidden' },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    background: 'var(--layer-3)',
    transition: 'width 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
    pointerEvents: 'none'
  },
  label: { position: 'relative', zIndex: 1 }
}
