import { useEffect, useState } from 'react'
import { haptic } from '../lib/telegram'

/**
 * Плавающая кнопка «наверх» (нижний правый угол). Появляется, когда список
 * прокручен вниз чуть больше порога, и уводит на самый верх плавным скроллом;
 * у верхней кромки прячется. Микро-анимация появления/скрытия (fade + подъём).
 *
 * Паттерн для длинных прокручиваемых экранов (день тренировки, заплыв). В профиле
 * НЕ используем — там список короткий. См. trpg-ui «Скролл-наверх».
 */
function ArrowUp({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V6M6 12l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ScrollTopButton({ threshold = 180 }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY || document.scrollingElement?.scrollTop || 0
        setShow(y > threshold)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [threshold])

  const toTop = () => {
    haptic.light()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.scrollingElement?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      onClick={toTop}
      aria-label="Наверх"
      style={{
        ...styles.btn,
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.9)',
        pointerEvents: show ? 'auto' : 'none'
      }}
    >
      <ArrowUp />
    </button>
  )
}

const styles = {
  btn: {
    position: 'fixed',
    right: '16px',
    bottom: 'calc(env(safe-area-inset-bottom) + 96px)',
    zIndex: 45,
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: 'var(--color-surface-dim)',
    border: '1px solid var(--color-border)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    color: 'var(--color-text)',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 0.22s ease, transform 0.22s var(--ease-ios)'
  }
}
