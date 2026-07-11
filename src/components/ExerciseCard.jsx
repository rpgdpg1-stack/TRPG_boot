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
import { useWeightRaiseFlash, WEIGHT_COLOR_TRANSITION } from './WeightRaiseFlash'
import UiIcon from './UiIcon'

/**
 * Карточка упражнения.
 *
 * НОВЫЙ ВИЗУАЛ (правка от 15.05.2026):
 *  - Сверху картинка слева, справа — название упражнения крупно.
 *  - Под названием — ОДИН тег подгруппы (Ширина / Бицепс / ...) в цвете основной
 *    группы. Имя группы (Спина / Грудь) показывается в заголовке секции на дне.
 *  - Под тегом — серая подпись подходов (3×8-10).
 *  - Справа цифра веса — в АКЦЕНТНОМ цвете группы. Изменение веса → короткая
 *    вспышка ~2с (useWeightRaiseFlash): повышение — зелёная стрелка ↑ + зелёное
 *    число; понижение — серая стрелка ↓ + светло-серое число; потом цвет
 *    возвращается к цвету группы.
 *
 * Что СОХРАНЕНО без изменений:
 *  - long-press → onLongPress(slot) для меню "Инфо / Сменить"
 *  - tap → onTap(slot) для отметки выполнено / не выполнено
 *  - isActive → затемнение карточки + тост "Готово, молодец!"
 *  - ввод веса через прозрачный инпут поверх цифры (iOS-friendly)
 *  - глобальная защита от ложных активаций при открытой клавиатуре
 *  - все рефы, таймеры, обработчики pointer-событий — не тронуты
 */
const SWIPE_PANEL_W = 172 // ширина панели действий (3 действия), открывается свайпом влево

// Реестр закрывашек: одновременно открыт свайп ТОЛЬКО у одной карточки. Начал свайп
// на любой другой — остальные закрываются (той же анимацией 0.28с, что и пальцем).
const swipeCloseFns = new Set()

// Открытую панель закрывает ЛЮБОЕ другое действие: скролл (с микро-защитой ~14px —
// маленький скролл не закрывает) и касание любой карточки (тап/отметка/свайп другого).
let openAtScrollY = null
const scrollTopNow = () =>
  (typeof window !== 'undefined' ? (window.scrollY || document.scrollingElement?.scrollTop || 0) : 0)
function closeAllSwipes() { swipeCloseFns.forEach(fn => fn()); openAtScrollY = null }
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    if (openAtScrollY == null) return
    if (Math.abs(scrollTopNow() - openAtScrollY) > 14) closeAllSwipes()
  }, { passive: true })
}

