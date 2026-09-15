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
import SwipeReveal from './SwipeReveal'

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
export default function ExerciseCard({ slot, isActive = false, onTap, onLongPress, onSwap, onWeightSaved }) {
  const {
    exercise_id,
    exercise_name,
    muscle_group,
    sub_group,
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

  // Свайп влево → «Замена» (общий SwipeReveal). Пока панель открыта, долгое
  // нажатие не заводим: касание открытой карточки её только закрывает.
  const swipeOpenRef = useRef(false)
  // У своего упражнения «Замены» нет: подбирать не из чего — аналог личному
  // упражнению взять неоткуда, экран открылся бы пустым. Нет действий — нет и свайпа.
  // Заметка, техника, прогресс веса и любимые — в меню по долгому нажатию («⋯»).
  const swipeActions = is_custom ? [] : [
    { key: 'swap', icon: 'change', color: 'var(--color-text-secondary)', label: 'Замена', fn: () => onSwap?.(slot) }
  ]

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
      // Карточка ушла, пока в её поле веса был фокус (сменили день, замена
      // пересобрала список) — blur уже не придёт. Флаг «идёт ввод веса» общий
      // на весь экран: не снять его — все карточки глушат касания до перезагрузки.
      if (editingRef.current) markWeightEditingEnded()
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
    clearLongPress()
    // Long-press (меню упражнения) — только на закрытой карточке.
    if (!swipeOpenRef.current) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        haptic.medium()
        if (onLongPress) onLongPress(slot)
      }, LONG_PRESS_MS)
    }
  }

  const handleCardPointerMove = (e) => {
    const dx = e.clientX - pointerStartPos.current.x
    const dy = e.clientY - pointerStartPos.current.y
    // Увёл палец — это скролл или свайп, а не долгое нажатие.
    if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) clearLongPress()
  }

  // Клик после свайпа и по открытой карточке гасит SwipeReveal — сюда доходит
  // только настоящий тап.
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
   <SwipeReveal
     actions={swipeActions}
     radius="var(--radius-day-card)"
     shouldIgnore={() => editingRef.current || shouldIgnoreCardTap()}
     onOpenChange={(open) => { swipeOpenRef.current = open }}
     onSwipeStart={clearLongPress}
   >
    <div
      ref={cardRef}
      className="press-exercise-card"
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      style={{
        ...styles.card,
        background: isActive ? 'var(--surface-card-active)' : 'var(--surface)',
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
        {/* Название упражнения — сверху */}
        <div style={styles.exerciseName}>
          {exercise_name}
          {/* Карандаш — метка «это упражнение завёл ты». Правится оно только
              в конструкторе программы; здесь это просто опознавательный знак. */}
          {is_custom && <span style={styles.customMark}><PencilIcon size={13} color="var(--color-text-secondary)" /></span>}
        </div>

        {/* Один тег подгруппы в цвете основной группы. Длинный обрезается
            многоточием; прокатки тут НЕТ — карточка ловит долгое нажатие, и живой
            тег съедал бы эту зону. Прочитать целиком можно в меню упражнения. */}
        <div style={styles.tagsRow}>
          {tagLabel && (
            <MarqueeTag label={tagLabel} background={colors.tag} style={styles.tag} />
          )}
        </div>

        {/* Подходов («3 × 10-12») здесь НЕТ намеренно. Во время тренировки
            смотрят на вес и на галочку, а строка с числами рядом с ними читалась
            как ещё одна задачка и тянула взгляд на себя. Она никуда не делась:
            открывается по долгому нажатию, вместе с остальным про упражнение
            (см. ExerciseActionMenu). */}
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
   </SwipeReveal>
  )
}

/**
 * "СПИНА" → "Спина", "БИЦЕПС БЕДРА" → "Бицепс бедра".
 * Локальный хелпер — наружу выносить пока незачем.
 */
