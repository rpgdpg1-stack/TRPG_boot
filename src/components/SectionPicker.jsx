import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'

/**
 * Пикер разделов — стеклянная мини-модалка из ЦЕНТРА иконки раздела (растёт из
 * неё). 1:1 с `DayPicker` в дне тренировок (тот же размер/стекло/анимация), но в
 * ячейках — ИКОНКИ разделов вместо букв. Все серые; текущий (просматриваемый) —
 * в акцентном цвете раздела и в кружке. Тап по разделу — переключение; тап по
 * фону / Esc — закрытие. Портал в body, позиция fixed по `anchorRect`.
 *
 * sections: [{ id, iconName, color }], currentId, onPick(id), onClose.
 */
export default function SectionPicker({ sections, currentId, anchorRect, onPick, onClose }) {
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
    <div style={styles.overlay} onClick={requestClose}>
      <div
        style={{
          ...styles.panel,
          left: `${cx}px`,
          top: `${cy}px`,
          opacity: shown ? 1 : 0,
          transform: `translate(-50%, -50%) scale(${shown ? 1 : 0.5})`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {sections.map(s => {
          const isCurrent = s.id === currentId
          return (
            <button
              key={s.id}
              onClick={() => { haptic.light(); onPick(s.id) }}
              className="press-tile"
              style={{ ...styles.cell, ...(isCurrent ? styles.cellCircle : null) }}
              aria-label={s.title}
            >
              <UiIcon name={s.iconName} size={26} color={isCurrent ? s.color : 'var(--color-text-secondary)'} />
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

// Стили 1:1 с pickerStyles DayPicker (тот же размер/стекло/скругление).
const styles = {
  overlay: { position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent', touchAction: 'none' },
  panel: {
    position: 'fixed',
    display: 'flex',
    gap: '6px',
    padding: '7px',
    background: 'rgba(28, 28, 30, 0.72)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 'var(--radius-pill)',
    boxShadow: '0 14px 44px rgba(0, 0, 0, 0.55)',
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
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  cellCircle: { background: 'rgba(255, 255, 255, 0.10)' }
}
