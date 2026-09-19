/**
 * Кнопка-пилюля — ОДНА на проект. Зеркало компонента Button в Figma (секция 🔘 Button):
 * Variant × Size × Tone × State + стекло.
 *
 * VARIANT — роль действия:
 *  - 'primary'   — главное действие экрана/окна: зелёная заливка + тёмный текст («Начать», «Сохранить»).
 *  - 'tonal'     — акцент без заливки: тёмная поверхность + зелёный текст («Завершить», «Добавить»).
 *  - 'secondary' — нейтральное действие: тёмная поверхность + белый текст («Назад», «Отмена»).
 *  - 'tertiary'  — тихое: без фона, серый текст («Позже», «Всё равно начать»).
 *
 * SIZE: 'large' 52 (CTA, модалки) · 'medium' 36 (обычные) · 'small' 30 (инлайн, заметка).
 *
 * TONE: 'destructive' — действие теряет данные. У primary — красная заливка + белый текст,
 * у остальных — красный ТОЛЬКО текст/иконка, фон свой (серый).
 *
 * GLASS (Boolean) — только когда кнопка висит НАД контентом (док снизу, плавающие контролы):
 * фон --color-surface-dim + размытие + тень, как у «наверх». Главное действие (primary) стеклом
 * не делаем — теряет контраст; для primary флаг игнорируется.
 * HAIRLINE (Boolean) — волосок 1px по краю стекла (читается на пёстром фоне). Только со стеклом.
 *
 * СОСТОЯНИЯ:
 *  - disabled — тёмная утопленная поверхность + серый текст; нажатия не проходят.
 *  - variant="dim" — тот же вид, но кнопка НАЖИМАЕТСЯ («ещё рано»: «Завершить», пока ничего
 *    не отмечено, — тап показывает подсказку).
 *  - loading / done — кружок / галочка по центру; текст остаётся невидимым, ширина не прыгает.
 *    `done` ставить только там, где кнопка остаётся на экране.
 *  - нажатие — общий паттерн «наверх»: растёт на 3% и светлеет (заливка на 8%, стекло
 *    и прозрачная — на 25%). Отключённая не отвечает.
 *
 * Старые имена работают как псевдонимы (миграция 19.09.2026): accent → primary,
 * gray → secondary, ghost → tertiary, neutral → tonal + glass, md/sm/xs → large/medium/small,
 * bordered → hairline.
 *
 * Мгновенные действия (меньше ~300 мс, всё локально) загрузку не показывают: мигание
 * кружка читается как сбой.
 */
import Spinner from './Spinner'
import UiIcon from './UiIcon'

const VARIANT_ALIAS = { accent: 'primary', gray: 'secondary', ghost: 'tertiary' }
const SIZE_ALIAS = { md: 'large', sm: 'medium', xs: 'small' }

export default function ActionButton({
  variant = 'secondary',
  size = 'large',
  tone = 'default',
  glass = false,
  hairline = false,
  bordered = false,
  disabled = false,
  hug = false,
  onClick,
  loading = false,
  done = false,
  children,
  style,
  className = '',
  progress = null,
  ...rest
}) {
  // Старое «neutral» — стеклянная кнопка с зелёным текстом = tonal + glass.
  const legacyGlass = variant === 'neutral'
  const dim = variant === 'dim'
  const v = legacyGlass ? 'tonal' : (VARIANT_ALIAS[variant] || variant)
  const sz = SIZE_ALIAS[size] || size
  const isGlass = (glass || legacyGlass) && v !== 'primary'
  const withHair = isGlass && (hairline || bordered)
  const destructive = tone === 'destructive'
  const off = disabled || dim

  const look = off
    ? { ...(v === 'tertiary' ? styles.tertiary : styles.disabledFill), color: 'var(--color-text-disabled)' }
    : destructive
      ? (v === 'primary' ? styles.primaryDestructive : { ...(styles[v] || styles.secondary), color: 'var(--color-error)' })
      : (styles[v] || styles.secondary)
  const glassLook = isGlass
    ? { ...styles.glass, ...(withHair ? styles.glassHairline : null) }
    : null

  // Заливка есть → светлеет она сама; стекло и прозрачная → светлеет фон.
  const pressClass = `press-up-lg ${isGlass || v === 'tertiary' ? 'press-glass' : 'press-fill'}`
  const busy = loading || done
  const showFill = progress != null && !off
  const pct = Math.max(0, Math.min(100, progress || 0))
  const iconSize = sz === 'large' ? 24 : 18
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`${pressClass} ${className}`.trim()}
      style={{
        ...styles.base, ...(styles[sz] || styles.large), ...(hug ? styles.hug : styles.full),
        ...look, ...glassLook,
        ...(showFill || busy ? styles.clip : null), ...style
      }}
      {...rest}
    >
      {busy ? (
        <>
          {/* Содержимое остаётся в потоке — только невидимое: так кнопка
              сохраняет свою ширину и высоту. */}
          <span style={styles.hiddenLabel} aria-hidden="true">{children}</span>
          <span style={styles.busyLayer}>
            {done ? <UiIcon name="check" size={iconSize} /> : <Spinner size={iconSize} />}
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
    border: 'none',
    // Иконка ↔ текст — единый зазор во всех кнопках (4px).
    gap: 'var(--space-1)',
    transition: 'background 0.2s ease, color 0.2s ease'
  },
  // Размеры (высота / скругление / типографика — из токенов).
  large: {
    height: 'var(--btn-height)',
    padding: '0 var(--space-5)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-button-lg-size)',
    fontWeight: 'var(--text-button-weight)',
    letterSpacing: '0.3px'
  },
  medium: {
    height: 'var(--btn-height-sm)',
    padding: '0 var(--space-3)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 'var(--text-button-weight)',
    letterSpacing: '0.3px'
  },
  small: {
    height: 'var(--btn-height-xs)',
    padding: '0 var(--space-2)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 'var(--text-button-weight)',
    letterSpacing: '0.3px'
  },
  full: { width: '100%' },
  hug: { width: 'auto' },
  // Виды.
  primary: { background: 'var(--color-primary)', color: 'var(--accent-on)' },
  tonal: { background: 'var(--surface-tonal)', color: 'var(--color-text-tonal)' },
  secondary: { background: 'var(--surface-tonal)', color: 'var(--color-text)' },
  tertiary: { background: 'transparent', color: 'var(--color-text-secondary)' },
  primaryDestructive: { background: 'var(--color-error)', color: 'var(--color-text)' },
  disabledFill: { background: 'var(--surface-disabled)' },
  // Стекло — рецепт кнопки «наверх» (ScrollTopButton): прозрачный фон, размытие, тень.
  glass: {
    background: 'var(--glass-bg)',
    backdropFilter: 'var(--glass-filter)',
    WebkitBackdropFilter: 'var(--glass-filter)',
    boxShadow: 'var(--glass-shadow)'
  },
  // Волосок внутри (inset) — размер не меняется; тень стекла сохраняем.
  glassHairline: { boxShadow: 'var(--glass-hairline), var(--glass-shadow)' },
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
