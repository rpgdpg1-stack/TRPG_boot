import { useEffect, useRef, useState } from 'react'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { getExerciseNote, getExerciseNoteCached, saveExerciseNote, NOTE_MAX_LENGTH } from '../lib/notes'
import { saveExerciseWeight } from '../features/exercises/api'
import { sanitizeWeightInput, normalizeWeightForSave } from '../features/exercises/weight-format'
import { haptic } from '../lib/telegram'
import ExerciseVideo from './ExerciseVideo'
import UiIcon from './UiIcon'

/**
 * Всплывающее меню при долгом нажатии на карточку упражнения.
 *
 * НОВЫЙ ВИЗУАЛ:
 *  - Сверху на всю ширину модалки — квадратное зацикленное видео со
 *    скруглением 33px (как карточки упражнений)
 *  - Если video_url нет — fallback на preview_url, потом на 💪
 *  - Под видео — название упражнения (крупно, по центру)
 *  - Под названием — два тега: цветной тег группы + серый тег подгруппы
 *  - Под тегами — подходы серым (если есть)
 *  - Две кнопки: ℹ️ Инфо и 🔄 Сменить (без изменений)
 *
 * Размеры текста увеличены т.к. видео сверху "съело" компактный мини-формат,
 * текст теперь центральный элемент и должен читаться комфортно.
 *
 * Закрытие: тап по оверлею или Cancel.
 */
// Тёплый янтарный — общепринятый цвет для заметок (жёлтый стикер).
const NOTE_ICON_COLOR = '#FFA94D'