export default function ExerciseCard({ slot, isActive = false, onTap, onLongPress, onNote, onInfo, onSwap }) {
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

  // Вспышка «повысил вес»: зелёная стрелка + зелёное число на ~2с, затем цвет
  // возвращается к цвету группы (только на повышение после blur/Enter).
  const raise = useWeightRaiseFlash()

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

  // Свайп влево → панель действий (заметка / техника / замена). offset: 0 закрыто,
  // -SWIPE_PANEL_W открыто. Порог решения ~8px по X (иначе вертикаль = скролл списка).
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const offsetRef = useRef(0)
  const openRef = useRef(false)
  const swipe = useRef({ x: 0, y: 0, start: 0, decided: false, swiping: false, suppressClick: false })
  const setOff = (v) => { offsetRef.current = v; setOffset(v) }
  const closePanel = () => { openRef.current = false; setDragging(false); setOff(0); openAtScrollY = null; setActiveAction(null) }
  // Регистрируем свою закрывашку; при старте свайпа закрываем ВСЕ ОСТАЛЬНЫЕ.
  const closePanelRef = useRef(closePanel)
  closePanelRef.current = closePanel
  const myCloseFnRef = useRef(null)
  useEffect(() => {
    const fn = () => closePanelRef.current?.()
    myCloseFnRef.current = fn
    swipeCloseFns.add(fn)
    return () => swipeCloseFns.delete(fn)
  }, [])
  const closeOthers = () => { swipeCloseFns.forEach(fn => { if (fn !== myCloseFnRef.current) fn() }) }

  // Drag-select по панели действий: нажал — серое выделение на действии под пальцем;
  // ведёшь влево-вправо — выделение «плавает» между Заметка/Техника/Замена (без вибро);
  // отпустил на действии — вибро + выполнить; увёл вниз/мимо — закрыть без действия.
  const panelRef = useRef(null)
  const [activeAction, setActiveAction] = useState(null)
  const actionDrag = useRef(false)
  const actionIndexAt = (clientX, clientY) => {
    const r = panelRef.current?.getBoundingClientRect()
    if (!r) return null
    if (clientY < r.top - 28 || clientY > r.bottom + 28) return null // увёл вниз/вверх — мимо
    const i = Math.floor(((clientX - r.left) / r.width) * swipeActions.length)
    return Math.max(0, Math.min(swipeActions.length - 1, i))
  }
  const onPanelPointerDown = (e) => {
    e.stopPropagation()
    actionDrag.current = true
    setActiveAction(actionIndexAt(e.clientX, e.clientY))
    try { panelRef.current?.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  }
  const onPanelPointerMove = (e) => {
    if (!actionDrag.current) return
    setActiveAction(actionIndexAt(e.clientX, e.clientY))
  }
  const onPanelPointerUp = (e) => {
    if (!actionDrag.current) return
    actionDrag.current = false
    const i = actionIndexAt(e.clientX, e.clientY)
    setActiveAction(null)
    if (i == null) { closePanel(); return }
    haptic.light()
    runAction(swipeActions[i].fn)
  }
  const onPanelPointerCancel = () => { actionDrag.current = false; setActiveAction(null) }
  const runAction = (fn) => { closePanel(); fn?.(slot) }
  const swipeActions = [
    { key: 'note', icon: 'notes', color: '#FFA94D', label: 'Заметка', fn: onNote },
    { key: 'info', icon: 'info', color: '#3FA2F7', label: 'Техника', fn: onInfo },
    { key: 'swap', icon: 'change', color: '#FF8C42', label: 'Замена', fn: onSwap }
  ]

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

  const clearLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  const handleCardPointerDown = (e) => {
    if (editingRef.current) return
    if (shouldIgnoreCardTap()) return

    longPressFired.current = false
    pointerStartPos.current = { x: e.clientX, y: e.clientY }
    swipe.current = { x: e.clientX, y: e.clientY, start: offsetRef.current, decided: false, swiping: false, suppressClick: false }

    // Касание любой карточки закрывает чужую открытую панель (тап/отметка/свайп другого).
    closeOthers()
    clearLongPress()
    // Long-press (заметка) — только на закрытой карточке.
    if (!openRef.current) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        haptic.medium()
        if (onLongPress) onLongPress(slot)
      }, LONG_PRESS_MS)
    }
  }

  const handleCardPointerMove = (e) => {
    const s = swipe.current
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.decided) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 2) {
        // Горизонталь → свайп: гасим long-press, дальше ведём свою панель за пальцем.
        s.decided = true; s.swiping = true; setDragging(true); clearLongPress()
      } else if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) {
        // Вертикаль/увод — не свайп (это скролл списка / отмена long-press).
        s.decided = true; s.swiping = false; clearLongPress()
      }
    }
    if (s.swiping) {
      setOff(Math.max(-SWIPE_PANEL_W, Math.min(0, s.start + dx)))
    }
  }

  const handleCardPointerUp = () => {
    clearLongPress()
    const s = swipe.current
    if (s.swiping) {
      setDragging(false)
      const opened = offsetRef.current < -SWIPE_PANEL_W / 2
      openRef.current = opened
      setOff(opened ? -SWIPE_PANEL_W : 0)
      openAtScrollY = opened ? scrollTopNow() : null // старт для микро-скролл защиты
      if (opened) haptic.light()
      s.suppressClick = true
      setTimeout(() => { s.suppressClick = false }, 60)
    }
  }

  const handleCardClick = () => {
    if (shouldIgnoreCardTap()) return
    if (editingRef.current) return

    const s = swipe.current
    if (s.suppressClick) { s.suppressClick = false; return }
    // Открытая панель → тап по карточке её закрывает (не отмечает выполнение).
    if (openRef.current) { closePanel(); return }

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

    // Повышение → зелёная вспышка ↑; понижение → мягкая серая вспышка ↓ (обе ~2с).
    raise.trigger(rounded > localWeight ? 'up' : 'down')

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

  return (
   <div style={styles.swipeOuter}>
    {/* Панель действий (справа, под карточкой) — открывается свайпом влево.
        Drag-select: серое выделение под пальцем «плавает» между действиями. */}
    <div
      ref={panelRef}
      style={styles.actionPanel}
      aria-hidden={offset === 0}
      onPointerDown={onPanelPointerDown}
      onPointerMove={onPanelPointerMove}
      onPointerUp={onPanelPointerUp}
      onPointerCancel={onPanelPointerCancel}
    >
      {activeAction != null && (
        <div style={{
          ...styles.actionHighlight,
          left: `calc(${activeAction * 33.333}% + 4px)`,
          width: 'calc(33.333% - 8px)'
        }} />
      )}
      {swipeActions.map(a => (
        <div key={a.key} style={styles.actionBtn}>
          <UiIcon name={a.icon} size={22} color={a.color} />
          <span style={styles.actionLabel}>{a.label}</span>
        </div>
      ))}
    </div>

    {/* Слайдер: двигается по свайпу, внутри — карточка (свой press-scale). */}
    <div
      style={{
        ...styles.slider,
        transform: `translateX(${offset}px)`,
        transition: dragging ? 'none' : 'transform 0.28s var(--ease-ios)',
        touchAction: 'pan-y'
      }}
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={handleCardPointerUp}
      onPointerCancel={handleCardPointerUp}
      onPointerLeave={handleCardPointerUp}
    >
    <div
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
          {/* Стрелка изменения веса — слева от числа, по высоте цифры. */}
          {raise.arrow}
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
            <div style={{ ...styles.weightValue, color: raise.colorFor(colors.accent), transition: WEIGHT_COLOR_TRANSITION }}>
              {localWeight}
            </div>
          )}
        </div>
        <div style={styles.weightUnit}>кг</div>
      </div>

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
    </div>
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
  // Обёртка свайпа: клип по скруглению, панель действий под слайдером.
  swipeOuter: {
    position: 'relative',
    borderRadius: '33px',
    overflow: 'hidden'
  },
  // Панель действий справа (под карточкой). Открывается свайпом влево.
  actionPanel: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: `${SWIPE_PANEL_W}px`,
    display: 'flex',
    alignItems: 'stretch',
    zIndex: 0
  },
  actionBtn: {
    flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '7px',
    // Панель ловит все pointer-события (drag-select); сами кнопки — только визуал.
    pointerEvents: 'none',
    position: 'relative', zIndex: 1
  },
  // Плавающее серое выделение под пальцем — по высоте КОНТЕНТА (иконка+подпись) с
  // небольшим отступом, по центру. Скруглённый прямоугольник, «плавает» по left.
  actionHighlight: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    height: '54px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '14px',
    pointerEvents: 'none',
    zIndex: 0,
    transition: 'left 0.16s var(--ease-ios)'
  },
  actionLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600,
    color: 'var(--color-text-secondary)'
  },
  slider: { position: 'relative', zIndex: 1 },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '16px',
    gap: '16px',
    width: '100%',
    minHeight: '132px',
    borderRadius: '33px',
    transition: 'background 0.3s ease',
    overflow: 'hidden'
  },
  preview: {
    position: 'relative',
    flexShrink: 0,
    width: '100px',
    height: '100px',
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
    fontSize: '34px',
    opacity: 0.4
  },
  // Текстовая колонка: название сверху, теги, подходы внизу
  content: {
    flex: 1,
    minWidth: 0,
    height: '100px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '8px'
  },
  exerciseName: {
    fontFamily: 'var(--font-geist)',
    fontSize: '14px',
    fontWeight: 700,
    lineHeight: '18px',
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
    opacity: 0.7
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
    height: '100px',
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
    color: '#5f5f5f'
  },
  activeOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.32)',
    backdropFilter: 'grayscale(0.8) blur(1.5px)',
    WebkitBackdropFilter: 'grayscale(0.8) blur(1.5px)',
    borderRadius: '33px',
    transition: 'opacity 0.35s ease',
    zIndex: 6
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