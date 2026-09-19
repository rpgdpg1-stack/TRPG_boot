import { useRef, useState } from 'react'
import UiIcon from './UiIcon'

/**
 * Универсальный крестик-закрытие. Единое поведение во всех модалках/оверлеях:
 *  - тап: кружок чуть увеличивается И подкрашивается светло-серым;
 *  - удержание: остаётся увеличенным и серым;
 *  - увёл палец в сторону: возвращается (без увеличения и без серого), действие НЕ
 *    срабатывает;
 *  - отпустил на крестике: onClose().
 * Переход плавный (микро-анимация transform + background).
 *
 * Позиционирование задаёт родитель через `style` (напр. absolute top/right, либо
 * центр-снизу под модалкой). Размеры настраиваются пропсами. `bubbleStyle` —
 * доводка самого кружка (фон, обводка), когда крестик стоит в ряд с другими
 * стеклянными контролами и должен быть с ними одного семейства.
 *
 * Закрытие идёт по pointerUp — значит следующий синтетический `click` попал бы уже
 * на элемент ПОД снятой модалкой (открывались «Настройки» под крестиком). Поэтому
 * один такой клик гасим в capture-фазе.
 */
function swallowNextClick() {
  const swallow = (e) => { e.stopPropagation(); e.preventDefault() }
  document.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 400)
}
function CrossIcon({ size = 20 }) {
  return <UiIcon name="close" size={size} style={{ display: 'block' }} />
}

export default function CloseCross({ onClose, hitSize = 56, bubbleSize = 46, iconSize = 20, pulse = false, glass = false, style, bubbleStyle }) {
  const ref = useRef(null)
  const armedRef = useRef(false)
  const [press, setPress] = useState(false)

  const down = () => { armedRef.current = true; setPress(true) }
  const move = (e) => {
    if (!armedRef.current) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) { armedRef.current = false; setPress(false) }
  }
  const up = () => {
    const armed = armedRef.current
    armedRef.current = false
    setPress(false)
    if (armed) { swallowNextClick(); onClose?.() }
  }
  const cancel = () => { armedRef.current = false; setPress(false) }

  return (
    <button
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClick={(e) => e.stopPropagation()}
      aria-label="Закрыть"
      style={{
        flexShrink: 0,
        width: `${hitSize}px`,
        height: `${hitSize}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'none',
        ...style
      }}
    >
      <span
        className={pulse && !press ? 'pop-scale' : undefined}
        style={{
          width: `${bubbleSize}px`,
          height: `${bubbleSize}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          color: press ? 'var(--color-text)' : 'var(--color-text-secondary)',
          background: press ? 'var(--overlay-pressed-strong)' : (glass ? 'var(--glass-bg)' : 'var(--layer-2)'),
          // glass — крестик висит НАД контентом (шапка дня/заплыва): общий рецепт стекла + волосок.
          ...(glass ? { backdropFilter: 'var(--glass-filter)', WebkitBackdropFilter: 'var(--glass-filter)', boxShadow: 'var(--glass-hairline), var(--glass-shadow)' } : null),
          transform: press ? 'scale(var(--press-scale-up))' : 'scale(1)',
          transition: press
            ? 'transform var(--press-in) var(--ease-ios), background var(--press-in) ease, color var(--press-in) ease'
            : 'transform var(--press-out) var(--ease-ios), background var(--press-out) ease, color var(--press-out) ease',
          ...bubbleStyle
        }}
      >
        <CrossIcon size={iconSize} />
      </span>
    </button>
  )
}