export default function ExerciseActionMenu({ slot, onClose, onWeightSaved }) {
  const noteInputRef = useRef(null)

  // Заметка: текст из БД, режим редактирования, черновик и статус сохранения.
  const [note, setNote] = useState(() => getExerciseNoteCached(slot?.exercise_id) ?? '')
  const [noteLoaded, setNoteLoaded] = useState(() => getExerciseNoteCached(slot?.exercise_id) !== null)
  const [editingNote, setEditingNote] = useState(false)
  const [draft, setDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState(false)

  // Вес — отображаем и редактируем прямо в модалке (как на карточке в днях
  // тренировки). При сохранении дёргаем saveExerciseWeight и сообщаем наверх
  // через onWeightSaved, чтобы карточка под модалкой тоже обновила цифру.
  const weightInputRef = useRef(null)
  const [editingWeight, setEditingWeight] = useState(false)
  const [weightDraft, setWeightDraft] = useState('0')
  // Момент закрытия клавиатуры веса. Нужен чтобы первый тап по кнопкам
  // действий ПОСЛЕ закрытия не проваливался в переход (как cooldown в
  // weight-editing-state.js для карточек дней).
  const weightClosedAtRef = useRef(0)
  const [localWeight, setLocalWeight] = useState(
    slot?.user_weight_kg !== null && slot?.user_weight_kg !== undefined ? slot.user_weight_kg : 0
  )

  // Сбрасываем локальный вес ТОЛЬКО при смене упражнения (exercise_id).
  // user_weight_kg намеренно НЕ в зависимостях: иначе эффект перезатирал бы
  // только что введённое и сохранённое значение веса. Подавление осознанное.
  useEffect(() => {
    setLocalWeight(
      slot?.user_weight_kg !== null && slot?.user_weight_kg !== undefined ? slot.user_weight_kg : 0
    )
  }, [slot?.exercise_id]) // eslint-disable-line react-hooks/exhaustive-deps


  const handleWeightFocus = () => {
    setEditingWeight(true)
    setWeightDraft(String(localWeight))
    haptic.light()
    setTimeout(() => {
      try { weightInputRef.current?.select() } catch (e) { /* ignore */ }
    }, 10)
  }

  const handleWeightChange = (e) => {
    setWeightDraft(sanitizeWeightInput(e.target.value))
  }

  const handleWeightBlur = async () => {
    setEditingWeight(false)
    weightClosedAtRef.current = Date.now()
    const norm = normalizeWeightForSave(weightDraft)

    if (norm.cleared) {
      if (localWeight !== 0) {
        setLocalWeight(0)
        try {
          await saveExerciseWeight(slot.exercise_id, 0)
          onWeightSaved?.(slot.exercise_id, 0)
          haptic.success()
        } catch (e) {
          console.error('[ExerciseActionMenu] saveExerciseWeight error:', e)
        }
      }
      return
    }

    if (norm.invalid) return

    const rounded = norm.value
    if (rounded === localWeight) return

    setLocalWeight(rounded)
    try {
      const ok = await saveExerciseWeight(slot.exercise_id, rounded)
      if (ok) {
        onWeightSaved?.(slot.exercise_id, rounded)
        haptic.success()
      }
    } catch (e) {
      console.error('[ExerciseActionMenu] saveExerciseWeight error:', e)
    }
  }

  const handleWeightKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      weightInputRef.current?.blur()
    }
  }

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)

    // НЕ фиксируем body через position:fixed — он ломает закреплённую sticky-шапку
    // страницы (при открытии/закрытии модалки шапка дёргается/моргает). Скролл
    // фона гасим через touch-action:none + onTouchMove на оверлее (см. ниже).
    // Запоминаем позицию и, если iOS-клавиатура сдвинула документ, мягко вернём
    // её при закрытии обычным scrollTo (sticky это не ломает).
    const scrollY = window.scrollY
    return () => {
      document.removeEventListener('keydown', handleKey)
      if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo(0, scrollY)
    }
  }, [onClose])

  // Подтягиваем заметку при открытии меню (по exercise_id текущего слота).
  useEffect(() => {
    if (!slot?.exercise_id) return
    let cancelled = false
    // Из кэша — сразу, без скелетона; иначе показываем скелетон до загрузки.
    const cached = getExerciseNoteCached(slot.exercise_id)
    if (cached !== null) { setNote(cached); setNoteLoaded(true) }
    else setNoteLoaded(false)
    getExerciseNote(slot.exercise_id).then(text => {
      if (cancelled) return
      setNote(text)
      setNoteLoaded(true)
    })
    return () => { cancelled = true }
  }, [slot?.exercise_id])

  const startEditNote = () => {
    haptic.light()
    setDraft(note)
    setNoteError(false)
    setEditingNote(true)
    // Выделяем весь текст СРАЗУ после тапа (как при правке веса), а не через
    // onFocus — иначе на iOS из-за autoFocus/анимации клавиатуры выделение
    // появляется с заметной задержкой. Пара попыток на случай, пока поле
    // монтируется/получает фокус.
    const selectAll = () => { try { noteInputRef.current?.select() } catch (e) { /* ignore */ } }
    setTimeout(selectAll, 10)
    setTimeout(selectAll, 70)
  }

  const cancelEditNote = () => {
    setEditingNote(false)
    setNoteError(false)
    setDraft('')
  }

  // Тап мимо модалки. Если в фокусе инпут (вес/заметка) — blur (гасит клавиатуру,
  // вес сохраняется через onBlur), затем закрываем. Позиция вернётся в эффекте
  // выше без дёрганья шапки.
  const handleOverlayClick = () => {
    const active = document.activeElement
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      try { active.blur() } catch (e) { /* ignore */ }
    }
    onClose()
  }

  // Авто-рост textarea заметки по контенту — весь текст виден без внутр. скролла.
  const autoGrowNote = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const handleSaveNote = async () => {
    if (savingNote) return
    setSavingNote(true)
    setNoteError(false)

    const ok = await saveExerciseNote(slot.exercise_id, draft)
    setSavingNote(false)

    if (ok) {
      haptic.success()
      setNote(draft.trim().slice(0, NOTE_MAX_LENGTH))
      setEditingNote(false)
    } else {
      haptic.error()
      setNoteError(true)
    }
  }

  // Тап по кнопкам действий. Если открыта клавиатура (вес/заметка) — первый
  // тап просто убирает клавиатуру, само действие НЕ выполняется. Для веса
  // достаточно снять фокус (blur) — сработает handleWeightBlur и сохранит.
  // Для заметки в режиме редактирования кнопки и так под редактором не видны,
  // но страхуемся: глушим, пока юзер не нажмёт Отмена/Сохранить.
  // Гасим тап если клавиатура открыта ИЛИ закрылась только что (< 350мс назад).
  // Это ловит кейс: тап по кнопке сперва сбрасывает фокус веса (blur), а потом
  // долетает click — без cooldown он бы провалился в переход.

  if (!slot) return null

  const colors = getMuscleGroupColors(slot.muscle_group)
  const groupLabelRaw = MUSCLE_GROUP_LABELS[slot.muscle_group] || (slot.muscle_group || '').toUpperCase()
  const subGroupLabelRaw = SUB_GROUP_LABELS[slot.sub_group] || (slot.sub_group || '').toUpperCase()
  const groupLabel = toTitleCase(groupLabelRaw)
  const subGroupLabel = toTitleCase(subGroupLabelRaw)

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div
        style={styles.menu}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Карточка-шапка: как карточка упражнения в днях тренировки, но
            вместо статичной миниатюры — зацикленное видео. Вес тут же
            отображается и редактируется. Большое видео — по кнопке «Техника». */}
        <div style={styles.card}>
          <div style={styles.preview}>
            <ExerciseVideo
              videoUrl={slot.video_url}
              previewUrl={slot.preview_url}
              size="full"
            />
          </div>

          <div style={styles.cardContent}>
            <div style={styles.exerciseName}>{slot.exercise_name}</div>

            <div style={styles.tagsRow}>
              {groupLabel && (
                <span style={{ ...styles.tag, background: colors.tag, color: '#FFFFFF' }}>
                  {groupLabel}
                </span>
              )}
              {subGroupLabel && (
                <span style={{ ...styles.tag, ...styles.tagSecondary }}>
                  {subGroupLabel}
                </span>
              )}
            </div>

            {slot.meta_info && (
              <div style={styles.meta}>{slot.meta_info}</div>
            )}
          </div>

          <div
            style={styles.weightBlock}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.weightInputWrap}>
              <input
                ref={weightInputRef}
                type="text"
                inputMode="decimal"
                pattern="[0-9]*"
                value={editingWeight ? weightDraft : String(localWeight)}
                onChange={handleWeightChange}
                onFocus={handleWeightFocus}
                onBlur={handleWeightBlur}
                onKeyDown={handleWeightKeyDown}
                style={{
                  ...styles.weightInput,
                  color: colors.accent,
                  caretColor: colors.accent,
                  opacity: editingWeight ? 1 : 0
                }}
              />
              {!editingWeight && (
                <div style={{ ...styles.weightValue, color: colors.accent }}>
                  {localWeight}
                </div>
              )}
            </div>
            <div style={styles.weightUnit}>KG</div>
          </div>
        </div>

        {/* Заметка к упражнению — сразу под карточкой */}
        <div style={styles.noteBlock}>
          {!noteLoaded ? (
            <div style={styles.noteSkeleton} />
          ) : editingNote ? (
            <>
              <textarea
                ref={(el) => { noteInputRef.current = el; autoGrowNote(el) }}
                autoFocus
                value={draft}
                onChange={(e) => { setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH)); autoGrowNote(e.target) }}
                placeholder="Например: не круглить спину, хват шире плеч"
                style={styles.noteTextarea}
                maxLength={NOTE_MAX_LENGTH}
              />
              <div style={styles.noteEditFooter}>
                <span style={styles.noteCounter}>{draft.length}/{NOTE_MAX_LENGTH}</span>
                <div style={styles.noteEditButtons}>
                  <button onClick={cancelEditNote} style={styles.noteCancelBtn} disabled={savingNote}>
                    Отмена
                  </button>
                  <button onClick={handleSaveNote} style={styles.noteSaveBtn} disabled={savingNote}>
                    {savingNote ? 'Сохранение…' : 'Сохранить'}
                  </button>
                </div>
              </div>
              {noteError && (
                <div style={styles.noteErrorText}>
                  Не удалось сохранить. Проверь интернет.
                </div>
              )}
            </>
          ) : note ? (
            <div
              style={styles.noteView}
              onClick={startEditNote}
            >
              <span style={styles.noteViewIcon}>
                <UiIcon name="notes" size={20} color={NOTE_ICON_COLOR} />
              </span>
              <span style={styles.noteViewText}>{note}</span>
            </div>
          ) : (
            <button onClick={startEditNote} style={styles.noteAddButton}>
              <span style={styles.noteViewIcon}>
                <UiIcon name="notes" size={20} color={NOTE_ICON_COLOR} />
              </span>
              <span style={styles.noteAddLabel}>Добавить заметку</span>
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Аккуратный крестик для кнопки «Закрыть». Тонкие линии, скруглённые концы —
 * нейтральный UX-стиль, цвет наследуется от текста кнопки (currentColor).
 */

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.75)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    // Гасим скролл фона декларативно (touch-action), не трогая body — иначе
    // ломается sticky-шапка. Скролл самой высокой модалки разрешён через
    // touch-action:pan-y на ней (см. menu).
    touchAction: 'none',
    // Верхний отступ = системная зона Telegram + запас. Так даже высокая
    // модалка (видео + карточка + заметка) при центрировании не залезет
    // под кнопки Telegram сверху.
    padding: 'calc(env(safe-area-inset-top) + 30px) 20px 20px',
    overflowY: 'auto',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  // Модалка чуть шире т.к. сверху квадратное видео — на узкой смотрится мелко.
  // maxHeight + overflowY: при поднятой клавиатуре модалка прокручивается
  // внутри себя, поэтому низ (поле заметки + Сохранить) всегда доступен.
  // Ширина как у карточек упражнений — на всю доступную ширину (оверлей
  // даёт отступы 20px по бокам, как раз сопоставимо с полями страницы).
  // maxWidth убран, чтобы модалка не была уже карточек.
  menu: {
    width: '100%',
    maxHeight: '100%',
    overflowY: 'auto',
    touchAction: 'pan-y',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '33px',
    padding: '14px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    animation: 'menuPanelScaleIn 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  // Карточка-шапка — вид карточки упражнения из дней тренировки.
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '16px',
    gap: '16px',
    width: '100%',
    minHeight: '150px',
    background: '#1C1C1C',
    borderRadius: '33px',
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
  cardContent: {
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
    whiteSpace: 'nowrap'
  },
  tagSecondary: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#A0A0A0',
    fontWeight: 600
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '14px',
    letterSpacing: '0.03em',
    color: '#888888'
  },
  // Колонка веса справа — копия с карточки упражнения (цифра + KG),
  // редактируется прозрачным инпутом поверх цифры.
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
    fontSize: '9px',
    fontWeight: 800,
    lineHeight: '12px',
    letterSpacing: '0.05em',
    textAlign: 'center',
    color: '#888888'
  },

  // Блок с кнопками действий — сверху отступ, чтобы отделить от инфо
  actionsBlock: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '8px'
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 'var(--radius-medium)',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s ease, transform 0.1s ease',
    cursor: 'pointer'
  },
  actionIcon: { fontSize: '20px', lineHeight: 1, flexShrink: 0 },
  actionLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)'
  },

  // Блок заметки — в самом низу модалки, под кнопками действий
  noteBlock: {
    width: '100%',
    marginTop: '8px'
  },
  noteSkeleton: {
    width: '100%',
    height: '44px',
    borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.03)'
  },
  // Кнопка "Добавить заметку" (когда заметки ещё нет)
  noteAddButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px dashed rgba(255, 255, 255, 0.15)',
    borderRadius: 'var(--radius-medium)',
    cursor: 'pointer',
    textAlign: 'left'
  },
  noteAddLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)'
  },
  // Просмотр существующей заметки. Текст скроллится внутри, справа карандаш.
  // Блок просмотра заметки. Сам скроллится по вертикали (до 3 строк видно,
  // дальше — прокрутка пальцем + тонкий скроллбар справа, класс note-scroll).
  // Кликабелен целиком: тап открывает редактор (логика тап-vs-скролл в
  // handleNoteViewPointerUp). Правый паддинг чуть больше — место под скроллбар.
  noteView: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    width: '100%',
    padding: '14px 12px 14px 16px',
    background: 'rgba(158, 209, 83, 0.06)',
    border: '1px solid rgba(158, 209, 83, 0.2)',
    borderRadius: 'var(--radius-medium)',
    textAlign: 'left',
    cursor: 'pointer'
    // Без maxHeight/overflow — блок растёт под весь текст (до 280 символов),
    // без внутреннего скролла. Кнопку «Закрыть» убрали — место под текст есть.
  },
  noteViewIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '20px',
    lineHeight: 0,
    flexShrink: 0
  },
  noteViewText: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text)',
    lineHeight: '20px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  
  // Режим редактирования. height под 3 строки (3 × lineHeight 20 + паддинги),
  // overflowY: scroll даёт внутренний скролл + ползунок справа, если текст
  // длиннее 3 строк. touchAction: pan-y — палец листает именно textarea.
  noteTextarea: {
    width: '100%',
    minHeight: '46px',       // ~1 строка; дальше растёт по контенту (autoGrowNote) —
                             //  совпадает по высоте с блоком просмотра, модалка не прыгает
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 'var(--radius-medium)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text)',
    lineHeight: '20px',
    resize: 'none',
    outline: 'none',
    overflow: 'hidden',
    WebkitAppearance: 'none'
  },
  noteEditFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '8px',
    gap: '10px'
  },
  noteCounter: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  },
  noteEditButtons: {
    display: 'flex',
    gap: '8px'
  },
  noteCancelBtn: {
    padding: '8px 14px',
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer'
  },
  noteSaveBtn: {
    padding: '8px 16px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    border: 'none',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer'
  },
  noteErrorText: {
    marginTop: '8px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: '#FF8C42',
    textAlign: 'center'
  },
  // Кнопка «Закрыть» с крестиком. Компактнее остальных (меньше верт. паддинг),
  // иконка + текст по центру, серый нейтральный цвет.
  closeButton: {
    marginTop: '2px',
    padding: '9px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease'
  }
}