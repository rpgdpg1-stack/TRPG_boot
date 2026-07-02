import { useState, useEffect, useRef } from 'react'
import { saveExerciseWeight } from '../features/exercises/api'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { haptic } from '../lib/telegram'
import {
  markWeightEditingStarted,
  markWeightEditingEnded,
  shouldIgnoreCardTap
} from '../lib/weight-editing-state'
import { sanitizeWeightInput, normalizeWeightForSave } from '../features/exercises/weight-format'
import UiIcon from './UiIcon'

/**
 * Карточка упражнения.
 *
 * НОВЫЙ ВИЗУАЛ (правка от 15.05.2026):
 *  - Сверху картинка слева, справа — название упражнения крупно.
 *  - Под названием — ОДИН тег подгруппы (Ширина / Бицепс / ...) в цвете основной
 *    группы. Имя группы (Спина / Грудь) показывается в заголовке секции на дне.
 *  - Под тегом — серая подпись подходов (3×8-10).
 *  - Справа цифра веса в АКЦЕНТНОМ цвете группы (не зелёная как раньше).
 *
 * Что СОХРАНЕНО без изменений:
 *  - long-press → onLongPress(slot) для меню "Инфо / Сменить"
 *  - tap → onTap(slot) для отметки выполнено / не выполнено
 *  - isActive → затемнение карточки + тост "Готово, молодец!"
 *  - ввод веса через прозрачный инпут поверх цифры (iOS-friendly)
 *  - глобальная защита от ложных активаций при открытой клавиатуре
 *  - все рефы, таймеры, обработчики pointer-событий — не тронуты
 */
