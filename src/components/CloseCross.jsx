import { useRef, useState } from 'react'

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
 * центр-снизу под модалкой). Размеры настраиваются пропсами.
 */
function CrossIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

export default function CloseCross({ onClose, hitSize = 56, bubbleSize = 46, iconSize = 20, pulse = false, style }) {
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
    if (armed) onClose?.()
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
          background: press ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
          transform: press ? 'scale(1.12)' : 'scale(1)',
          transition: 'transform 0.18s var(--ease-ios), background 0.18s ease, color 0.18s ease'
        }}
      >
        <CrossIcon size={iconSize} />
      </span>
    </button>
  )
}
