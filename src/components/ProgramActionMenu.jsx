import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'
import PixelHeart from './PixelHeart'

/**
 * Компактное контекст-меню программы — выпадает у «⋯» (как нативное iOS/Telegram).
 *
 * - Само меню — «стекло» (блюр фона под ним), весь экран НЕ затемняется.
 * - Раскрывается/сворачивается из угла, ближайшего к «⋯» (рост и сжатие в угол).
 * - Пункты: «Добавить/Убрать из избранного» (сердечко outline/залитое) + для своей
 *   программы Редактировать / Поделиться / Удалить. Без «Закрыть» — тап мимо закрывает.
 * - Нажатие на пункт — серая пилюля-подсветка (держишь — есть, убрал палец — нет).
 *
 * @param anchorRect — DOMRect кнопки «⋯».
 */
export default function ProgramActionMenu({
  anchorRect,
  isFav = false,
  onToggleFav,
  editable,
  onEdit,
  onShare,
  onDelete,
  onClose
}) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [placement, setPlacement] = useState('below')
  const [closing, setClosing] = useState(false)
  const [pressed, setPressed] = useState(null)

  // Анимированное закрытие: сначала сжатие в угол, потом размонтирование.
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => onClose?.(), 170)
  }

  // Esc + фиксация фона (визуально остаётся на месте: top:-scrollY).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    const scrollY = window.scrollY
    const body = document.body
    const prev = {
      position: body.style.position, top: body.style.top,
      left: body.style.left, right: body.style.right, width: body.style.width
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      document.removeEventListener('keydown', onKey)
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Позиция: правый край меню к правому краю «⋯», вниз с зазором; если не влезает
  // вниз — вверх. Угол роста — ближайший к «⋯».
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !anchorRect) return
    const gap = 10
    const mw = el.offsetWidth
    const mh = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = anchorRect.right - mw
    left = Math.max(8, Math.min(left, vw - 8 - mw))
    let top = anchorRect.bottom + gap
    let place = 'below'
    if (top + mh > vh - 8) {
      const above = anchorRect.top - gap - mh
      if (above >= 8) { top = above; place = 'above' }
      else top = Math.max(8, vh - 8 - mh)
    }
    setPlacement(place)
    setPos({ top, left })
  }, [anchorRect])

  // Гасим «долетевший» тап, которым открыли меню (первые 250мс).
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 250)
    return () => clearTimeout(t)
  }, [])

  const act = (fn, strong) => (e) => {
    e.stopPropagation()
    strong ? haptic.medium() : haptic.light()
    requestClose()
    fn?.()
  }

  const rowProps = (key) => ({
    onPointerDown: () => setPressed(key),
    onPointerUp: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
    onPointerCancel: () => setPressed(null),
    style: {
      ...styles.row,
      background: pressed === key ? 'rgba(255,255,255,0.10)' : 'transparent',
      transform: pressed === key ? 'scale(0.985)' : 'scale(1)'
    }
  })

  const visible = pos && !closing

  const menu = (
    <div
      style={{ ...styles.overlay, pointerEvents: ready ? 'auto' : 'none' }}
      onClick={requestClose}
    >
      <div
        ref={menuRef}
        style={{
          ...styles.menu,
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.6)',
          transformOrigin: placement === 'above' ? 'bottom right' : 'top right'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button {...rowProps('fav')} onClick={act(onToggleFav, true)}>
          <span style={styles.icon}><PixelHeart filled={isFav} size={20} /></span>
          <span style={styles.label}>{isFav ? 'Убрать из избранного' : 'Добавить в избранное'}</span>
        </button>

        {editable && (
          <>
            <div style={styles.divider} />
            <button {...rowProps('edit')} onClick={act(onEdit)}>
              <span style={styles.icon}><UiIcon name="change" size={20} color="#3FA2F7" /></span>
              <span style={styles.label}>Редактировать</span>
            </button>
            <button {...rowProps('share')} onClick={act(onShare)}>
              <span style={styles.icon}><UiIcon name="invite-friend" size={20} color="#9ED153" /></span>
              <span style={styles.label}>Поделиться</span>
            </button>
            <button {...rowProps('delete')} onClick={act(onDelete)}>
              <span style={styles.icon}><TrashIcon /></span>
              <span style={{ ...styles.label, color: '#E84545' }}>Удалить</span>
            </button>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(menu, document.body)
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke="#E84545" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M4 5.5 H16" />
        <path d="M8 5.5 V4 H12 V5.5" />
        <path d="M5.5 5.5 L6.2 16 H13.8 L14.5 5.5" />
        <path d="M8.5 8.5 V13" />
        <path d="M11.5 8.5 V13" />
      </g>
    </svg>
  )
}

const styles = {
  // Прозрачный слой — только ловит тап мимо меню. Экран НЕ затемняем.
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'transparent',
    zIndex: 9999
  },
  // Само меню — «стекло»: полупрозрачный фон + блюр (как таб-бар).
  menu: {
    position: 'fixed',
    minWidth: '234px',
    maxWidth: '290px',
    background: 'rgba(28, 28, 30, 0.7)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
    transition: 'opacity 0.16s ease, transform 0.17s cubic-bezier(0.2, 0.7, 0.3, 1)'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 14px',
    border: 'none',
    borderRadius: '13px',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background 0.12s ease, transform 0.1s ease',
    WebkitTapHighlightColor: 'transparent'
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '20px',
    flexShrink: 0,
    lineHeight: 0
  },
  label: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap'
  },
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.08)',
    margin: '4px 8px'
  }
}
