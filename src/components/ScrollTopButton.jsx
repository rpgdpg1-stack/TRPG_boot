import { useEffect, useState } from 'react'
import { haptic } from '../lib/telegram'
import IconButton from './IconButton'

/**
 * Плавающая кнопка «наверх» (нижний правый угол, над кнопкой дока). Появляется при
 * прокрутке вниз > порога, уводит на верх плавным скроллом, у кромки прячется.
 *
 * Кнопка — общий IconButton (Secondary · Large 52 · Glass: стекло + волосок, висит над
 * контентом). Жест с отменой — общий usePress.
 *
 * Для длинных прокручиваемых экранов (день тренировки, заплыв). В профиле НЕ нужен.
 *
 * @param scrollRef — ref прокручиваемого КОНТЕЙНЕРА. По умолчанию кнопка следит
 *   за окном, но в пикере упражнений список крутится внутри своего блока,
 *   и окно там неподвижно — без этого кнопка не появлялась бы никогда.
 * @param zIndex — поднять над полноэкранным оверлеем (пикер).
 */
function ArrowUp({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V6M6 12l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ScrollTopButton({ threshold = 180, scrollRef = null, zIndex }) {
  const [show, setShow] = useState(false)

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

  return (
    <IconButton
      icon={<ArrowUp />}
      variant="secondary"
      size="large"
      glass
      hitSize={56}
      onPress={toTop}
      ariaLabel="Наверх"
      style={{
        ...styles.hit,
        ...(zIndex ? { zIndex } : null),
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: show ? 'auto' : 'none'
      }}
    />
  )
}

const styles = {
  // Место и появление; сама кнопка — IconButton · Secondary · Large · Glass.
  hit: {
    position: 'fixed',
    right: '16px',
    // ~6px выше верхней кромки кнопки дока (--btn-height над --tabbar-bottom).
    bottom: 'calc(var(--tabbar-bottom) + 62px)',
    zIndex: 45,
    transition: 'opacity 0.22s ease, transform 0.22s var(--ease-ios)'
  }
}