export default function ExerciseCard({ slot, isActive = false, onTap, onLongPress, onDots }) {
  const {
    exercise_id,
    exercise_name,
    muscle_group,
    sub_group,
    meta_info,
    preview_url,
    user_weight_kg
  } = slot

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('0')
  const [localWeight, setLocalWeight] = useState(
    user_weight_kg !== null && user_weight_kg !== undefined ? user_weight_kg : 0
  )
  const inputRef = useRef(null)

  // Кроссфейд превью при смене упражнения (свап): старое изображение держим
  // снизу, новое сверху плавно проявляем по onLoad — без «промаргивания»/бланка.
  const curSrcRef = useRef(preview_url)
  const [frontSrc, setFrontSrc] = useState(preview_url)
  const [backSrc, setBackSrc] = useState(null)
  const [frontReady, setFrontReady] = useState(true)
  useEffect(() => {
    if (preview_url === curSrcRef.current) return
    setBackSrc(curSrcRef.current) // старое остаётся видимым, пока грузится новое
    curSrcRef.current = preview_url
    setFrontSrc(preview_url)
    setFrontReady(false)
  }, [preview_url])

  const editingRef = useRef(false)

  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const LONG_PRESS_MS = 500
  const MOVE_THRESHOLD_PX = 10

  // Цвета группы мышц — тег + акцент для цифры веса
  const colors = getMuscleGroupColors(muscle_group)

  // Один тег — подгруппа («Ширина», «Бицепс»…), в цвете основной группы. Имя
  // группы живёт в заголовке секции на дне тренировки, на карточке не дублируется.
  // Если подгруппы нет — откатываемся на имя группы, чтобы тег не был пустым.
  const tagLabel = toTitleCase(
    SUB_GROUP_LABELS[sub_group] || sub_group ||
    MUSCLE_GROUP_LABELS[muscle_group] || muscle_group || ''
  )

  useEffect(() => {
    setLocalWeight(
      user_weight_kg !== null && user_weight_kg !== undefined ? user_weight_kg : 0
    )
  }, [user_weight_kg])

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  const handleCardPointerDown = (e) => {
    if (editingRef.current) return
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
    markWeightEditingStarted()

    // Лёгкий тап — "ты начал ввод веса". Без него юзер не понимает
    // отреагировал ли инпут на тап (особенно когда клавиатура iOS открывается
    // с задержкой 200-300мс).
    haptic.light()

    setTimeout(() => {
      try {
        inputRef.current?.select()
      } catch (e) { /* ignore */ }
    }, 10)
  }

  const handleInputChange = (e) => {
    setDraft(sanitizeWeightInput(e.target.value))
  }

  const handleInputBlur = async () => {
    editingRef.current = false
    setEditing(false)
    markWeightEditingEnded()

    const norm = normalizeWeightForSave(draft)

    // Стерли всё → ставим 0. Если вес и так был 0 — нечего сохранять.
    if (norm.cleared) {
      if (localWeight !== 0) {
        setLocalWeight(0)
        try {
          await saveExerciseWeight(exercise_id, 0)
          haptic.success()
        } catch (e) {
          console.error('[ExerciseCard] saveExerciseWeight error:', e)
        }
      }
      return
    }

    // Невалидный ввод — молча выходим без вибро.
    if (norm.invalid) return

    const rounded = norm.value

    // Вес не изменился — не пиликаем (ложный фидбек "сохранил").
    if (rounded === localWeight) return

    setLocalWeight(rounded)

    try {
      const ok = await saveExerciseWeight(exercise_id, rounded)
      if (ok) {
        haptic.success()
      } else {
        console.warn('[ExerciseCard] saveExerciseWeight returned false')
      }
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

  // Кнопка «⋯» — открывает компактное меню (заметка / техника / замена) у самой
  // кнопки. Long-press по карточке открывает модалку заметки. stopPropagation,
  // чтобы тап по «⋯» не отметил упражнение и не запустил long-press карточки.
  const menuBtnRef = useRef(null)
  const handleMenuPointerDown = (e) => {
    e.stopPropagation()
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleMenuClick = (e) => {
    e.stopPropagation()
    if (shouldIgnoreCardTap()) return
    haptic.light()
    if (onDots) onDots(slot, menuBtnRef.current?.getBoundingClientRect() || null)
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
        {/* Нижний слой — старое изображение, держится пока новое не проявится. */}
        {backSrc && (
          <img src={backSrc} alt="" style={styles.previewImgLayer} draggable={false} />
        )}
        {frontSrc ? (
          <img
            src={frontSrc}
            alt=""
            draggable={false}
            onLoad={() => {
              setFrontReady(true)
              // Старое убираем после завершения кроссфейда (задержка + длительность).
              setTimeout(() => setBackSrc(null), 2400)
            }}
            style={{
              ...styles.previewImgLayer,
              opacity: frontReady ? 1 : 0,
              // Задержка 0.35с — кроссфейд стартует когда карточка идёт вверх из
              // press-эффекта; длительность 2с — плавная смена кадра во время возврата.
              transition: 'opacity 2s ease 0.35s'
            }}
          />
        ) : (
          <div style={styles.previewPlaceholder}>💪</div>
        )}
      </div>

      <div style={styles.content}>
        {/* 1. Название упражнения — сверху, крупно */}
        <div style={styles.exerciseName}>
          {exercise_name}
        </div>

        {/* 2. Один тег подгруппы в цвете основной группы */}
        <div style={styles.tagsRow}>
          {tagLabel && (
            <span style={{ ...styles.tag, background: colors.tag, color: '#FFFFFF' }}>
              {tagLabel}
            </span>
          )}
        </div>

        {/* 3. Подходы — серой подписью под тегами */}
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
              color: colors.accent,
              caretColor: colors.accent,
              opacity: editing ? 1 : 0
            }}
          />
          {!editing && (
            <div style={{ ...styles.weightValue, color: colors.accent }}>
              {localWeight}
            </div>
          )}
        </div>
        <div style={styles.weightUnit}>кг</div>
      </div>

      {/* «⋯» — компактное меню (заметка / техника / замена) у кнопки. */}
      <button
        ref={menuBtnRef}
        type="button"
        onClick={handleMenuClick}
        onPointerDown={handleMenuPointerDown}
        style={styles.menuButton}
        aria-label="Меню упражнения"
      >
        ⋯
      </button>

      <div
        style={{
          ...styles.activeOverlay,
          opacity: isActive ? 1 : 0,
          pointerEvents: 'none'
        }}
      />

      {/* Галочка «выполнено» — акцентный зелёный, по центру поверх затемнения. */}
      {isActive && (
        <div style={styles.doneCheck} aria-hidden="true">
          <UiIcon name="check" size={40} color="var(--color-primary)" />
        </div>
      )}
    </div>
  )
}

/**
 * "СПИНА" → "Спина", "БИЦЕПС БЕДРА" → "Бицепс бедра".
 * Локальный хелпер — наружу выносить пока незачем.
 */
function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
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
    position: 'relative',
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
  // Слой изображения превью (для кроссфейда старое/новое — оба absolute).
  previewImgLayer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  previewPlaceholder: {
    fontSize: '40px',
    opacity: 0.4
  },
  // Текстовая колонка: название сверху, теги, подходы внизу
  content: {
    flex: 1,
    minWidth: 0,
    height: '118px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '8px'
  },
  exerciseName: {
    fontFamily: 'var(--font-geist)',
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: '19px',
    color: '#F0F0F0'
  },
  // Ряд тега подгруппы (в цвете основной группы)
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap'
  },
  tag: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '999px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    lineHeight: '15px',
    whiteSpace: 'nowrap',
    // Слегка приглушён, как чипы групп в шапке дня (единый спокойный вид).
    opacity: 0.5
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '14px',
    letterSpacing: '0.03em',
    color: '#A8A8A8'
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
    borderRadius: 'var(--radius-small)',
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
    background: 'transparent',
    border: 'none',
    outline: 'none',
    textAlign: 'center',
    padding: 0,
    margin: 0,
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
    pointerEvents: 'none'
  },
  weightUnit: {
    width: '38px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 800,
    lineHeight: '15px',
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
  // Кнопка «⋯» в верхнем правом углу — вход в меню. Над затемнением (zIndex 7),
  // чтобы оставалась видимой и тапабельной даже на выполненной карточке.
  menuButton: {
    position: 'absolute',
    top: '4px',
    right: '18px',
    width: '34px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#9A9A9A',
    fontSize: '22px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '1px',
    padding: 0,
    zIndex: 7,
    WebkitTapHighlightColor: 'transparent'
  },
  // Галочка «выполнено» — по центру, поверх затемнения, с лёгкой тенью для
  // читаемости на любом фоне карточки.
  doneCheck: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 7,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55))',
    animation: 'checkPop 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
  }
}