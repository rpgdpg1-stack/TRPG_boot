/**
 * IconButton — круглая кнопка-значок, ОДНА на проект. Зеркало Icon Button (+ Close Button) в Figma.
 *
 * Снаружи — невидимая зона нажатия (hitSize, не меньше 44: мелкий кружок не должен
 * промахиваться), внутри — кружок с иконкой. Жест — общий usePress: палец увёл больше
 * чем на 8 px или за край — нажатие снимается и действие НЕ срабатывает.
 *
 * size:    'large' 52 · 'medium' 36 · 'small' 30; иконка 28 · 24 · 20 (у круглой кнопки
 *          без текста иконка — единственное содержимое, поэтому крупнее, чем в пилюле).
 * variant: 'primary' (зелёная заливка) · 'tonal' (тёмная + зелёная иконка) · 'secondary'
 *          (тёмная + белая) · 'tertiary' (без фона, серая) · 'close' (крестик закрытия:
 *          подложка белая 8% + серая иконка; при нажатии белая 18% + белая иконка).
 * tone:    'destructive' — иконка красная (у primary — красная заливка).
 * glass:   кнопка висит НАД контентом («наверх», ▶ на видео, крестик в шапке дня):
 *          общий рецепт --glass-* (фон, размытие, тень) + волосок. Primary стеклом не бывает.
 * swallowClick — для кнопок, которые закрывают оверлей: действие идёт по pointerUp, и
 *          следующий синтетический click попал бы на элемент ПОД снятым окном.
 *
 * Нажатие — растёт до --press-scale-up (1.12) и светлеет.
 */
import { usePress } from '../lib/use-press'
import UiIcon from './UiIcon'

const SIZES = { large: [52, 28], medium: [36, 24], small: [30, 20] }

function swallowNextClick() {
  const swallow = (e) => { e.stopPropagation(); e.preventDefault() }
  document.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 400)
}

function look(variant, { pressed, glass, destructive, disabled }) {
  if (disabled) {
    return { background: variant === 'tertiary' ? 'transparent' : 'var(--surface-disabled)', color: 'var(--color-text-disabled)' }
  }
  const red = destructive ? { color: 'var(--color-error)' } : null
  const glassBg = pressed ? 'var(--overlay-pressed-strong)' : 'var(--glass-bg)'
  switch (variant) {
    case 'primary':
      return {
        background: destructive ? 'var(--color-error)' : 'var(--color-primary)',
        color: destructive ? 'var(--color-text)' : 'var(--accent-on)',
        filter: pressed ? 'brightness(var(--press-brightness))' : 'none'
      }
    case 'tonal':
      return { background: glass ? glassBg : 'var(--surface-tonal)', color: 'var(--color-text-tonal)', filter: !glass && pressed ? 'brightness(var(--press-brightness))' : 'none', ...red }
    case 'tertiary':
      return { background: pressed ? 'var(--layer-2)' : 'transparent', color: 'var(--color-text-secondary)', ...red }
    case 'close':
      return {
        background: glass ? glassBg : (pressed ? 'var(--overlay-pressed-strong)' : 'var(--layer-2)'),
        color: pressed ? 'var(--color-text)' : 'var(--color-text-secondary)', ...red
      }
    default: // secondary
      return { background: glass ? glassBg : 'var(--surface-tonal)', color: 'var(--color-text)', filter: !glass && pressed ? 'brightness(var(--press-brightness))' : 'none', ...red }
  }
}

export default function IconButton({
  icon,
  variant = 'secondary',
  size = 'medium',
  tone = 'default',
  glass = false,
  disabled = false,
  pulse = false,
  hitSize,
  iconSize,
  onPress,
  ariaLabel,
  swallowClick = false,
  stopPropagation = false,
  style,
  bubbleStyle,
  className = ''
}) {
  const [px, ipx] = SIZES[size] || SIZES.medium
  const isGlass = glass && variant !== 'primary'
  const { pressed, handlers } = usePress(
    (e) => { if (disabled) return; if (swallowClick) swallowNextClick(); onPress?.(e) },
    { stopPropagation }
  )
  const active = pressed && !disabled
  const hit = Math.max(hitSize || px, 44)

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      className={className || undefined}
      style={{ ...styles.hit, width: hit, height: hit, ...style }}
    >
      <span
        className={pulse && !active ? 'pop-scale' : undefined}
        style={{
          ...styles.bubble,
          width: px, height: px,
          ...look(variant, { pressed: active, glass: isGlass, destructive: tone === 'destructive', disabled }),
          ...(isGlass ? styles.glass : null),
          transform: active ? 'scale(var(--press-scale-up))' : 'scale(1)',
          transition: active ? styles.transIn : styles.transOut,
          ...bubbleStyle
        }}
      >
        {typeof icon === 'string' ? <UiIcon name={icon} size={iconSize || ipx} style={{ display: 'block' }} /> : icon}
      </span>
    </button>
  )
}

const styles = {
  hit: {
    flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', padding: 0,
    cursor: 'pointer', touchAction: 'none', WebkitTapHighlightColor: 'transparent'
  },
  bubble: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%', flexShrink: 0
  },
  glass: {
    backdropFilter: 'var(--glass-filter)',
    WebkitBackdropFilter: 'var(--glass-filter)',
    boxShadow: 'var(--glass-hairline), var(--glass-shadow)'
  },
  transIn: 'transform var(--press-in) var(--ease-ios), background var(--press-in) ease, color var(--press-in) ease, filter var(--press-in) ease',
  transOut: 'transform var(--press-out) var(--ease-ios), background var(--press-out) ease, color var(--press-out) ease, filter var(--press-out) ease'
}
