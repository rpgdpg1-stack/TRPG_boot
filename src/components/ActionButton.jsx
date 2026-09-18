/**
 * Переиспользуемая кнопка-действие в стиле пикера: полупрозрачный фон + блюр.
 * Один компонент на все «прибитые» кнопки (Завершить, Сменить, Сохранить и т.п.),
 * высоту/типографику при необходимости можно переопределить через `style`.
 *
 * Виды (variant) и состояния:
 *  - disabled → 'dim': принятое disabled-состояние — тёмная утопленная поверхность
 *    (--surface-disabled) + серый текст/иконка (--color-text-disabled). Тем же видом
 *    красится «ещё рано» (напр. «Завершить», пока не отмечено ни одного упражнения):
 *    variant="dim" даёт disabled-вид, но кнопка остаётся нажимаемой.
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
 * Скругление у обоих — пилюля (--radius-pill). Текст — единый токен Button (14/700 Bold,
 * lg — 16/700), как одноимённые текст-стили в Figma «Button lg» / «Button sm,md».
 *
 * bordered (Boolean): опциональная внутренняя обводка 1px белый 8% (inset box-shadow,
 * не меняет размер). Ортогональна variant — включается на любом виде, где нужна
 * (в Figma это Boolean-свойство «Border»).
 *
 * disabled всегда перебивает variant и даёт вид 'dim'.
 *
 * НАЖАТИЕ (17.09.2026) — общий паттерн «наверх»: кнопка растёт на 3%
 * (`press-up-lg`) и светлеет. Залитые виды (primary, accent, tonal, gray, dim)
 * светлеют заливкой на 8% — белым поверх зелёного выходила грязь; прозрачные
 * (neutral-стекло, ghost) — фоном на 25%. Отключённая кнопка не отвечает ничем.
 * Вжима (press-tile) у кнопок больше нет: он остался у плиток и строк.
 *
 * ЗАГРУЗКА И ГОТОВО (`loading`, `done`). Вместо надписи «Сохранение…» — кружок
 * по центру кнопки, а следом (где это уместно) галочка. Заливка и размеры НЕ
 * меняются: текст остаётся на месте, но становится невидимым, и кнопка не
 * прыгает по ширине. Нажатия в это время не проходят, но вид у кнопки живой —
 * действие принято, а не заблокировано.
 *
 * `done` ставить только там, где кнопка ОСТАЁТСЯ на экране (сохранение заметки,
 * своего упражнения). Если кнопка сразу превращается в другую («Начать» →
 * «Завершить») или экран уходит — галочка не нужна, её никто не успеет прочесть.
 *
 * Мгновенные действия (меньше ~300 мс, всё локально) вообще не показывают
 * загрузку: мигание кружка читается как сбой, а не как работа.
 */
import Spinner from './Spinner'

export default function ActionButton({
  variant = 'neutral',
  size = 'md',
  disabled = false,
  hug = false,
  bordered = false,
  onClick,
  loading = false,
  done = false,
  children,
  style,
  className = '',
  progress = null,
  ...rest
}) {
  const look = disabled ? styles.dim : (styles[variant] || styles.neutral)
  // Заливка есть → светлеет она сама; стекло и прозрачная → светлеет фон.
  const filled = ['primary', 'accent', 'tonal', 'gray', 'dim'].includes(variant) || disabled
  const pressClass = `press-up-lg ${filled ? 'press-fill' : 'press-glass'}`
  // Пока идёт сохранение, кнопка не принимает нажатий, но остаётся «живой»:
  // вид берём обычный, а не disabled.
  const busy = loading || done
  const sizing = styles[size] || styles.md
  // Прогресс-заливка за текстом (например, «Завершить»: фон светло-серым
  // растёт по мере отметки упражнений). Только для активной кнопки.
  const showFill = progress != null && !disabled
  const pct = Math.max(0, Math.min(100, progress || 0))
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`${pressClass} ${className}`.trim()}
      style={{ ...styles.base, ...sizing, ...(hug ? styles.hug : styles.full), ...look, ...(bordered ? styles.bordered : null), ...(showFill || busy ? styles.clip : null), ...style }}
      {...rest}
    >
      {busy ? (
        <>
          {/* Содержимое остаётся в потоке — только невидимое: так кнопка
              сохраняет свою ширину и высоту. */}
          <span style={styles.hiddenLabel} aria-hidden="true">{children}</span>
          <span style={styles.busyLayer}>
            {done ? <CheckMark /> : <Spinner size={size === 'md' ? 24 : 18} />}
          </span>
        </>
      ) : showFill ? (
        <>
          <span style={{ ...styles.fill, width: `${pct}%` }} aria-hidden="true" />
          <span style={styles.label}>{children}</span>
        </>
      ) : children}
    </button>
  )
}

function CheckMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  // Large — основной CTA. Высота 52, текст 16, паддинг из шкалы (20).
  md: {
    height: 'var(--btn-height)',
    padding: '0 var(--space-5)',
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
  // Small — компактные (заметка/инлайн). Высота 30, текст 14, паддинг из шкалы (8).
  xs: {
    height: 'var(--btn-height-xs)',
    padding: '0 var(--space-2)',
    gap: 'var(--space-1)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 'var(--text-button-weight)',
    letterSpacing: '0.3px'
  },
  // Во всю ширину (кнопки дока: «Сохранить программу» и т.п.).
  full: { width: '100%' },
  // По размеру контента (скругление облегает текст). Паддинг задаёт размер (md/sm/xs).
  hug: { width: 'auto' },
  // Disabled / «ещё рано»: тёмная утопленная поверхность + серый текст/иконка.
  // Сплошные цвета (не opacity), БЕЗ блюра и обводки.
  dim: {
    background: 'var(--surface-disabled)',
    color: 'var(--color-text-disabled)'
  },
  // Серая — полупрозрачный фон + блюр, сплошная рамка (пунктир оставлен только
  // кнопке «Добавить упражнение» в конструкторе/пикере).
  // Серая — полупрозрачный фон + блюр, сплошная рамка. Текст АКЦЕНТНЫЙ зелёный:
  // это активное действие («Завершить», «Добавить упражнения», «Сменить»), просто
  // без залитого фона. Цвет текста при необходимости перебивается через `style`
  // (напр. красный на достигнутом лимите).
  neutral: {
    background: 'var(--surface-glass)',
    backdropFilter: 'blur(var(--blur-md))',
    WebkitBackdropFilter: 'blur(var(--blur-md))',
    color: 'var(--color-primary)'
  },
  // Primary-tonal — приподнятая тёмная поверхность (--surface-tonal, #242427) + АКЦЕНТНЫЙ
  // зелёный текст/иконка (--color-text-tonal), БЕЗ обводки и БЕЗ блюра. Акцентное действие
  // без заливки (напр. «Завершить»).
  tonal: {
    background: 'var(--surface-tonal)',
    color: 'var(--color-text-tonal)'
  },
  // Зелёная — сплошная акцентная заливка + чёрный текст, сплошная рамка чуть
  // темнее заливки. Цвет переопределяется через `style`
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
  // Опциональная внутренняя обводка (проп `bordered`): 1px белый 8% через inset
  // box-shadow — не влияет на размер, включается/выключается независимо от variant.
  bordered: {
    boxShadow: 'inset 0 0 0 1px var(--border-tonal)'
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
  label: { position: 'relative', zIndex: 1 },
  // Невидимое, но занимающее место содержимое: ширина кнопки не скачет.
  hiddenLabel: { visibility: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' },
  busyLayer: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none'
  }
}
