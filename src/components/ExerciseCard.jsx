import { useState, useEffect, useRef } from 'react'
import { saveExerciseWeight } from '../features/exercises/api'
import { exerciseTagLabel } from '../features/programs/labels'
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
import ExercisePlaceholder from './ExercisePlaceholder'
import PencilIcon from './PencilIcon'
import MarqueeTag from './MarqueeTag'

/**
 * Карточка упражнения.
 *
 * НОВЫЙ ВИЗУАЛ (правка от 15.05.2026):
 *  - Сверху картинка слева, справа — название упражнения крупно.
 *  - Под названием — ОДИН тег подгруппы (Ширина / Бицепс / ...) в цвете основной
 *    группы. Имя группы (Спина / Грудь) показывается в заголовке секции на дне.
 *  - Под тегом — серая подпись подходов (3×8-10).
 *  - Справа цифра веса — БЕЛАЯ (как заголовок упражнения). Изменение веса →
 *    короткая вспышка ~2с (useWeightRaiseFlash): повышение — зелёная стрелка ↑ +
 *    зелёное число; понижение — серая стрелка ↓ + светло-серое число; потом цвет
 *    возвращается к белому.
 *
 * Что СОХРАНЕНО без изменений:
 *  - long-press → onLongPress(slot) для меню "Инфо / Сменить"
 *  - tap → onTap(slot) для отметки выполнено / не выполнено
 *  - isActive → затемнение карточки + тост "Готово, молодец!"
 *  - ввод веса через прозрачный инпут поверх цифры (iOS-friendly)
 *  - глобальная защита от ложных активаций при открытой клавиатуре
 *  - все рефы, таймеры, обработчики pointer-событий — не тронуты
 */
// Геометрия панели действий (открывается свайпом влево). Зазор ОДИН и тот же:
// от края карточки до первой плитки, между плитками и до правого края — иначе
// первое действие липнет к карточке, а между собой они разъезжаются.
const SWIPE_GAP = 8   // = --space-2
const SWIPE_CELL = 50 // ширина плитки действия

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

