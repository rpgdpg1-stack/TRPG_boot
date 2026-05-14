import { useState, useEffect, useRef } from 'react'
import { saveExerciseWeight } from '../features/exercises/api'
import { SUB_GROUP_LABELS } from '../features/programs/labels'
import { haptic } from '../lib/telegram'

/**
 * Карточка упражнения — новый дизайн по референсу Figma.
 *
 * Структура (слева направо):
 *   [Превью 118×118] [Подгруппа / Название / Подходы] [Вес 100 / KG]
 *
 * Размеры внутренностей фиксированные (точно как в макете).
 * Ширина самой карточки — 100% контейнера (адаптивная под экран).
 *
 * Состояния:
 *  - default — обычный вид
 *  - selected (isActive=true) — карточка приглушена + превью в монохроме
 *
 * Жесты:
 *  - Тап → onTap (родитель активирует/деактивирует)
 *  - Тап по полю веса → нативная цифровая клавиатура, автосохранение
 *  - Long-press 500мс → onLongPress (меню Инфо/Сменить)
 *
 * Тост "✅ Готово, молодец!" появляется при первой активации.
 */
export default function ExerciseCard({ slot, isActive = false, onTap, onLongPress }) {
  const {
    exercise_id,
    exercise_name,
    sub_group,
    meta_info,
    preview_url,
    is_swapped,
    user_weight_kg
  } = slot

  const [showDoneToast, setShowDoneToast] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [localWeight, setLocalWeight] = useState(user_weight_kg)
  const inputRef = useRef(null)

  // Long-press
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const LONG_PRESS_MS = 500
  const MOVE_THRESHOLD_PX = 10

  // Подгруппа в виде человекочитаемого подзаголовка ("ШИРИНА" вместо "lats")
  const subGroupLabel = SUB_GROUP_LABELS[sub_group] || (sub_group || '').toUpperCase()

  useEffect(() => {
    setLocalWeight(user_weight_kg)
  }, [user_weight_kg])

  useEffect(() => {
    if (isActive) {
      setShowDoneToast(true)
      const timer = setTimeout(() => setShowDoneToast(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  useEffect(() => {
    if (editing && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [editing])

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  const handlePointerDown = (e) => {
    if (editing) return
    longPressFired.current = false
    pointerStartPos.current = { x: e.clientX, y: e.clientY }

    if (longPressTimer.current) clearTimeout(longPressTimer.current)

    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      haptic.medium()
      if (onLongPress) onLongPress(slot)
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e) => {
    if (!longPressTimer.current) return
    const dx = Math.abs(e.clientX - pointerStartPos.current.x)
    const dy = Math.abs(e.clientY - pointerStartPos.current.y)
    if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleClick = () => {
    if (editing) return
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (onTap) onTap(slot)
  }

  const handleWeightTap = (e) => {
    e.stopPropagation()
    if (!exercise_id) return
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setDraft(localWeight !== null && localWeight !== undefined ? String(localWeight) : '')
    setEditing(true)
  }

  const handleWeightPointerDown = (e) => {
    e.stopPropagation()
  }

  const handleInputChange = (e) => {
    let v = e.target.value
    v = v.replace(/,/g, '.')
    v = v.replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (v.length > 5) v = v.slice(0, 5)
    setDraft(v)
  }

  const handleInputBlur = async () => {
    setEditing(false)

    const trimmed = draft.trim()
    if (trimmed === '') return

    const num = parseFloat(trimmed)
    if (isNaN(num) || num < 0) return

    const clamped = Math.max(0, Math.min(500, num))
    const rounded = Math.round(clamped * 2) / 2

    if (rounded === localWeight) return

    setLocalWeight(rounded)

    try {
      const ok = await saveExerciseWeight(exercise_id, rounded)
      if (!ok) console.warn('[ExerciseCard] saveExerciseWeight returned false')
    } catch (e) {
      console.error('[ExerciseCard] saveExerciseWeight error:', e)
    }
  }

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur()
    }
  }

  const displayWeight = localWeight !== null && localWeight !== undefined ? localWeight : null

  return (
    <div
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        ...styles.card,
        // selected — карточка темнее и приглушённая
        background: isActive ? '#222222' : '#1C1C1C',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* === ПРЕВЬЮ === */}
      <div style={{
        ...styles.preview,
        // В состоянии selected — превью в монохроме (как в макете)
        filter: isActive ? 'grayscale(1)' : 'none',
        opacity: isActive ? 0.7 : 1
      }}>
        {preview_url ? (
          <img src={preview_url} alt="" style={styles.previewImg} draggable={false} />
        ) : (
          <div style={styles.previewPlaceholder}>💪</div>
        )}
      </div>

      {/* === ТЕКСТ === */}
      <div style={{
        ...styles.content,
        opacity: isActive ? 0.5 : 1,
        transition: 'opacity 0.3s ease'
      }}>
        {/* Подгруппа — например "ШИРИНА" */}
        {subGroupLabel && (
          <div style={styles.subGroupLabel}>{subGroupLabel}</div>
        )}

        {/* Название упражнения */}
        <div style={styles.exerciseName}>
          {exercise_name}
          {is_swapped && <span style={styles.swappedBadge}>заменено</span>}
        </div>

        {/* Подходы — например "3×8-10" */}
        {meta_info && (
          <div style={styles.meta}>{meta_info}</div>
        )}
      </div>

      {/* === ВЕС === */}
      <div
        style={{
          ...styles.weightBlock,
          opacity: isActive ? 0.5 : 1,
          transition: 'opacity 0.3s ease'
        }}
        onClick={handleWeightTap}
        onPointerDown={handleWeightPointerDown}
      >
        {editing ? (
          <div style={styles.weightInputWrap}>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              pattern="[0-9]*"
              value={draft}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => e.stopPropagation()}
              placeholder="—"
              style={styles.weightInput}
            />
          </div>
        ) : (
          <div style={styles.weightValue}>
            {displayWeight !== null ? displayWeight : '—'}
          </div>
        )}
        <div style={styles.weightUnit}>KG</div>
      </div>

      {/* === ТОСТ "ГОТОВО, МОЛОДЕЦ" === */}
      {showDoneToast && (
        <div style={styles.doneToast}>
          ✅ Готово, молодец!
        </div>
      )}

      <style>{`
        @keyframes doneToastFade {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          75%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  // Размеры по Figma: 398×150, но ширина 100% для адаптивности
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '16px',
    gap: '16px',
    width: '100%',
    minHeight: '150px',
    borderRadius: '33px',
    cursor: 'pointer',
    transition: 'background 0.3s ease'
  },
  // Превью — точно по Figma 118×118 с радиусом 33
  preview: {
    flexShrink: 0,
    width: '118px',
    height: '118px',
    borderRadius: '33px',
    overflow: 'hidden',
    background: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'filter 0.3s ease, opacity 0.3s ease'
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  previewPlaceholder: {
    fontSize: '40px',
    opacity: 0.4
  },
  // Текстовый блок — flex-grow для занятия всего свободного места
  content: {
    flex: 1,
    minWidth: 0,
    height: '118px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '7px'
  },
  // Manrope 800 / 10px / letter-spacing 0.2em
  subGroupLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 800,
    lineHeight: '14px',
    letterSpacing: '0.2em',
    color: '#888888',
    textTransform: 'uppercase'
  },
  // Geist 600 / 14px / line 18
  exerciseName: {
    fontFamily: 'var(--font-geist)',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: '18px',
    color: '#F0F0F0',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px'
  },
  swappedBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '9px',
    fontWeight: 'normal',
    color: 'var(--color-primary)',
    background: 'rgba(158, 209, 83, 0.12)',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px'
  },
  // Manrope 600 / 10px / letter-spacing 0.05em
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '14px',
    letterSpacing: '0.05em',
    color: '#888888'
  },
  // Блок веса — выровнен по центру вертикально, текст вправо
  weightBlock: {
    flexShrink: 0,
    width: '38px',
    height: '118px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: '0px',
    padding: '4px',
    margin: '-4px',
    borderRadius: '8px',
    transition: 'opacity 0.3s ease'
  },
  // Manrope 800 / 20px / зелёный
  weightValue: {
    width: '38px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 800,
    lineHeight: '27px',
    textAlign: 'center',
    color: '#9ED153'
  },
  // KG — Manrope 800 / 9px / серый
  weightUnit: {
    width: '38px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    fontWeight: 800,
    lineHeight: '12px',
    letterSpacing: '0.05em',
    textAlign: 'center',
    color: '#888888'
  },
  weightInputWrap: {
    width: '38px',
    display: 'flex',
    justifyContent: 'flex-end'
  },
  weightInput: {
    width: '38px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 800,
    lineHeight: '27px',
    color: '#9ED153',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    textAlign: 'center',
    padding: 0,
    margin: 0,
    caretColor: '#9ED153'
  },
  doneToast: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(158, 209, 83, 0.3)',
    borderRadius: '14px',
    padding: '8px 14px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    animation: 'doneToastFade 1.5s ease-out forwards',
    zIndex: 10,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(158, 209, 83, 0.15)'
  }
}