import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
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
  const [nameFocused, setNameFocused] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)

  // Снимок исходного состояния — чтобы понять, были ли изменения.
  const initialSnapshot = useRef(null)

  const [catalog, setCatalog] = useState([])
  const exMap = useMemo(() => Object.fromEntries(catalog.map(e => [e.id, e])), [catalog])

  // Снимок при первом рендере: с чем пришли (для сравнения «были ли правки»).
  if (initialSnapshot.current === null) {
    initialSnapshot.current = JSON.stringify({ name: existing?.title || '', days })
  }

  const isDirty = () =>
    initialSnapshot.current !== JSON.stringify({ name, days })

  // Перетаскивание упражнений внутри дня: тащим за «ручку», соседи плавно
  // расступаются, перетаскиваемая карточка приподнимается. Порядок применяется
  // при отпускании.
  const [drag, setDrag] = useState(null) // { startIndex, targetIndex, dy, stride, startY }
  const dragRef = useRef(null)
  const rowRefs = useRef([])

  useEffect(() => {
    if (pickerOpen) {
      backButton.setHandler(() => setPickerOpen(false))
    } else {
      backButton.setHandler(() => {
        if (isDirty()) setConfirmExit(true)
        else navigate('/category/gym')
      })
    }
    lockVerticalSwipes()
    // isDirty читает name/days на момент тапа через замыкание эффекта —
    // поэтому держим name и days в зависимостях, чтобы handler был свежий.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, pickerOpen, name, days])

  useEffect(() => {
    let cancelled = false
    loadExerciseCatalog().then(list => { if (!cancelled) setCatalog(list) })
    return () => { cancelled = true }
  }, [])

  // Клавиатура открыта, если визуальный вьюпорт заметно ниже окна. Прячем док.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setKbOpen((window.innerHeight - vv.height) > 150)
    vv.addEventListener('resize', onResize)
    onResize()
    return () => vv.removeEventListener('resize', onResize)
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

  const handleToggle = (ex) => {
    setDays(prev => {
      const next = prev.map(d => [...d])
      const day = next[activeIdx]
      const i = day.indexOf(ex.id)
      if (i >= 0) day.splice(i, 1)                       // снять выбор
      else if (day.length < MAX_PER_DAY) day.push(ex.id) // добавить
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
      initialSnapshot.current = JSON.stringify({ name, days }) // зафиксировали как сохранённое
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
    const el = rowRefs.current[idx]
    const stride = (el?.offsetHeight || 72) + 10 // высота строки + gap списка (10px)
    const data = { startIndex: idx, targetIndex: idx, dy: 0, stride, startY: e.clientY }
    dragRef.current = data
    setDrag(data)
    haptic.medium()
  }

  const handleDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    const len = (days[activeIdx] || []).length
    let targetIndex = d.startIndex + Math.round(dy / d.stride)
    targetIndex = Math.max(0, Math.min(len - 1, targetIndex))
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

  // Сдвиг каждой строки во время перетаскивания (плавное расступание соседей).
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
    <div className="page page-enter" style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>{isEdit ? 'РЕДАКТИРОВАТЬ' : 'СВОЯ ПРОГРАММА'}</h1>
      </header>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={() => setNameFocused(true)}
        onBlur={() => setNameFocused(false)}
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
              className="press-tile"
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
            className="press-tile"
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

      {/* Список упражнений дня */}
      <div style={styles.dayList}>
        {currentDay.length === 0 && (
          <div style={styles.emptyDay}>Пусто. Добавь упражнения кнопкой ниже.</div>
        )}
        {currentDay.map((exId, idx) => {
          const ex = exMap[exId]
          const c = getMuscleGroupColors(ex?.muscle_group)
          const isDragging = drag?.startIndex === idx
          return (
            <div
              key={exId}
              ref={(el) => { rowRefs.current[idx] = el }}
              style={{ ...styles.exRow, ...(isDragging ? styles.exRowDragging : {}), ...rowDragStyle(idx) }}
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
                    {toTitleCase(MUSCLE_GROUP_LABELS[ex.muscle_group] || ex.muscle_group)}
                  </span>
                )}
              </div>
              <button onClick={() => handleRemove(exId)} className="press-tile" style={styles.removeBtn} aria-label="Удалить">✕</button>
            </div>
          )
        })}
      </div>

      {!nameFocused && !kbOpen && createPortal(
        <div style={styles.dock}>
          <button
            onClick={() => { if (atLimit) return; haptic.light(); setPickerOpen(true) }}
            disabled={atLimit}
            className="press-tile"
            style={{ ...styles.addButton, ...(atLimit ? styles.addButtonLimit : {}) }}
          >
            {atLimit ? (
              <>
                <span>Достигнут лимит {MAX_PER_DAY}/{MAX_PER_DAY}</span>
                <span style={styles.addButtonHint}>Удалите упражнение из списка, чтобы освободить место</span>
              </>
            ) : (
              `Добавить упражнения · ${currentDay.length}/${MAX_PER_DAY}`
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="press-tile"
            style={{
              ...styles.saveButton,
              ...(canSave ? styles.saveButtonReady : {}),
              opacity: canSave ? 1 : 0.35
            }}
          >
            {saving ? 'СОХРАНЯЮ…' : 'СОХРАНИТЬ ПРОГРАММУ'}
          </button>
        </div>,
        document.body
      )}

      {pickerOpen && (
        <ExercisePicker
          excludeIds={new Set(currentDay)}
          atLimit={atLimit}
          dayLetter={LETTERS[activeIdx]}
          count={currentDay.length}
          max={MAX_PER_DAY}
          onToggle={handleToggle}
          onDone={() => setPickerOpen(false)}
        />
      )}

      {confirmExit && createPortal(
        <div style={styles.exitOverlay} onClick={() => setConfirmExit(false)}>
          <div style={styles.exitModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.exitTitle}>Сохранить изменения?</div>
            <div style={styles.exitText}>В программе есть несохранённые изменения.</div>

            <button
              className="press-tile"
              style={styles.exitSave}
              onClick={async () => {
                if (!canSave) {
                  // Нечего/нельзя сохранить (пустой день) — подсказываем, не выходим.
                  haptic.error()
                  window.alert('В каждом дне должно быть хотя бы одно упражнение.')
                  return
                }
                setConfirmExit(false)
                await handleSave()
              }}
            >
              Сохранить
            </button>
            <button
              className="press-tile"
              style={styles.exitDiscard}
              onClick={() => { setConfirmExit(false); haptic.light(); navigate('/category/gym') }}
            >
              Не сохранять
            </button>
            <button
              className="press-tile"
              style={styles.exitCancel}
              onClick={() => setConfirmExit(false)}
            >
              Отмена
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
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
  page: { padding: '0 16px 220px', paddingTop: 'var(--tg-safe-top)', minHeight: '100dvh' },
  dock: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    padding: '14px 16px calc(16px + env(safe-area-inset-bottom))',
    background: 'var(--color-bg)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', gap: '12px',
    pointerEvents: 'auto',
    zIndex: 40
  },
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
    width: '100%', padding: '18px',
    border: '1.5px dashed rgba(255,255,255,0.15)', borderRadius: 'var(--radius-card)',
    background: 'transparent', color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, letterSpacing: '1px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px'
  },
  addButtonLimit: {
    border: '1.5px dashed rgba(232,69,69,0.4)',
    color: '#E84545'
  },
  addButtonHint: {
    fontSize: '11px', fontWeight: 500, letterSpacing: '0.2px',
    color: 'var(--color-text-secondary)', textTransform: 'none'
  },
  saveButton: {
    width: '100%', padding: '18px',
    background: 'var(--color-card)', color: 'var(--color-text)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 800, letterSpacing: '1.5px'
  },
  saveButtonReady: { background: 'var(--color-primary)', color: '#0D0C0C', border: '1px solid var(--color-primary)' },
  exitOverlay: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(13,12,12,0.75)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top) + 30px) 20px 20px'
  },
  exitModal: {
    width: '100%', maxWidth: '360px',
    background: 'rgba(34,34,34,0.98)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '33px',
    padding: '24px 18px 16px',
    display: 'flex', flexDirection: 'column', gap: '10px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)'
  },
  exitTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 800,
    color: 'var(--color-text)', textAlign: 'center'
  },
  exitText: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '8px'
  },
  exitSave: {
    width: '100%', padding: '16px', border: 'none', borderRadius: '16px',
    background: 'var(--color-primary)', color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px'
  },
  exitDiscard: {
    width: '100%', padding: '16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
    background: 'rgba(255,255,255,0.04)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700
  },
  exitCancel: {
    width: '100%', padding: '12px', border: 'none', borderRadius: '12px',
    background: 'transparent', color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600
  }
}