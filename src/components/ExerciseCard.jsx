import { useState, useEffect, useRef } from 'react'
import { saveExerciseWeight } from '../features/exercises/api'
import { SUB_GROUP_LABELS } from '../features/programs/labels'
import { haptic } from '../lib/telegram'
import {
  markWeightEditingStarted,
  markWeightEditingEnded,
  shouldIgnoreCardTap
} from '../lib/weight-editing-state'

/**
 * Карточка упражнения.
 *
 * iOS-FRIENDLY ВВОД ВЕСА:
 * Инпут всегда отрендерен и кликабелен (но прозрачный), визуальное число
 * лежит поверх с pointerEvents:none — клик проваливается на инпут, iOS открывает
 * клавиатуру естественным образом.
 *
 * ГЛОБАЛЬНАЯ ЗАЩИТА ОТ ЛОЖНОЙ АКТИВАЦИИ:
 * Когда любая карточка редактирует вес, ВСЕ карточки игнорируют тапы
 * (через shouldIgnoreCardTap из weight-editing-state). Раньше защита была
 * локальной — соседняя карточка ничего не знала о клавиатуре в чужой карточке
 * и активировалась по случайному тапу.
 *
 * Теперь:
 *  - onFocus инпута → markWeightEditingStarted() → ВСЕ карточки в режиме "игнор"
 *  - onBlur инпута → markWeightEditingEnded() → ещё 300мс игнора, потом норма
 *  - handleCardClick проверяет shouldIgnoreCardTap() → гасит тап если надо
 *
 * Поведение для юзера: открыл клавиатуру для веса → тап по ЛЮБОЙ карточке
 * (своей или соседней) просто закрывает клавиатуру, никаких активаций.
 */
