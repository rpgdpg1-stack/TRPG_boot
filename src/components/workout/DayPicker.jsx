import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../../lib/telegram'
import { useScrollLock } from '../../lib/use-scroll-lock'

/**
 * Выбор дня программы — поповер у якоря (буква дня в шапке).
 */
export default function DayPicker({ days, currentDay, sessionDay, colorForDay, anchorRect, onPick, onClose }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => onClose?.(), 170)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cx = anchorRect.left + anchorRect.width / 2
  const cy = anchorRect.top + anchorRect.height / 2
  const shown = entered && !closing

  return createPortal(
    <div ref={overlayRef} style={pickerStyles.overlay} onClick={requestClose}>
      <div
        style={{
          ...pickerStyles.panel,
          left: `${cx}px`,
          top: `${cy}px`,
          opacity: shown ? 1 : 0,
          transform: `translate(-50%, -50%) scale(${shown ? 1 : 0.5})`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {days.map(d => {
          const isSession = !!sessionDay && d === sessionDay
          const isCurrent = d === currentDay
          // Акцентный цвет группы — только ТЕКУЩИЙ (просматриваемый) день; он же выделен
          // серым кружком («ты тут»), либо пульсирует, если это запущенный день сессии.
          // Остальные — СЕРЫМ (как счётчик), чтобы не пестрило множеством цветов.
          const dColor = isCurrent
            ? (colorForDay ? colorForDay(d) : 'var(--color-primary)')
            : 'var(--color-text-secondary)'
          const circle = isCurrent && !isSession
          return (
            <button
              key={d}
              onClick={() => { haptic.light(); onPick(d) }}
              className={`press-tile${isSession ? ' day-picker-pulse' : ''}`}
              style={{
                ...pickerStyles.cell,
                color: dColor,
                ...(circle ? pickerStyles.cellCircle : null)
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

const pickerStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'transparent',
    touchAction: 'none'
  },
  panel: {
    position: 'fixed',
    display: 'flex',
    gap: 'var(--space-15)',
    padding: 'var(--space-2)',
    background: 'rgba(28, 28, 30, 0.72)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid var(--layer-3)',
    borderRadius: 'var(--radius-pill)',
    boxShadow: 'var(--shadow-modal)',
    transformOrigin: 'center',
    transition: 'opacity 0.16s ease, transform 0.19s cubic-bezier(0.2, 0.7, 0.3, 1)'
  },
  cell: {
    width: '46px',
    height: '46px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: '50%',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 'var(--text-heading-size)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  // Серый кружок под текущим (просматриваемым, не запущенным) днём — «ты тут».
  cellCircle: {
    background: 'var(--layer-2)'
  }
}