const styles = {
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 'var(--space-4)',
    gap: 'var(--space-4)',
    width: '100%',
    // 117 вместо 132: в дне бывает 8–12 упражнений, и каждая лишняя сотня
    // пикселей — это ещё один экран прокрутки посреди тренировки. Ровно
    // миниатюра (85) плюс поля карточки (16 сверху и снизу).
    minHeight: '117px',
    borderRadius: 'var(--radius-day-card)',
    transition: 'background 0.3s ease',
    overflow: 'hidden'
  },
  preview: {
    position: 'relative',
    flexShrink: 0,
    // 85 вместо 100: картинка тут опознаёт упражнение, а не показывает технику —
    // для узнавания хватает и меньшего кадра. Смотреть движение идут в «Инфо».
    width: '85px',
    height: '85px',
    // Концентрично карточке: 40 − 16 (её поле) = 24. Только при этом дуга
    // миниатюры идёт ПАРАЛЛЕЛЬНО дуге карточки и зазор одинаков по всему углу
    // (обоснование и пересчёт — в tokens.css у самой пары).
    borderRadius: 'var(--radius-day-thumb)',
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
  // Текстовая колонка: название сверху, тег под ним.
  //
  // minHeight, а НЕ height. С жёсткой высотой самые длинные названия каталога
  // («Подъём гантелей на бицепс попеременно на наклонной скамье 45°») не
  // помещались в колонку, вылезали за неё и обрезались нижним overflow:hidden
  // карточки — вместе с тегом. Теперь длинное название растит карточку.
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: '85px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 'var(--space-15)'
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
  // Форма пилюли живёт в MarqueeTag, здесь — размер под плотную карточку дня
  // и полная, НЕ приглушённая заливка.
  //
  // Приглушение прежнее (0.7) — спокойный вид чипов сохраняется. 10px — меньше
  // мелкой ступени шкалы: тег здесь подпись под названием, а не самостоятельный
  // элемент, и в модалке упражнения он остаётся обычного размера.
  tag: { fontSize: '10px', lineHeight: '13px', padding: '3px 9px', opacity: 0.7 },
  weightBlock: {
    flexShrink: 0,
    // 46, а не 38: при кегле 20 дробный вес («62,5») шире 38px и вылезал из
    // своей зоны на цифру соседа. Ширина считается по самому длинному
    // реальному значению, а не по среднему.
    width: '46px',
    height: '85px',
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
    width: '46px',
    height: '24px'
  },
  // Шрифт ТОТ ЖЕ, что у weightValue: иначе при тапе цифра подменялась
  // с Geist на Manrope — размер тот же, а начертание прыгало.
  weightInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '46px',
    height: '24px',
    fontFamily: 'var(--font-manrope)',
    // 20px: ступени между title (18) и heading (22) в шкале нет, а 18 для
    // главной цифры карточки мелко — её читают, не приглядываясь.
    fontSize: '20px',
    fontWeight: 800,
    lineHeight: '24px',
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
    width: '46px',
    height: '24px',
    fontFamily: 'var(--font-manrope)',
    // 20px: ступени между title (18) и heading (22) в шкале нет, а 18 для
    // главной цифры карточки мелко — её читают, не приглядываясь.
    fontSize: '20px',
    fontWeight: 800,
    lineHeight: '24px',
    textAlign: 'center',
    pointerEvents: 'none'
  },
  weightUnit: {
    width: '46px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 800,
    lineHeight: '14px',
    letterSpacing: '0.05em',
    textAlign: 'center',
    color: 'var(--color-text-secondary)'
  },
  activeOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--tint-dark-32)',
    backdropFilter: 'grayscale(0.8) blur(1.5px)',
    WebkitBackdropFilter: 'grayscale(0.8) blur(1.5px)',
    borderRadius: 'var(--radius-day-card)',
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
    filter: 'var(--shadow-icon-drop)',
    animation: 'checkPop 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
  }
}