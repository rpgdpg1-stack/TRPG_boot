import { useRef, useState } from 'react'

/**
 * Нажатие с отменой — один жест на все круглые кнопки.
 *
 * Было четыре почти одинаковые копии (крестик, Play, ▶ поверх ролика, «наверх»,
 * ракета): палец опустился — кнопка «нажата»; увёл в сторону — состояние
 * снимается и действие НЕ срабатывает; отпустил на кнопке — срабатывает.
 *
 * Почему не просто `:active`: на карусели и в списках палец часто уезжает
 * вместе с лентой, и без порога кнопка ловила бы случайные запуски. Порог тот
 * же, что у долгого нажатия по карточкам, — 8px.
 *
 * Возвращает `pressed` (для вида) и `handlers` (навесить на кнопку).
 *
 *   const { pressed, handlers } = usePress(onStart)
 *   <button {...handlers} className="press-up press-fill" />
 */
const MOVE_TOLERANCE_PX = 8

export function usePress(onActivate, { stopPropagation = false } = {}) {
  const ref = useRef(null)
  const armed = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  const [pressed, setPressed] = useState(false)

  const down = (e) => {
    if (stopPropagation) e.stopPropagation()
    armed.current = true
    start.current = { x: e.clientX, y: e.clientY }
    setPressed(true)
  }

  const move = (e) => {
    if (!armed.current) return
    // Палец поехал — это листание, а не тап.
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (Math.abs(dx) > MOVE_TOLERANCE_PX || Math.abs(dy) > MOVE_TOLERANCE_PX) {
      armed.current = false
      setPressed(false)
      return
    }
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) { armed.current = false; setPressed(false) }
  }

  const up = (e) => {
    if (stopPropagation) e.stopPropagation()
    const was = armed.current
    armed.current = false
    setPressed(false)
    if (was) onActivate?.(e)
  }

  const cancel = () => { armed.current = false; setPressed(false) }

  return {
    pressed,
    ref,
    handlers: {
      ref,
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: cancel
    }
  }
}