export default function ExerciseCard({ slot, isActive = false, onTap, onLongPress, onInfo, onSwap, onWeightSaved }) {
  const {
    exercise_id,
    exercise_name,
    muscle_group,
    sub_group,
    meta_info,
    preview_url,
    user_weight_kg,
    is_custom
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

  // Свайп влево → панель действий (техника / замена). offset: 0 закрыто,
  // -panelW открыто. Порог решения ~8px по X (иначе вертикаль = скролл списка).
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
  // ведёшь влево-вправо — выделение «плавает» между Техника/Замена (без вибро);
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
  // Заметка из свайпа убрана — она осталась в меню по долгому нажатию,
  // где её можно сразу написать, а не открывать ещё один экран.
  // У своего упражнения «Замены» нет: подбирать не из чего — аналог личному
  // упражнению взять неоткуда, экран открылся бы пустым.
  const swipeActions = [
    { key: 'info', icon: 'info', color: 'var(--cat-pool)', label: 'Техника', fn: onInfo },
    ...(is_custom ? [] : [{ key: 'swap', icon: 'change', color: 'var(--color-text-secondary)', label: 'Замена', fn: onSwap }])
  ]
  const panelW = SWIPE_GAP + swipeActions.length * (SWIPE_CELL + SWIPE_GAP)

  // Цвета группы мышц — тег + акцент для цифры веса
  const colors = getMuscleGroupColors(muscle_group, is_custom)

  // Тег несёт ВСЮ принадлежность упражнения — «Ноги — Квадрицепс», в цвете
  // основной группы. Заголовков групп над карточками больше нет, поэтому
  // группа живёт здесь (общий помощник, один формат на все экраны).
  const tagLabel = exerciseTagLabel(muscle_group, sub_group)

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

  // Микро-салют при отметке «выполнено»: 2–3 гладкие зелёные искры от центра
  // карточки, быстро и невысоко (как мини-версия «+1» на завершении).
  const cardRef = useRef(null)
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      const el = cardRef.current
      if (el) {
        for (let i = 0; i < 3; i++) {
          const dim = 3 + Math.random() * 2
          const p = document.createElement('div')
          p.style.cssText = `
            position:absolute; left:50%; top:50%; width:${dim}px; height:${dim}px;
            border-radius:50%; background:var(--color-primary);
            box-shadow:0 0 5px var(--accent-strong); pointer-events:none; z-index:8;
            --burst-x:${Math.random() * 30 - 15}px; --burst-y:${-(16 + Math.random() * 14)}px;
            animation: particleBurst ${0.45 + Math.random() * 0.2}s ease-out forwards;`
          el.appendChild(p)
          setTimeout(() => p.remove(), 800)
        }
      }
    }
    prevActiveRef.current = isActive
  }, [isActive])

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
      setOff(Math.max(-panelW, Math.min(0, s.start + dx)))
    }
  }

  const handleCardPointerUp = () => {
    clearLongPress()
    const s = swipe.current
    if (s.swiping) {
      setDragging(false)
      const opened = offsetRef.current < -panelW / 2
      openRef.current = opened
      setOff(opened ? -panelW : 0)
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
        haptic.success()   // отклик на ДЕЙСТВИЕ, до сети (см. ниже)
        try {
          await saveExerciseWeight(exercise_id, 0)
          // Сообщаем родителю (WorkoutDay) — чтобы slots обновились и модалка
          // от долгого нажатия сразу показала свежий вес.
          onWeightSaved?.(exercise_id, 0)
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
    // Вибро — СРАЗУ, вместе с новой цифрой. Раньше оно ждало ответа сервера и
    // приходило через полсекунды после того, как всё уже поменялось: отклик
    // читался как случайный. Хаптика подтверждает жест, а не запись в базу —
    // офлайн правка всё равно уходит в очередь и не теряется.
    haptic.success()

    try {
      const ok = await saveExerciseWeight(exercise_id, rounded)
      if (ok) {
        // Родителю — новый вес в slots (для синка с модалкой долгого нажатия).
        onWeightSaved?.(exercise_id, rounded)
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
      style={{ ...styles.actionPanel, width: `${panelW}px` }}
      aria-hidden={offset === 0}
      onPointerDown={onPanelPointerDown}
      onPointerMove={onPanelPointerMove}
      onPointerUp={onPanelPointerUp}
      onPointerCancel={onPanelPointerCancel}
    >
      {/* Плитка выделения встаёт по той же сетке, что и сами действия. */}
      {activeAction != null && (
        <div style={{
          ...styles.actionHighlight,
          left: `${SWIPE_GAP + activeAction * (SWIPE_CELL + SWIPE_GAP)}px`,
          width: `${SWIPE_CELL}px`
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
      ref={cardRef}
      className="press-exercise-card"
      style={{
        ...styles.card,
        background: isActive ? '#222222' : 'var(--surface)',
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
          <ExercisePlaceholder size={32} />
        )}
      </div>

      <div style={styles.content}>
        {/* 1. Название упражнения — сверху, крупно */}
        <div style={styles.exerciseName}>
          {exercise_name}
          {/* Карандаш — метка «это упражнение завёл ты». Правится оно только
              в конструкторе программы; здесь это просто опознавательный знак. */}
          {is_custom && <span style={styles.customMark}><PencilIcon size={13} color="var(--color-text-secondary)" /></span>}
        </div>

        {/* 2. Один тег подгруппы в цвете основной группы. Длинный обрезается
            многоточием; прокатки тут НЕТ — карточка ловит долгое нажатие, и живой
            тег съедал бы эту зону. Прочитать целиком можно в меню упражнения. */}
        <div style={styles.tagsRow}>
          {tagLabel && (
            <MarqueeTag label={tagLabel} background={colors.tag} style={styles.tag} />
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
              color: 'var(--color-text)',
              caretColor: colors.accent,
              opacity: editing ? 1 : 0
            }}
          />
          {!editing && (
            // Ноль — это «вес ещё не задан», а не «поднимаю ноль». Раньше он
            // выглядел ровно как настоящее значение, и человек в новой программе
            // не понимал, что поле надо заполнить (UX-005). Показываем прочерк
            // тем же кеглем, но тихим цветом: пустое место читается как
            // приглашение, а не как результат.
            <div style={{
              ...styles.weightValue,
              color: localWeight === 0
                ? 'var(--color-text-secondary)'
                : raise.colorFor('var(--color-text)'),
              transition: WEIGHT_COLOR_TRANSITION
            }}>
              {localWeight === 0 ? '—' : localWeight}
            </div>
          )}
        </div>
        <div style={{
          ...styles.weightUnit,
          // При незаданном весе гасим и единицу: «— кг» ярче прочерка выглядело бы
          // так, будто значение всё-таки есть.
          opacity: localWeight === 0 && !editing ? 0.5 : 1
        }}>{slot.counts_reps ? 'раз' : 'кг'}</div>
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
const styles = {
  // Обёртка свайпа: клип по скруглению, панель действий под слайдером.
  swipeOuter: {
    position: 'relative',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  // Панель действий справа (под карточкой). Открывается свайпом влево.
  actionPanel: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    // ширина приходит инлайном — считается от числа действий
    display: 'flex',
    alignItems: 'stretch',
    padding: `0 ${SWIPE_GAP}px`,
    gap: `${SWIPE_GAP}px`,
    zIndex: 0
  },
  actionBtn: {
    flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
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
    background: 'var(--layer-2)',
    borderRadius: 'var(--radius-small)',
    pointerEvents: 'none',
    zIndex: 0,
    transition: 'left 0.16s var(--ease-ios)'
  },
  actionLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)'
  },
  slider: { position: 'relative', zIndex: 1 },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 'var(--space-4)',
    gap: 'var(--space-4)',
    width: '100%',
    minHeight: '132px',
    borderRadius: 'var(--radius-card)',
    transition: 'background 0.3s ease',
    overflow: 'hidden'
  },
  preview: {
    position: 'relative',
    flexShrink: 0,
    width: '100px',
    height: '100px',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    background: 'var(--color-text)',
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
  // Текстовая колонка: название сверху, теги, подходы внизу
  content: {
    flex: 1,
    minWidth: 0,
    height: '100px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 'var(--space-2)'
  },
  exerciseName: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-button-size)',
    fontWeight: 700,
    lineHeight: '18px',
    color: 'var(--color-text)'
  },
  customMark: { display: 'inline-flex', verticalAlign: 'middle', marginLeft: 'var(--space-15)' },
  // Ряд тега подгруппы (в цвете основной группы)
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 'var(--space-15)',
    // minWidth: 0 — чтобы длинный тег ужимался внутри колонки, а не распирал её
    // под блок веса. Ширину задаёт content (flex: 1, minWidth: 0).
    minWidth: 0,
    maxWidth: '100%'
  },
  // Форма пилюли живёт в MarqueeTag — здесь только приглушение, как у чипов
  // групп в шапке дня (единый спокойный вид).
  tag: { opacity: 0.7 },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 500,
    lineHeight: '14px',
    letterSpacing: '0.03em',
    color: 'var(--color-text-secondary)'
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
    padding: 'var(--space-15)',
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
  // Шрифт ТОТ ЖЕ, что у weightValue: иначе при тапе цифра подменялась
  // с Geist на Manrope — размер тот же, а начертание прыгало.
  weightInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '38px',
    height: '27px',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-heading-size)',
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
    fontSize: 'var(--text-heading-size)',
    fontWeight: 800,
    lineHeight: '27px',
    textAlign: 'center',
    pointerEvents: 'none'
  },
  weightUnit: {
    width: '38px',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 800,
    lineHeight: '15px',
    letterSpacing: '0.05em',
    textAlign: 'center',
    color: 'var(--color-text-secondary)'
  },
  activeOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.32)',
    backdropFilter: 'grayscale(0.8) blur(1.5px)',
    WebkitBackdropFilter: 'grayscale(0.8) blur(1.5px)',
    borderRadius: 'var(--radius-card)',
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