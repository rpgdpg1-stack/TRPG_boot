import { useEffect, useRef, useState } from 'react'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { getExerciseNote, saveExerciseNote, NOTE_MAX_LENGTH } from '../lib/notes'
import { saveExerciseWeight } from '../features/exercises/api'
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
export default function ExerciseActionMenu({ slot, onInfo, onSwap, onClose, onWeightSaved }) {
  const menuRef = useRef(null)
  const noteInputRef = useRef(null)

  // Заметка: текст из БД, режим редактирования, черновик и статус сохранения.
  const [note, setNote] = useState('')
  const [noteLoaded, setNoteLoaded] = useState(false)
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
  const [localWeight, setLocalWeight] = useState(
    slot?.user_weight_kg !== null && slot?.user_weight_kg !== undefined ? slot.user_weight_kg : 0
  )

  useEffect(() => {
    setLocalWeight(
      slot?.user_weight_kg !== null && slot?.user_weight_kg !== undefined ? slot.user_weight_kg : 0
    )
  }, [slot?.exercise_id])

  // Идёт ли сейчас любой ввод с клавиатуры (вес или заметка). Пока true —
  // оверлей жёстко зафиксирован (overflow: hidden, без пересчёта раскладки),
  // чтобы фон не скроллился и вес не прыгал при появлении клавиатуры.
  const isTyping = editingNote || editingWeight

  const handleWeightFocus = () => {
    setEditingWeight(true)
    setWeightDraft(String(localWeight))
    haptic.light()
    // Вес наверху карточки и так виден — модалку НЕ поднимаем, только
    // показываем клавиатуру (фокус уже произошёл по тапу на инпут).
    setTimeout(() => {
      try { weightInputRef.current?.select() } catch (e) { /* ignore */ }
    }, 10)
  }

  const handleWeightChange = (e) => {
    let v = e.target.value
    v = v.replace(/,/g, '.')
    v = v.replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (v.length > 5) v = v.slice(0, 5)
    setWeightDraft(v)
  }

  const handleWeightBlur = async () => {
    setEditingWeight(false)
    const trimmed = weightDraft.trim()

    if (trimmed === '') {
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

    const num = parseFloat(trimmed)
    if (isNaN(num) || num < 0) return

    const clamped = Math.max(0, Math.min(500, num))
    const rounded = Math.round(clamped * 2) / 2
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

    // Блокируем скролл страницы под модалкой, чтобы свайп по тексту заметки
    // не листал фон. Запоминаем прежнее значение и возвращаем при закрытии.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  // Подтягиваем заметку при открытии меню (по exercise_id текущего слота).
  useEffect(() => {
    if (!slot?.exercise_id) return
    let cancelled = false
    setNoteLoaded(false)
    getExerciseNote(slot.exercise_id).then(text => {
      if (cancelled) return
      setNote(text)
      setNoteLoaded(true)
    })
    return () => { cancelled = true }
  }, [slot?.exercise_id])

  // Высота клавиатуры из visualViewport — нужна чтобы поднять модалку ровно
  // над клавиатурой, не выше. Считаем только при редактировании заметки.
  const [kbHeight, setKbHeight] = useState(0)

  useEffect(() => {
    if (!editingNote) {
      setKbHeight(0)
      return
    }
    const vv = window.visualViewport
    if (!vv) return

    const onResize = () => {
      const h = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKbHeight(h)
    }
    onResize()
    vv.addEventListener('resize', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
    }
  }, [editingNote])

  const startEditNote = () => {
    haptic.light()
    setDraft(note)
    setNoteError(false)
    setEditingNote(true)
    // Фокус ставим СИНХРОННО в том же обработчике тапа — только так iOS
    // открывает клавиатуру сразу, а не после первого введённого символа.
    // Никаких setTimeout/scrollIntoView: модалку поднимаем через CSS-сдвиг
    // (см. styles.menu transform), внутренний скролл больше не нужен.
    if (noteInputRef.current) {
      try { noteInputRef.current.focus({ preventScroll: true }) } catch (e) { noteInputRef.current.focus() }
    }
  }

  const cancelEditNote = () => {
    setEditingNote(false)
    setNoteError(false)
    setDraft('')
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

  if (!slot) return null

  const colors = getMuscleGroupColors(slot.muscle_group)
  const groupLabelRaw = MUSCLE_GROUP_LABELS[slot.muscle_group] || (slot.muscle_group || '').toUpperCase()
  const subGroupLabelRaw = SUB_GROUP_LABELS[slot.sub_group] || (slot.sub_group || '').toUpperCase()
  const groupLabel = toTitleCase(groupLabelRaw)
  const subGroupLabel = toTitleCase(subGroupLabelRaw)

  return (
    <div
      onTouchMove={(e) => {
        // При активном вводе (клавиатура открыта) фон вообще не должен
        // двигаться — глушим любой тач-move кроме самой textarea заметки.
        if (isTyping) {
          const inTextarea = e.target.closest?.('textarea')
          if (!inTextarea) e.preventDefault()
          return
        }
        // Иначе: разрешаем скролл только внутри прокручиваемых блоков.
        const scrollable = e.target.closest?.('[data-scrollable]')
        if (!scrollable) e.preventDefault()
      }}
      style={{
        ...styles.overlay,
        // Во время любого ввода (вес/заметка) фиксируем оверлей: запрещаем
        // скролл фона и убираем пересчёт раскладки от клавиатуры (иначе вес
        // прыгает, а фон с упражнениями подскраливается).
        overflowY: isTyping ? 'hidden' : 'auto'
      }}
      onClick={onClose}
    >
      <div
        ref={menuRef}
        data-scrollable
        style={{
          ...styles.menu,
          // При вводе заметки приподнимаем ВСЮ модалку над клавиатурой через
          // transform (без внутреннего скролла). Зазор 30px от низа клавиатуры,
          // чтобы блок ввода и кнопки не прижимались вплотную. Если по высоте
          // упёрлись бы в системную зону Telegram сверху — transform ограничен
          // так, что выше maxLift модалка не поедет.
          transform: editingNote && kbHeight > 0
            ? `translateY(-${Math.max(0, kbHeight - 30)}px)`
            : 'translateY(0)',
          transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
        }}
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

        {/* Кнопки действий */}
        <div style={styles.actionsBlock}>
          <button onClick={onInfo} style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <UiIcon name="info" size={20} color="#3FA2F7" />
            </span>
            <span style={styles.actionLabel}>Техника упражнения</span>
          </button>

          <button onClick={onSwap} style={styles.actionButton}>
            <span style={styles.actionIcon}>
              <UiIcon name="change" size={20} color="#FF8C42" />
            </span>
            <span style={styles.actionLabel}>Заменить упражнение</span>
          </button>
        </div>

        {/* Заметка к упражнению — в самом низу модалки */}
        <div style={styles.noteBlock}>
          {!noteLoaded ? (
            <div style={styles.noteSkeleton} />
          ) : editingNote ? (
            <>
              <textarea
                ref={noteInputRef}
                data-scrollable
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
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
              data-scrollable
              style={styles.noteView}
            >
              <span style={styles.noteViewIcon}>✍️</span>
              <span
                style={styles.noteViewText}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {note}
              </span>
              <button onClick={startEditNote} style={styles.noteEditPencil} aria-label="Редактировать">
                ✎
              </button>
            </div>
          ) : (
            <button onClick={startEditNote} style={styles.noteAddButton}>
              <span style={styles.noteViewIcon}>✍️</span>
              <span style={styles.noteAddLabel}>Добавить заметку</span>
            </button>
          )}
        </div>

        <button onClick={onClose} style={styles.cancelButton}>
          Отмена
        </button>
      </div>

      <style>{`
        @keyframes menuOverlayFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes menuPanelScaleIn {
          0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

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
    WebkitOverflowScrolling: 'touch',
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
    borderRadius: '14px',
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
    borderRadius: '14px',
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
    borderRadius: '14px',
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
  noteView: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(158, 209, 83, 0.06)',
    border: '1px solid rgba(158, 209, 83, 0.2)',
    borderRadius: '14px',
    textAlign: 'left'
  },
  noteViewIcon: {
    fontSize: '15px',
    lineHeight: '20px',
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
    wordBreak: 'break-word',
    // Высота 3 строки (3×20), дальше — внутренний скролл пальцем.
    maxHeight: '60px',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain'
  },
  // Кнопка-карандаш справа — вход в режим редактирования заметки
  noteEditPencil: {
    flexShrink: 0,
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.06)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    alignSelf: 'flex-start'
  },
  // Режим редактирования. height под 3 строки (3 × lineHeight 20 + паддинги),
  // overflowY: scroll даёт внутренний скролл + ползунок справа, если текст
  // длиннее 3 строк. touchAction: pan-y — палец листает именно textarea.
  noteTextarea: {
    width: '100%',
    height: '84px',          // ~3 строки: 3×20 + 12+12 паддинги
    maxHeight: '84px',
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '14px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text)',
    lineHeight: '20px',
    resize: 'none',
    outline: 'none',
    overflowY: 'scroll',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain',
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
    borderRadius: '10px',
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
  cancelButton: {
    marginTop: '2px',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer'
  }
}