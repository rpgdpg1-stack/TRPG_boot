import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Компактное контекст-меню, привязанное к элементу — как нативное iOS/Telegram.
 *
 * - Само меню «стекло» (блюр фона под ним), весь экран НЕ затемняется.
 * - Без «Закрыть» — тап мимо закрывает.
 * - Нажатие на пункт — серая пилюля-подсветка (держишь — есть, убрал — нет).
 *
 * Два режима подачи:
 *  - `align='right' + motion='scale'` (по умолчанию) — раскрытие из угла кнопки «⋯».
 *  - `align='center' + motion='drop'` — меню долгого нажатия: по центру под карточкой,
 *    выезжает сверху вниз (как меню чата в Telegram).
 *
 * @param anchorRect — DOMRect якоря (кнопки или карточки), от него позиционируется меню.
 * @param items — [{ key, icon, label, labelColor?, haptic?, onClick } | { divider:true }
 *   | { key, custom: <ReactNode> } — произвольное содержимое (напр. сегмент-контрол)]
 * @param onClose — закрыть (вызывается после анимации сворачивания).
 * @param align — 'right' (к правому краю якоря) | 'center' (по центру) | 'left'
 *   (к левому краю якоря — так открываются меню долгого нажатия).
 * @param gap — зазор между якорем и меню, px.
 * @param motion — 'scale' (раскрытие из угла) | 'drop' (выезд сверху вниз, 200мс).
 */
export default function AnchorMenu({ anchorRect, items, onClose, align = 'right', gap = 10, motion = 'scale' }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [placement, setPlacement] = useState('below')
  const [closing, setClosing] = useState(false)
  const [pressed, setPressed] = useState(null)

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => onClose?.(), motion === 'drop' ? 200 : 170)
  }

  // Только Esc. Скролл фона НЕ лочим через html/body (и position:fixed, и
  // overflow:hidden ломали закреплённую шапку с blur — она дёргалась/улетала).
  // Прокрутку под меню гасим через touch-action:none на оверлее (см. стили) —
  // фон при этом не трогаем, закреп остаётся на месте.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Позиция: меню под якорем с зазором `gap`; по горизонтали — к правому краю
  // якоря (align='right') или по его центру (align='center'). Не влезает вниз — вверх.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !anchorRect) return
    const mw = el.offsetWidth
    const mh = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'center'
      ? anchorRect.left + anchorRect.width / 2 - mw / 2
      : align === 'left'
        ? anchorRect.left
        : anchorRect.right - mw
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
  }, [anchorRect, align, gap])

  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 250)
    return () => clearTimeout(t)
  }, [])

  // Драг/скролл по пункту отменяет тап: подсветка снимается и действие НЕ
  // выполняется (как обычная кнопка — потянул пальцем мимо = не нажал).
  const pressStart = useRef(null)
  const pressMoved = useRef(false)

  const onItem = (it) => (e) => {
    e.stopPropagation()
    if (pressMoved.current) { pressMoved.current = false; return }
    it.haptic === 'medium' ? haptic.medium() : haptic.light()
    requestClose()
    it.onClick?.()
  }
  const rowProps = (key) => ({
    onPointerDown: (e) => {
      setPressed(key)
      pressStart.current = { x: e.clientX, y: e.clientY }
      pressMoved.current = false
    },
    onPointerMove: (e) => {
      if (!pressStart.current) return
      if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) {
        pressMoved.current = true
        setPressed(null)
      }
    },
    onPointerUp: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
    onPointerCancel: () => setPressed(null)
  })

  const visible = pos && !closing

  // Свёрнутое состояние: 'scale' — схлопывание в угол якоря; 'drop' — меню
  // «выезжает» сверху вниз (или снизу вверх, если развернулось над карточкой).
  const drop = motion === 'drop'
  const hiddenTransform = drop
    ? `translateY(${placement === 'above' ? 12 : -12}px) scale(0.98)`
    : 'scale(0.6)'
  const originX = align === 'center' ? 'center' : align === 'left' ? 'left' : 'right'
  const transformOrigin = `${placement === 'above' ? 'bottom' : 'top'} ${originX}`

  const menu = (
    <div
      ref={overlayRef}
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
          transform: visible ? 'translateY(0) scale(1)' : hiddenTransform,
          transformOrigin,
          // Выезд по долгому нажатию: 200мс с плавным разгоном и торможением.
          ...(drop ? { transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' } : null)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => it.divider ? (
          <div key={`d${i}`} style={styles.divider} />
        ) : it.custom ? (
          <div key={it.key || `c${i}`} style={styles.custom}>{it.custom}</div>
        ) : (
          <button
            key={it.key}
            {...rowProps(it.key)}
            onClick={onItem(it)}
            style={{
              ...styles.row,
              background: pressed === it.key ? 'var(--layer-2)' : 'transparent',
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
    // Гасим прокрутку фона, не трогая html/body (иначе ломается закреп).
    touchAction: 'none',
    overscrollBehavior: 'contain',
    zIndex: 9999
  },
  menu: {
    position: 'fixed',
    minWidth: '234px',
    maxWidth: '290px',
    background: 'var(--surface-glass)',
    backdropFilter: 'var(--blur-glass)',
    WebkitBackdropFilter: 'var(--blur-glass)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-15)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-05)',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
    transition: 'opacity 0.16s ease, transform 0.17s cubic-bezier(0.2, 0.7, 0.3, 1)'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-3) var(--space-4)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
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
    fontSize: 'var(--text-body-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap'
  },
  // Произвольное содержимое пункта (сегмент-контрол выбора периода и т.п.).
  custom: { padding: 'var(--space-05)' },
  divider: {
    height: '1px',
    background: 'var(--layer-2)',
    margin: 'var(--space-1) var(--space-2)'
  }
}
