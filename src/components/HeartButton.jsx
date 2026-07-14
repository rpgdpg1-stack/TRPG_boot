import { useRef, useState } from 'react'
import PixelHeart from './PixelHeart'

/**
 * Сердечко «в любимые» с «растущим» нажатием: зажал → увеличилось; увёл палец →
 * вернулось (без действия); отпустил на сердечке → onActivate() (там вибро + toggle).
 * Тот же паттерн, что у крестика-закрытия в мини-модалке.
 */
export default function HeartButton({ filled, color, size = 26, onActivate, ariaLabel, style }) {
  const ref = useRef(null)
  const armed = useRef(false)
  const [grow, setGrow] = useState(false)

  const down = () => { armed.current = true; setGrow(true) }
  const move = (e) => {
    if (!armed.current) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) { armed.current = false; setGrow(false) }
  }
  const up = (e) => {
    const a = armed.current
    armed.current = false
    setGrow(false)
    if (a) { e.stopPropagation(); onActivate?.() }
  }
  const cancel = () => { armed.current = false; setGrow(false) }

  return (
    <button
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClick={(e) => e.stopPropagation()}
      style={{ ...style, touchAction: 'none' }}
      aria-label={ariaLabel}
    >
      <span style={{ display: 'inline-flex', transform: grow ? 'scale(1.28)' : 'scale(1)', transition: 'transform 0.14s var(--ease-ios)' }}>
        <PixelHeart filled={filled} size={size} color={color} />
      </span>
    </button>
  )
}