export default function ExerciseCard({ slot, isActive = false, onTap, onLongPress }) {
  const {
    exercise_id,
    exercise_name,
    sub_group,
    meta_info,
    preview_url,
    user_weight_kg
  } = slot

  const [showDoneToast, setShowDoneToast] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('0')
  const [localWeight, setLocalWeight] = useState(
    user_weight_kg !== null && user_weight_kg !== undefined ? user_weight_kg : 0
  )
  const inputRef = useRef(null)

  // Только ЛОКАЛЬНЫЙ флаг — для проверок внутри карточки (например, не запускать
  // long-press пока юзер сам в моей клавиатуре). Защита тапов по соседним
  // карточкам — через глобальный shouldIgnoreCardTap.
  const editingRef = useRef(false)

  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const LONG_PRESS_MS = 500
  const MOVE_THRESHOLD_PX = 10

  const subGroupLabel = SUB_GROUP_LABELS[sub_group] || (sub_group || '').toUpperCase()

  useEffect(() => {
    setLocalWeight(
      user_weight_kg !== null && user_weight_kg !== undefined ? user_weight_kg : 0
    )
  }, [user_weight_kg])

  useEffect(() => {
    if (isActive) {
      setShowDoneToast(true)
      const timer = setTimeout(() => setShowDoneToast(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  const handleCardPointerDown = (e) => {
    // Если у меня самого открыта клавиатура — не запускаем long-press,
    // это всё равно "клавиатурный" тап.
    if (editingRef.current) return

    // Если где-то ещё открыта клавиатура — тоже не запускаем long-press,
    // юзер просто хочет закрыть её тапом мимо.
    if (shouldIgnoreCardTap()) return

    longPressFired.current = false
    pointerStartPos.current = { x: e.clientX, y: e.clientY }

    if (longPressTimer.current) clearTimeout(longPressTimer.current)

    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      haptic.medium()
      if (onLongPress) onLongPress(slot)
    }, LONG_PRESS_MS)
  }

  const handleCardPointerMove = (e) => {
    if (!longPressTimer.current) return
    const dx = Math.abs(e.clientX - pointerStartPos.current.x)
    const dy = Math.abs(e.clientY - pointerStartPos.current.y)
    if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleCardPointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleCardClick = () => {
    // ГЛОБАЛЬНАЯ проверка — клавиатура где-то открыта или только что закрылась?
    // Если да — гасим тап. Это работает для ВСЕХ карточек, не только для той
    // у которой редактировался вес.
    if (shouldIgnoreCardTap()) return
    if (editingRef.current) return

    if (longPressFired.current) {
      longPressFired.current = false
      return
    }

    if (onTap) onTap(slot)
  }

  const handleInputFocus = () => {
    editingRef.current = true
    setEditing(true)
    setDraft(String(localWeight))

    // Глобально объявляем: я редактирую вес, все остальные карточки —
    // игнорите тапы.
    markWeightEditingStarted()

    setTimeout(() => {
      try {
        inputRef.current?.select()
      } catch (e) { /* ignore */ }
    }, 10)
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
    editingRef.current = false
    setEditing(false)

    // Глобально: редактирование закончилось. Внутри функции взводится таймстамп,
    // и в течение 300мс ВСЕ карточки продолжают игнорировать тапы (защита от
    // фантомного click который iOS присылает после blur).
    markWeightEditingEnded()

    const trimmed = draft.trim()

    if (trimmed === '') {
      if (localWeight !== 0) {
        setLocalWeight(0)
        try {
          await saveExerciseWeight(exercise_id, 0)
        } catch (e) {
          console.error('[ExerciseCard] saveExerciseWeight error:', e)
        }
      }
      return
    }

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

  const handleWeightPointerDown = (e) => {
    e.stopPropagation()
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <div
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={handleCardPointerUp}
      onPointerCancel={handleCardPointerUp}
      onPointerLeave={handleCardPointerUp}
      className="press-exercise-card"
      style={{
        ...styles.card,
        background: isActive ? '#222222' : '#1C1C1C',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      <div style={styles.preview}>
        {preview_url ? (
          <img src={preview_url} alt="" style={styles.previewImg} draggable={false} />
        ) : (
          <div style={styles.previewPlaceholder}>💪</div>
        )}
      </div>

      <div style={styles.content}>
        {subGroupLabel && (
          <div style={styles.subGroupLabel}>{subGroupLabel}</div>
        )}

        <div style={styles.exerciseName}>
          {exercise_name}
        </div>

        {meta_info && (
          <div style={styles.meta}>{meta_info}</div>
        )}
      </div>

      <div
        style={styles.weightBlock}
        onPointerDown={handleWeightPointerDown}
      >
        <div style={styles.weightInputWrap}>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            pattern="[0-9]*"
            value={editing ? draft : String(localWeight)}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              ...styles.weightInput,
              opacity: editing ? 1 : 0
            }}
          />
          {!editing && (
            <div style={styles.weightValue}>
              {localWeight}
            </div>
          )}
        </div>
        <div style={styles.weightUnit}>KG</div>
      </div>

      <div
        style={{
          ...styles.activeOverlay,
          opacity: isActive ? 1 : 0,
          pointerEvents: 'none'
        }}
      />

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
    transition: 'background 0.3s ease',
    overflow: 'hidden'
  },
  preview: {
    flexShrink: 0,
    width: '118px',
    height: '118px',
    borderRadius: '33px',
    overflow: 'hidden',
    background: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
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
  content: {
    flex: 1,
    minWidth: 0,
    height: '118px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '7px'
  },
  subGroupLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 800,
    lineHeight: '14px',
    letterSpacing: '0.2em',
    color: '#888888',
    textTransform: 'uppercase'
  },
  exerciseName: {
    fontFamily: 'var(--font-geist)',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: '18px',
    color: '#F0F0F0'
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '14px',
    letterSpacing: '0.05em',
    color: '#888888'
  },
  weightBlock: {
    flexShrink: 0,
    width: '38px',
    height: '118px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: '0px',
    padding: '6px',
    margin: '-6px',
    borderRadius: '8px',
    position: 'relative',
    zIndex: 5
  },
  weightInputWrap: {
    position: 'relative',
    width: '38px',
    height: '27px'
  },
  weightInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '38px',
    height: '27px',
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
    caretColor: '#9ED153',
    transition: 'opacity 0.12s ease',
    WebkitAppearance: 'none',
    appearance: 'none',
    borderRadius: 0
  },
  weightValue: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '38px',
    height: '27px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 800,
    lineHeight: '27px',
    textAlign: 'center',
    color: '#9ED153',
    pointerEvents: 'none'
  },
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
  activeOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'grayscale(1) blur(1.9px)',
    WebkitBackdropFilter: 'grayscale(1) blur(1.9px)',
    borderRadius: '33px',
    transition: 'opacity 0.35s ease',
    zIndex: 6
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