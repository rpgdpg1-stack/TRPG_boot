/**
 * RowAction — круглое действие в строке списка. Зеркало Row Action в Figma.
 *
 * type="select" — «добавить / добавлено» (пикер упражнений):
 *   выкл — подложка белая 6% (--highlight-recent) + серый плюс;
 *   вкл (selected) — --accent-soft + зелёная галочка.
 * type="remove" — крестик удаления (конструктор): подложка 6% + серый крестик;
 *   при нажатии — красная подложка (--color-error-pressed) + красный крестик.
 *
 * Размер — Medium 36 (иконка 24), как в продукте; зона нажатия 44. Нажатие — растёт
 * до --press-scale-up и светлеет. dim — вид «нельзя» (45%), но тап проходит: пикер на лимите
 * показывает подсказку «Лимит 12/12» вместо молчания.
 *
 * Жест — общий usePress (увёл палец больше 8 px — не сработало). touchAction: manipulation —
 * кнопка стоит в прокручиваемом списке, листание, начатое с неё, должно работать.
 */
import { usePress } from '../lib/use-press'
import UiIcon from './UiIcon'

export default function RowAction({ type = 'select', selected = false, dim = false, onPress, ariaLabel }) {
  const { pressed, handlers } = usePress(() => onPress?.())
  const remove = type === 'remove'
  const bg = remove
    ? (pressed ? 'var(--color-error-pressed)' : 'var(--highlight-recent)')
    : (selected ? 'var(--accent-soft)' : 'var(--highlight-recent)')
  const color = remove
    ? (pressed ? 'var(--color-error)' : 'var(--color-text-secondary)')
    : (selected ? 'var(--color-primary)' : 'var(--color-text-secondary)')
  const icon = remove ? 'close' : (selected ? 'check' : 'add')

  return (
    <button
      type="button"
      aria-label={ariaLabel || (remove ? 'Удалить' : selected ? 'Убрать' : 'Добавить')}
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      style={styles.hit}
    >
      <span
        style={{
          ...styles.bubble,
          background: bg,
          color,
          opacity: dim ? 0.45 : 1,
          // Стеклянный отклик выбора: подложка светлеет; у удаления цвет задаёт сам pressed.
          filter: pressed && !remove ? 'brightness(var(--press-glass-brightness))' : 'none',
          transform: pressed ? 'scale(var(--press-scale-up))' : 'scale(1)',
          transition: pressed ? styles.transIn : styles.transOut
        }}
      >
        <UiIcon name={icon} size={24} style={{ display: 'block' }} />
      </span>
    </button>
  )
}

const styles = {
  hit: {
    width: 44, height: 44, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', padding: 0, margin: -4,
    cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent'
  },
  bubble: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    // Кружок на границе слоёв в iOS мерцал при анимации — держим его в своём слое.
    WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden'
  },
  transIn: 'transform var(--press-in) var(--ease-ios), background var(--press-in) ease, color var(--press-in) ease, filter var(--press-in) ease',
  transOut: 'transform var(--press-out) var(--ease-ios), background var(--press-out) ease, color var(--press-out) ease, filter var(--press-out) ease'
}
