import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic, confirm } from '../lib/telegram'
import { getProgramBySlug } from '../features/programs/registry'
import { loadExerciseCatalog, saveMyProgram } from '../features/programs/customProgram'
import { MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import ExercisePicker from '../components/ExercisePicker'

const LETTERS = ['A', 'B', 'C']
const MAX_PER_DAY = 10

/**
 * Конструктор своей программы.
 *
 * Если у пользователя уже есть своя программа (slug 'my') — открывается в режиме
 * редактирования с предзаполнением. Иначе — создание новой.
 *
 * Порядок упражнений в дне = порядок добавления (перетаскивание добавим позже).
 */
export default function ProgramConstructor() {
  const navigate = useNavigate()

  const existing = useMemo(() => getProgramBySlug('my'), [])
  const isEdit = !!existing

  const [name, setName] = useState(existing?.title || '')
  const [dayCount, setDayCount] = useState(() => {
    const n = existing ? Object.keys(existing.data.days || {}).length : 1
    return Math.min(3, Math.max(1, n || 1))
  })
  // days: массив дней, каждый — массив exercise_id в порядке.
  const [days, setDays] = useState(() => {
    if (existing) {
      return LETTERS.slice(0, dayCount).map(letter => {
        const slots = existing.data.days?.[letter] || []
        return [...slots].sort((a, b) => a.order_num - b.order_num).map(s => s.default_exercise_id)
      })
    }
    return [[]]
  })
  const [activeIdx, setActiveIdx] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [catalog, setCatalog] = useState([])
  const exMap = useMemo(() => Object.fromEntries(catalog.map(e => [e.id, e])), [catalog])

  // Перетаскивание упражнений внутри дня (нативно, по «ручке»).
  const [draggingIdx, setDraggingIdx] = useState(null)
  const dragIndexRef = useRef(null)
  const rowRefs = useRef([])

  useEffect(() => {
    backButton.setHandler(() => navigate('/category/gym'))
    lockVerticalSwipes()
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    loadExerciseCatalog().then(list => { if (!cancelled) setCatalog(list) })
    return () => { cancelled = true }
  }, [])

  const changeDayCount = (n) => {
    if (n === dayCount) return
    haptic.light()
    setDays(prev => {
      const next = [...prev]
      if (n > prev.length) { while (next.length < n) next.push([]) }
      else { next.length = n }
      return next
    })
    setDayCount(n)
    setActiveIdx(i => Math.min(i, n - 1))
  }

  const handleAdd = (ex) => {
    setDays(prev => {
      const next = prev.map(d => [...d])
      const day = next[activeIdx]
      if (day.length >= MAX_PER_DAY || day.includes(ex.id)) return prev
      day.push(ex.id)
      return next
    })
  }

  const handleRemove = (exId) => {
    haptic.light()
    setDays(prev => {
      const next = prev.map(d => [...d])
      next[activeIdx] = next[activeIdx].filter(id => id !== exId)
      return next
    })
  }

  const canSave = days.length >= 1 && days.every(d => d.length >= 1) && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    haptic.medium()
    try {
      const payload = days.map(d => ({ exercises: d }))
      await saveMyProgram(name.trim(), payload)
      haptic.success()
      navigate('/category/gym')
    } catch (e) {
      console.error('[constructor] save error:', e)
      haptic.error()
      setSaving(false)
      window.alert('Не удалось сохранить. Проверь интернет и попробуй ещё раз.')
    }
  }

  const currentDay = days[activeIdx] || []
  const atLimit = currentDay.length >= MAX_PER_DAY

  const moveItem = (from, to) => {
    setDays(prev => {
      const next = prev.map(d => [...d])
      const arr = next[activeIdx]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return next
    })
  }

  const handleDragStart = (e, idx) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    dragIndexRef.current = idx
    setDraggingIdx(idx)
    haptic.medium()
  }

  const handleDragMove = (e) => {
    if (dragIndexRef.current === null) return
    const y = e.clientY
    let target = dragIndexRef.current
    for (let i = 0; i < currentDay.length; i++) {
      const el = rowRefs.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) { target = i; break }
      target = i
    }
    if (target !== dragIndexRef.current) {
      moveItem(dragIndexRef.current, target)
      dragIndexRef.current = target
      setDraggingIdx(target)
      haptic.selection()
    }
  }

  const handleDragEnd = (e) => {
    if (dragIndexRef.current === null) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    dragIndexRef.current = null
    setDraggingIdx(null)
  }

  return (
    <div className="page page-enter" style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>{isEdit ? 'РЕДАКТИРОВАТЬ' : 'СВОЯ ПРОГРАММА'}</h1>
      </header>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название программы"
        maxLength={40}
        style={styles.nameInput}
      />

      {/* Количество дней */}
      <div style={styles.section}>
        <div style={styles.label}>ДНЕЙ В ПРОГРАММЕ</div>
        <div style={styles.segments}>
          {[1, 2, 3].map(n => (
            <button
              key={n}
              onClick={() => changeDayCount(n)}
              style={{
                ...styles.segment,
                background: dayCount === n ? 'var(--color-primary)' : 'var(--color-card)',
                color: dayCount === n ? '#0D0C0C' : 'var(--color-text-secondary)'
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Вкладки дней */}
      <div style={styles.dayTabs}>
        {LETTERS.slice(0, dayCount).map((letter, idx) => (
          <button
            key={letter}
            onClick={() => { haptic.light(); setActiveIdx(idx) }}
            style={{
              ...styles.dayTab,
              color: activeIdx === idx ? 'var(--color-primary)' : 'rgba(255,255,255,0.35)',
              borderColor: activeIdx === idx ? 'var(--color-primary)' : 'transparent'
            }}
          >
            {letter}
            <span style={styles.dayTabCount}>{days[idx]?.length || 0}</span>
          </button>
        ))}
      </div>

      <div style={styles.counter}>{currentDay.length} / {MAX_PER_DAY}</div>

      {/* Список упражнений дня */}
      <div style={styles.dayList}>
        {currentDay.length === 0 && (
          <div style={styles.emptyDay}>Пусто. Добавь упражнения кнопкой ниже.</div>
        )}
        {currentDay.map((exId, idx) => {
          const ex = exMap[exId]
          const c = getMuscleGroupColors(ex?.muscle_group)
          const isDragging = draggingIdx === idx
          return (
            <div
              key={exId}
              ref={(el) => { rowRefs.current[idx] = el }}
              style={{ ...styles.exRow, ...(isDragging ? styles.exRowDragging : {}) }}
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
              <div style={styles.exPreview}>
                {ex?.preview_url
                  ? <img src={ex.preview_url} alt="" style={styles.exPreviewImg} draggable={false} />
                  : <div style={styles.exPreviewPlaceholder}>💪</div>}
              </div>
              <div style={styles.exContent}>
                <div style={styles.exName}>{ex?.name || exId}</div>
                {ex && (
                  <span style={{ ...styles.exTag, background: c.tag, color: '#fff' }}>
                    {MUSCLE_GROUP_LABELS[ex.muscle_group] || ex.muscle_group}
                  </span>
                )}
              </div>
              <button onClick={() => handleRemove(exId)} style={styles.removeBtn} aria-label="Удалить">✕</button>
            </div>
          )
        })}
      </div>

      <button
        onClick={() => { haptic.light(); setPickerOpen(true) }}
        disabled={atLimit}
        style={{ ...styles.addButton, opacity: atLimit ? 0.4 : 1 }}
      >
        + ДОБАВИТЬ УПРАЖНЕНИЕ
      </button>

      <button
        onClick={handleSave}
        disabled={!canSave}
        style={{
          ...styles.saveButton,
          ...(canSave ? styles.saveButtonReady : {}),
          opacity: canSave ? 1 : 0.35
        }}
      >
        {saving ? 'СОХРАНЯЮ…' : 'СОХРАНИТЬ ПРОГРАММУ'}
      </button>

      {pickerOpen && (
        <ExercisePicker
          excludeIds={new Set(currentDay)}
          atLimit={atLimit}
          onAdd={handleAdd}
          onClose={() => setPickerOpen(false)}
        />
      )}
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
  page: { padding: '0 16px 40px', paddingTop: 'var(--tg-safe-top)', minHeight: '100dvh' },
  header: { textAlign: 'center', margin: '8px 0 20px' },
  title: { fontFamily: 'var(--font-tiny5)', fontSize: '28px', letterSpacing: '2px', color: 'var(--color-primary)' },
  nameInput: {
    width: '100%', height: '52px', padding: '0 18px', marginBottom: '20px',
    background: 'var(--color-card)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 'var(--radius-card)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, outline: 'none'
  },
  section: { marginBottom: '20px' },
  label: { fontFamily: 'var(--font-tiny5)', fontSize: '12px', color: 'var(--color-text-secondary)', letterSpacing: '1.5px', marginBottom: '10px' },
  segments: { display: 'flex', gap: '10px' },
  segment: { flex: 1, height: '52px', border: 'none', borderRadius: '16px', fontFamily: 'var(--font-tiny5)', fontSize: '20px' },
  dayTabs: { display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '8px' },
  dayTab: {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
    padding: '6px 4px', fontFamily: 'var(--font-tiny5)', fontSize: '28px'
  },
  dayTabCount: { fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 700, opacity: 0.7 },
  counter: { textAlign: 'center', fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' },
  dayList: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' },
  emptyDay: { textAlign: 'center', padding: '30px 20px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' },
  exRow: { display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-card)', borderRadius: '20px', padding: '10px' },
  exRowDragging: { background: '#2A2A2A', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', position: 'relative', zIndex: 5 },
  dragHandle: { width: '30px', height: '52px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: 'grab' },
  exPreview: { width: '52px', height: '52px', flexShrink: 0, borderRadius: '14px', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  exPreviewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  exPreviewPlaceholder: { fontSize: '22px', opacity: 0.4 },
  exContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  exName: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  exTag: { alignSelf: 'flex-start', padding: '2px 8px', borderRadius: '999px', fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 700 },
  removeBtn: { width: '36px', height: '36px', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '12px', color: 'var(--color-text-secondary)', fontSize: '14px' },
  addButton: {
    width: '100%', padding: '18px', marginBottom: '12px',
    border: '1.5px dashed rgba(255,255,255,0.15)', borderRadius: 'var(--radius-card)',
    background: 'transparent', color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, letterSpacing: '1px'
  },
  saveButton: {
    width: '100%', padding: '18px',
    background: 'var(--color-card)', color: 'var(--color-text)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 800, letterSpacing: '1.5px'
  },
  saveButtonReady: { background: 'var(--color-primary)', color: '#0D0C0C', border: '1px solid var(--color-primary)' }
}