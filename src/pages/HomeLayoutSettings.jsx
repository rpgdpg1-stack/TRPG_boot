import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes } from '../lib/telegram'
import { HOME_SECTIONS, readHomeLayout, loadHomeLayoutFromCloud, saveHomeLayout } from '../lib/home-layout'
import ScreenTitle from '../components/ScreenTitle'

/**
 * Настройка «Отображение на главной».
 *
 * Сверху — закреплённые блоки (Карточка профиля, Избранное): всегда вверху,
 * отключить нельзя — показаны серым, без тумблера и без ручки.
 *
 * Ниже — управляемые секции (Разделы / История / Дневной буст): тумблер вкл/выкл
 * + перетаскивание порядка (логика и пресс-эффекты как в конструкторе программ).
 *
 * Состояние храним в CloudStorage (см. lib/home-layout) — синк между устройствами.
 */

const TITLES = Object.fromEntries(HOME_SECTIONS.map(s => [s.key, s.title]))

export default function HomeLayoutSettings() {
  const navigate = useNavigate()

  const [layout, setLayout] = useState(readHomeLayout)
  const [drag, setDrag] = useState(null) // { startIndex, targetIndex, dy, stride, startY }
  const dragRef = useRef(null)
  const rowRefs = useRef([])

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  // Подтянуть из облака (если меняли с другого устройства).
  useEffect(() => {
    let cancelled = false
    loadHomeLayoutFromCloud().then(cloud => {
      if (!cancelled && cloud) setLayout(cloud)
    })
    return () => { cancelled = true }
  }, [])

  const order = layout.order

  const persist = (next) => {
    const saved = saveHomeLayout(next)
    setLayout(saved)
  }

  const toggleVisible = (key) => {
    haptic.light()
    persist({ ...layout, hidden: { ...layout.hidden, [key]: !layout.hidden[key] } })
  }

  const moveItem = (from, to) => {
    const arr = [...order]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    persist({ ...layout, order: arr })
  }

  const handleDragStart = (e, idx) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const el = rowRefs.current[idx]
    const stride = (el?.offsetHeight || 60) + 10 // высота строки + gap списка
    const data = { startIndex: idx, targetIndex: idx, dy: 0, stride, startY: e.clientY }
    dragRef.current = data
    setDrag(data)
    haptic.medium()
  }

  const handleDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    let targetIndex = d.startIndex + Math.round(dy / d.stride)
    targetIndex = Math.max(0, Math.min(order.length - 1, targetIndex))
    if (targetIndex !== d.targetIndex) haptic.selection()
    const next = { ...d, dy, targetIndex }
    dragRef.current = next
    setDrag(next)
  }

  const handleDragEnd = (e) => {
    const d = dragRef.current
    if (!d) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (d.targetIndex !== d.startIndex) moveItem(d.startIndex, d.targetIndex)
    dragRef.current = null
    setDrag(null)
  }

  // Сдвиг строки при перетаскивании (соседи плавно расступаются) — как в конструкторе.
  const rowDragStyle = (idx) => {
    if (!drag) return { transition: 'transform 0.18s ease', zIndex: 1 }
    const { startIndex, targetIndex, dy, stride } = drag
    if (idx === startIndex) {
      return { transform: `translateY(${dy}px) scale(1.03)`, transition: 'none', zIndex: 20 }
    }
    let shift = 0
    if (targetIndex > startIndex && idx > startIndex && idx <= targetIndex) shift = -stride
    else if (targetIndex < startIndex && idx >= targetIndex && idx < startIndex) shift = stride
    return { transform: `translateY(${shift}px)`, transition: 'transform 0.18s ease', zIndex: 1 }
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <header style={styles.header}>
        <ScreenTitle>Отображение</ScreenTitle>
        <div style={styles.subtitle}>Что показывать на главной и в каком порядке</div>
      </header>

      {/* Закреплённые — всегда вверху, отключить нельзя */}
      <div style={styles.groupLabel}>ЗАКРЕПЛЕНО</div>
      <div style={styles.list}>
        {['Карточка профиля', 'Избранное'].map((t) => (
          <div key={t} style={{ ...styles.row, ...styles.rowLocked }}>
            <span style={styles.lockIcon}>🔒</span>
            <span style={styles.rowTitleLocked}>{t}</span>
            <span style={styles.alwaysTag}>всегда</span>
          </div>
        ))}
      </div>

      {/* Управляемые секции — тумблер + перетаскивание */}
      <div style={styles.groupLabel}>СЕКЦИИ</div>
      <div style={styles.list}>
        {order.map((key, idx) => {
          const isDragging = drag?.startIndex === idx
          const visible = !layout.hidden[key]
          return (
            <div
              key={key}
              ref={(el) => { rowRefs.current[idx] = el }}
              style={{ ...styles.row, ...(isDragging ? styles.rowDragging : {}), ...rowDragStyle(idx) }}
            >
              <div
                onPointerDown={(e) => handleDragStart(e, idx)}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                style={styles.dragHandle}
                aria-label="Перетащить"
              >
                <GripIcon />
              </div>

              <span style={styles.rowTitle}>{TITLES[key]}</span>

              <button
                onClick={() => toggleVisible(key)}
                style={{ ...styles.switch, ...(visible ? styles.switchOn : {}) }}
                aria-label={visible ? 'Скрыть' : 'Показать'}
                aria-pressed={visible}
              >
                <span style={{ ...styles.knob, ...(visible ? styles.knobOn : {}) }} />
              </button>
            </div>
          )
        })}
      </div>

      <div style={styles.hint}>
        Карточка профиля и избранное всегда наверху. Остальное можно скрыть и поменять
        местами — настройка сохранится на всех твоих устройствах.
      </div>
    </div>
  )
}

function GripIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
      <g fill="rgba(255,255,255,0.4)">
        <rect x="3" y="4"  width="12" height="2" />
        <rect x="3" y="8"  width="12" height="2" />
        <rect x="3" y="12" width="12" height="2" />
      </g>
    </svg>
  )
}

const styles = {
  page: {},
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '20px'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '26px',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    lineHeight: 1,
    margin: 0
  },
  subtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px',
    textAlign: 'center'
  },
  groupLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    margin: '20px 0 12px',
    paddingLeft: '4px'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 16px',
    minHeight: '60px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    position: 'relative'
  },
  rowDragging: { background: '#2A2A2A', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  rowLocked: { opacity: 0.55 },
  dragHandle: {
    width: '28px',
    flexShrink: 0,
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '-6px',
    touchAction: 'none',
    cursor: 'grab'
  },
  lockIcon: { fontSize: '15px', flexShrink: 0, opacity: 0.8 },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    letterSpacing: '1.5px',
    color: 'var(--color-text)'
  },
  rowTitleLocked: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    letterSpacing: '1.5px',
    color: 'var(--color-text-secondary)'
  },
  alwaysTag: {
    flexShrink: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '1px',
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase'
  },
  // Тумблер
  switch: {
    flexShrink: 0,
    width: '44px',
    height: '26px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.12)',
    border: 'none',
    padding: 0,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background 0.2s ease'
  },
  switchOn: { background: 'var(--color-primary)' },
  knob: {
    position: 'absolute',
    top: '3px',
    left: '3px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#FFFFFF',
    transition: 'transform 0.2s var(--ease-ios)'
  },
  knobOn: { transform: 'translateX(18px)' },
  hint: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    padding: '16px 6px 0'
  }
}
