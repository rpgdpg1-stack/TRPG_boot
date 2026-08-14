import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/telegram'

/**
 * Плавающая кнопка «наверх» (нижний правый угол, над кнопкой дока). Появляется при
 * прокрутке вниз > порога, уводит на верх плавным скроллом, у кромки прячется.
 *
 * Нажатие — как у крестика закрытия (CloseCross): кружок увеличивается и светлеет,
 * увёл палец — вернулся без действия. Отличие: здесь ЕСТЬ контур (обводка) — он
 * помогает читаемости кнопки над контентом.
 *
 * Для длинных прокручиваемых экранов (день тренировки, заплыв). В профиле НЕ нужен.
 *
 * @param scrollRef — ref прокручиваемого КОНТЕЙНЕРА. По умолчанию кнопка следит
 *   за окном, но в пикере упражнений список крутится внутри своего блока,
 *   и окно там неподвижно — без этого кнопка не появлялась бы никогда.
 * @param zIndex — поднять над полноэкранным оверлеем (пикер).
 */
function ArrowUp({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V6M6 12l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ScrollTopButton({ threshold = 180, scrollRef = null, zIndex }) {
  const [show, setShow] = useState(false)
  const [press, setPress] = useState(false)
  const ref = useRef(null)
  const armed = useRef(false)

  useEffect(() => {
    const box = scrollRef?.current || null
    const target = box || window
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = box
          ? box.scrollTop
          : (window.scrollY || document.scrollingElement?.scrollTop || 0)
        setShow(y > threshold)
      })
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { target.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [threshold, scrollRef])

  const toTop = () => {
    haptic.light()
    const box = scrollRef?.current
    if (box) { box.scrollTo({ top: 0, behavior: 'smooth' }); return }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.scrollingElement?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // «Растущее» нажатие с отменой при уводе пальца (как крестик закрытия).
  const down = () => { armed.current = true; setPress(true) }
  const move = (e) => {
    if (!armed.current) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) { armed.current = false; setPress(false) }
  }
  const up = () => { const a = armed.current; armed.current = false; setPress(false); if (a) toTop() }
  const cancel = () => { armed.current = false; setPress(false) }

  return (
    <button
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClick={(e) => e.stopPropagation()}
      aria-label="Наверх"
      style={{
        ...styles.hit,
        ...(zIndex ? { zIndex } : null),
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: show ? 'auto' : 'none'
      }}
    >
      <span
        style={{
          ...styles.bubble,
          background: press ? 'rgba(255, 255, 255, 0.18)' : 'var(--color-surface-dim)',
          color: press ? 'var(--color-text)' : 'var(--color-text-secondary)',
          transform: press ? 'scale(1.12)' : 'scale(1)'
        }}
      >
        <ArrowUp />
      </span>
    </button>
  )
}

const styles = {
  hit: {
    position: 'fixed',
    right: '16px',
    // ~6px выше верхней кромки кнопки дока (--btn-height 55 над --tabbar-bottom).
    bottom: 'calc(var(--tabbar-bottom) + 62px)',
    zIndex: 45,
    width: '56px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    touchAction: 'none',
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 0.22s ease, transform 0.22s var(--ease-ios)'
  },
  bubble: {
    width: '46px',
    height: '46px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: '1px solid var(--color-border)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
    transition: 'transform 0.18s var(--ease-ios), background 0.18s ease, color 0.18s ease'
  }
}
