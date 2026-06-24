import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'

/**
 * Компактное контекст-меню, привязанное к кнопке («⋯») — как нативное iOS/Telegram.
 *
 * - Само меню «стекло» (блюр фона под ним), весь экран НЕ затемняется.
 * - Раскрывается/сворачивается из угла, ближайшего к кнопке.
 * - Без «Закрыть» — тап мимо закрывает.
 * - Нажатие на пункт — серая пилюля-подсветка (держишь — есть, убрал — нет).
 *
 * @param anchorRect — DOMRect кнопки, от неё позиционируется меню.
 * @param items — [{ key, icon, label, labelColor?, haptic?, onClick } | { divider:true }]
 * @param onClose — закрыть (вызывается после анимации сворачивания).
 */
export default function AnchorMenu({ anchorRect, items, onClose }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [placement, setPlacement] = useState('below')
  const [closing, setClosing] = useState(false)
  const [pressed, setPressed] = useState(null)

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => onClose?.(), 170)
  }

  // Esc + блокировка скролла фона через overflow:hidden (БЕЗ position:fixed —
  // тот сдвигал страницу на -scrollY и под закреплённой шапкой с blur всё
  // моргало при открытии меню ниже середины экрана).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Позиция: правый край меню к правому краю кнопки, вниз с зазором; если не
  // влезает — вверх. Угол роста — ближайший к кнопке.
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

  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 250)
    return () => clearTimeout(t)
  }, [])

  const onItem = (it) => (e) => {
    e.stopPropagation()
    it.haptic === 'medium' ? haptic.medium() : haptic.light()
    requestClose()
    it.onClick?.()
  }
  const rowProps = (key) => ({
    onPointerDown: () => setPressed(key),
    onPointerUp: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
    onPointerCancel: () => setPressed(null)
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
        {items.map((it, i) => it.divider ? (
          <div key={`d${i}`} style={styles.divider} />
        ) : (
          <button
            key={it.key}
            {...rowProps(it.key)}
            onClick={onItem(it)}
            style={{
              ...styles.row,
              background: pressed === it.key ? 'rgba(255,255,255,0.10)' : 'transparent',
              transform: pressed === it.key ? 'scale(0.985)' : 'scale(1)'
            }}
          >
            <span style={styles.icon}>{it.icon}</span>
            <span style={{ ...styles.label, ...(it.labelColor ? { color: it.labelColor } : null) }}>
              {it.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  return createPortal(menu, document.body)
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'transparent',
    zIndex: 9999
  },
  menu: {
    position: 'fixed',
    minWidth: '234px',
    maxWidth: '290px',
    background: 'rgba(28, 28, 30, 0.7)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '33px',
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
    borderRadius: '90px',
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
