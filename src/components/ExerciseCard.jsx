import { useState, useEffect, useRef } from 'react'
import { saveExerciseWeight } from '../features/exercises/api'
import { SUB_GROUP_LABELS } from '../features/programs/labels'
import { haptic } from '../lib/telegram'

/**
 * Карточка упражнения.
 *
 * РЕШЕНИЕ ПРОБЛЕМЫ С iOS И КЛАВИАТУРОЙ:
 *
 * На iOS Safari/WebView клавиатура показывается ТОЛЬКО когда .focus() вызван
 * синхронно внутри обработчика прямого пользовательского жеста (click/touchend).
 *
 * Если делать setEditing(true) → React ре-рендерит → useEffect → focus(),
 * iOS считает это программным фокусом и не открывает клавиатуру — только
 * выделяет текст в инпуте. Юзеру приходится тапать второй раз.
 *
 * Чтобы это исправить — инпут ВСЕГДА в DOM, visibility/opacity переключаются
 * чисто визуально. Тогда мы можем вызвать input.focus() прямо в обработчике
 * клика, и iOS открывает клавиатуру с первого раза.
 *
 * РЕШЕНИЕ ПРОБЛЕМЫ С ТАПОМ ПО КАРТОЧКЕ ПОСЛЕ РЕДАКТИРОВАНИЯ:
 *
 * При тапе по карточке во время редактирования веса:
 *   1. iOS закрывает клавиатуру → onBlur инпута срабатывает → editing=false
 *   2. ПОТОМ срабатывает onClick карточки — но editing уже false
 *      → карточка ошибочно отжимается.
 *
 * Решение: используем ref-флаг `justClosedKeyboard` который ставится в onBlur
 * и держится 300мс. handleCardClick проверяет этот флаг через ref (синхронно!)
 * и игнорирует клик. После 300мс флаг сбрасывается.
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
  const [draft, setDraft] = useState('0')
  const [localWeight, setLocalWeight] = useState(
    user_weight_kg !== null && user_weight_kg !== undefined ? user_weight_kg : 0
  )
  const inputRef = useRef(null)

  // === REF-флаги для синхронной проверки в обработчиках клика ===
  // Стандартный editing-стейт асинхронный, поэтому в onClick карточки он
  // может показать неактуальное значение. Эти refs обновляются СРАЗУ.
  const editingRef = useRef(false)
  const justClosedKeyboardRef = useRef(false)

  // Long-press
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

  // === ЖЕСТЫ ПО КАРТОЧКЕ ===
  const handleCardPointerDown = (e) => {
    if (editingRef.current) return

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
    // Главные защиты — через REF, не через state.
    // К моменту onClick state уже мог обновиться (editing=false после blur),
    // но эти флаги обновляются СИНХРОННО → актуальные.

    // Если только что закрыли клавиатуру (последние 300мс) — игнорируем тап,
    // он был на закрытие, а не на активацию упражнения.
    if (justClosedKeyboardRef.current) return

    if (editingRef.current) return

    if (longPressFired.current) {
      longPressFired.current = false
      return
    }

    if (onTap) onTap(slot)
  }

  // === ТАП ПО ВЕСУ ===
  // Используем onClick (не pointerDown) — это критично для iOS:
  // input.focus() вызванный синхронно из onClick считается жестом
  // и открывает клавиатуру с первого раза.
  const handleWeightClick = (e) => {
    e.stopPropagation()
    if (!exercise_id) return

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }

    if (editingRef.current) return // уже редактируем

    // 1. Обновляем ref СИНХРОННО (до setState)
    editingRef.current = true

    // 2. Готовим черновик
    setDraft(String(localWeight))

    // 3. Меняем state (визуал переключится на следующем рендере)
    setEditing(true)

    // 4. Фокусим инпут СИНХРОННО — он уже в DOM (всегда там) — iOS примет
    //    это как жест и откроет клавиатуру с первого раза
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }

  // На pointerDown веса — только защита от родительского long-press.
  // Сам тап обрабатывается в onClick (см. выше).
  const handleWeightPointerDown = (e) => {
    e.stopPropagation()
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
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
    // Снимаем editing
    editingRef.current = false
    setEditing(false)

    // Ставим флаг "только что закрыли клавиатуру" на 300мс —
    // защищает от ложного тапа по карточке, который iOS сейчас сгенерит
    justClosedKeyboardRef.current = true
    setTimeout(() => {
      justClosedKeyboardRef.current = false
    }, 300)

    // Парсим и сохраняем значение
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

  return (
    <div
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={handleCardPointerUp}
      onPointerCancel={handleCardPointerUp}
      onPointerLeave={handleCardPointerUp}
      style={{
        ...styles.card,
        background: isActive ? '#222222' : '#1C1C1C',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* ПРЕВЬЮ */}
      <div style={styles.preview}>
        {preview_url ? (
          <img src={preview_url} alt="" style={styles.previewImg} draggable={false} />
        ) : (
          <div style={styles.previewPlaceholder}>💪</div>
        )}
      </div>

      {/* ТЕКСТ */}
      <div style={styles.content}>
        {subGroupLabel && (
          <div style={styles.subGroupLabel}>{subGroupLabel}</div>
        )}

        <div style={styles.exerciseName}>
          {exercise_name}
          {is_swapped && <span style={styles.swappedBadge}>заменено</span>}
        </div>

        {meta_info && (
          <div style={styles.meta}>{meta_info}</div>
        )}
      </div>

      {/* ВЕС — инпут ВСЕГДА в DOM, переключаем visibility */}
      <div
        style={styles.weightBlock}
        onClick={handleWeightClick}
        onPointerDown={handleWeightPointerDown}
      >
        <div style={styles.weightInputWrap}>
          {/*
            Инпут всегда отрендерен. Когда editing=false — он скрыт абсолютно
            под визуальным числом, не получает кликов (pointerEvents:none).
            Когда editing=true — становится видимым, число справа скрывается.
          */}
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            pattern="[0-9]*"
            value={editing ? draft : String(localWeight)}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            readOnly={!editing}
            tabIndex={editing ? 0 : -1}
            style={{
              ...styles.weightInput,
              opacity: editing ? 1 : 0,
              pointerEvents: editing ? 'auto' : 'none'
            }}
          />
          {/* Визуальное число поверх инпута, когда не редактируем */}
          {!editing && (
            <div style={styles.weightValue}>
              {localWeight}
            </div>
          )}
        </div>
        <div style={styles.weightUnit}>KG</div>
      </div>

      {/* Эффект "выполнено": blur + grayscale + затемнение */}
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
  // Обёртка содержит инпут + визуальное число (один поверх другого)
  weightInputWrap: {
    position: 'relative',
    width: '38px',
    height: '27px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  },
  // Инпут абсолютно позиционирован, всегда в DOM
  weightInput: {
    position: 'absolute',
    inset: 0,
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
    transition: 'opacity 0.15s ease'
  },
  weightValue: {
    width: '38px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 800,
    lineHeight: '27px',
    textAlign: 'center',
    color: '#9ED153'
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
    zIndex: 3
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