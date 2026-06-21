import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getProgramBySlug, PLACES, getPlaceMeta } from '../features/programs/registry'
import { loadExerciseCatalog, saveMyProgram } from '../features/programs/customProgram'
import { MUSCLE_GROUP_LABELS, SUB_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import ExercisePicker from '../components/ExercisePicker'
import ActionButton from '../components/ActionButton'
import UiIcon from '../components/UiIcon'

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
    const n = existing?.days_count || (existing ? Object.keys(existing.data.days || {}).length : 1)
    return Math.min(3, Math.max(1, n || 1))
  })
  // byLoc: { gym: [ [exId,...] /* день A */, ... ], home: [...], outdoor: [...] }
  // Для каждого места — массив дней (по числу dayCount), день — массив exercise_id.
  const [byLoc, setByLoc] = useState(() => initByLoc(existing, dayCount))
  const [activeLoc, setActiveLoc] = useState('gym')
  const [activeIdx, setActiveIdx] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const [limitToast, setLimitToast] = useState(false)
  const [limitNonce, setLimitNonce] = useState(0)
  const limitTimer = useRef(null)

  // Снимок исходного состояния — чтобы понять, были ли изменения.
  const initialSnapshot = useRef(null)

  const [catalog, setCatalog] = useState([])
  const exMap = useMemo(() => Object.fromEntries(catalog.map(e => [e.id, e])), [catalog])

  // Снимок при первом рендере: с чем пришли (для сравнения «были ли правки»).
  if (initialSnapshot.current === null) {
    initialSnapshot.current = JSON.stringify({ name: existing?.title || '', dayCount, byLoc })
  }

  const isDirty = () =>
    initialSnapshot.current !== JSON.stringify({ name, dayCount, byLoc })

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
    // isDirty читает name/byLoc на момент тапа через замыкание эффекта —
    // поэтому держим их в зависимостях, чтобы handler был свежий.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, pickerOpen, name, byLoc])

  useEffect(() => {
    let cancelled = false
    loadExerciseCatalog().then(list => { if (!cancelled) setCatalog(list) })
    return () => { cancelled = true }
  }, [])
  
  // Конструктор всегда открывается с самого верха страницы.
  useEffect(() => {
    window.scrollTo(0, 0)
    document.scrollingElement?.scrollTo(0, 0)
  }, [])

  // Клавиатура: прячем док сразу при открытии, показываем с задержкой при
  // закрытии (чтобы возврат не попал в анимацию клавиатуры → без моргания).
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let t = null
    const onResize = () => {
      const open = (window.innerHeight - vv.height) > 150
      if (open) { if (t) { clearTimeout(t); t = null } setKbOpen(true) }
      else { if (t) clearTimeout(t); t = setTimeout(() => setKbOpen(false), 350) }
    }
    vv.addEventListener('resize', onResize)
    onResize()
    return () => { vv.removeEventListener('resize', onResize); if (t) clearTimeout(t) }
  }, [])

  // Гасим глобальный нижний fade-scrim (.app::after): на конструкторе таб-бара
  // нет, а scrim иначе ложится поверх кнопок и липнет к клавиатуре на iOS.
  // Класс снимается при уходе со страницы.
  useEffect(() => {
    document.body.classList.add('hide-app-scrim')
    return () => document.body.classList.remove('hide-app-scrim')
  }, [])

  // Чистим таймер попапа лимита при уходе со страницы.
  useEffect(() => () => { if (limitTimer.current) clearTimeout(limitTimer.current) }, [])

  // Тап по кнопке «Добавить» когда день уже забит (10/10): вибрация ошибки +
  // красный попап с подсказкой + шейк (нонс перезапускает анимацию на каждый тап).
  const handleAddTap = () => {
    if (atLimit) {
      haptic.error()
      setLimitToast(true)
      setLimitNonce(n => n + 1)
      if (limitTimer.current) clearTimeout(limitTimer.current)
      limitTimer.current = setTimeout(() => setLimitToast(false), 2600)
      return
    }
    haptic.light()
    setPickerOpen(true)
  }


  const changeDayCount = (n) => {
    if (n === dayCount) return
    haptic.light()
    setByLoc(prev => {
      const next = {}
      for (const loc of PLACES) {
        const arr = [...(prev[loc] || [])]
        if (n > arr.length) { while (arr.length < n) arr.push([]) }
        else { arr.length = n }
        next[loc] = arr
      }
      return next
    })
    setDayCount(n)
    setActiveIdx(i => Math.min(i, n - 1))
  }

  // Переключение места (Зал/Дом/Улица) — наполняем дни для каждого места отдельно.
  const changeLoc = (loc) => {
    if (loc === activeLoc) return
    haptic.selection()
    setActiveLoc(loc)
  }

  const handleToggle = (ex) => {
    setByLoc(prev => {
      const next = { ...prev, [activeLoc]: prev[activeLoc].map(d => [...d]) }
      const day = next[activeLoc][activeIdx]
      const i = day.indexOf(ex.id)
      if (i >= 0) day.splice(i, 1)                       // снять выбор
      else if (day.length < MAX_PER_DAY) day.push(ex.id) // добавить
      return next
    })
  }

  const handleRemove = (exId) => {
    haptic.light()
    setByLoc(prev => {
      const next = { ...prev, [activeLoc]: prev[activeLoc].map(d => [...d]) }
      next[activeLoc][activeIdx] = next[activeLoc][activeIdx].filter(id => id !== exId)
      return next
    })
  }

  // Сохранить можно, когда хотя бы ОДНО место заполнено по всем дням (Зал не
  // обязателен — можно собрать только Дом или только Улицу). Остальные места
  // (в т.ч. частично заполненные) тоже сохраняются, если есть непустые дни.
  const canSave = !saving && PLACES.some(loc => {
    const arr = byLoc[loc] || []
    return arr.length >= 1 && arr.every(d => d.length >= 1)
  })

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    haptic.medium()
    try {
      // Передаём только места, где есть хоть один непустой день.
      const payload = {}
      for (const loc of PLACES) {
        if ((byLoc[loc] || []).some(d => d.length > 0)) payload[loc] = byLoc[loc]
      }
      await saveMyProgram(name.trim(), dayCount, payload)
      initialSnapshot.current = JSON.stringify({ name, dayCount, byLoc }) // зафиксировали как сохранённое
      haptic.success()
      navigate('/category/gym')
    } catch (e) {
      console.error('[constructor] save error:', e)
      haptic.error()
      setSaving(false)
      window.alert('Не удалось сохранить. Проверь интернет и попробуй ещё раз.')
    }
  }

  const currentDay = byLoc[activeLoc]?.[activeIdx] || []
  const atLimit = currentDay.length >= MAX_PER_DAY

  const moveItem = (from, to) => {
    setByLoc(prev => {
      const next = { ...prev, [activeLoc]: prev[activeLoc].map(d => [...d]) }
      const arr = next[activeLoc][activeIdx]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return next
    })
  }

  const handleDragStart = (e, idx) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const el = rowRefs.current[idx]
    const stride = (el?.offsetHeight || 90) + 10 // высота строки + gap списка (10px)
    const data = { startIndex: idx, targetIndex: idx, dy: 0, stride, startY: e.clientY }
    dragRef.current = data
    setDrag(data)
    haptic.medium()
  }

  const handleDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    const len = (byLoc[activeLoc]?.[activeIdx] || []).length
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

      <div style={styles.section}>
        <div style={styles.secLabel}>НАЗВАНИЕ</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название программы"
          maxLength={40}
          style={styles.nameInput}
        />
      </div>

      {/* Количество дней */}
      <div style={styles.section}>
        <div style={styles.secLabel}>ДНЕЙ В ПРОГРАММЕ</div>
        <div style={styles.segments}>
          {[1, 2, 3].map(n => {
            const active = dayCount === n
            return (
              <button
                key={n}
                onClick={() => changeDayCount(n)}
                className="press-tile"
                style={{
                  ...styles.pillTab,
                  ...(active ? styles.pillTabActive : {}),
                  color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)',
                  fontSize: active ? '26px' : '20px',
                  transform: active ? 'scale(1.06)' : 'scale(1)'
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>

      {/* Место (Зал/Дом/Улица) — для каждого свои дни. Активное место увеличено
          + зелёная полоса под ним; заполненное (есть упражнения) — зелёная
          обводка; пустое неактивное — приглушено (opacity 0.45). */}
      <div style={styles.section}>
        <div style={styles.secLabel}>МЕСТО</div>
        <div style={styles.placeTabs}>
          {PLACES.map(loc => {
            const meta = getPlaceMeta(loc)
            const filled = (byLoc[loc] || []).some(d => d.length > 0)
            const active = activeLoc === loc
            return (
              <button
                key={loc}
                onClick={() => changeLoc(loc)}
                className="press-tile"
                style={{
                  ...styles.pillTab,
                  ...(active ? styles.pillTabActive : {}),
                  // Обводка-нить только у активного и заполненного; пустое
                  // неактивное — без обводки и совсем тусклое.
                  borderColor: (active || filled) ? 'var(--color-border)' : 'transparent',
                  color: active
                    ? 'var(--color-primary)'
                    : (filled ? 'var(--color-text-inactive)' : 'rgba(255,255,255,0.25)'),
                  transform: active ? 'scale(1.06)' : 'scale(1)',
                  fontSize: active ? '15px' : '13px'
                }}
              >
                <UiIcon name={meta.icon} size={21} />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Вкладки дней — пилюли, активный день увеличен + зелёная полоса под ним. */}
      <div style={styles.section}>
        <div style={styles.secLabel}>ДНИ</div>
        <div style={styles.dayTabs}>
          {LETTERS.slice(0, dayCount).map((letter, idx) => {
            const active = activeIdx === idx
            const count = byLoc[activeLoc]?.[idx]?.length || 0
            return (
              <button
                key={letter}
                onClick={() => { haptic.light(); setActiveIdx(idx) }}
                className="press-tile"
                style={{
                  ...styles.pillTab,
                  ...(active ? styles.pillTabActive : {}),
                  fontWeight: 800,
                  color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)',
                  transform: active ? 'scale(1.06)' : 'scale(1)'
                }}
              >
                <span style={{ fontSize: active ? '24px' : '20px' }}>{letter}</span>
                <span style={{ ...styles.dayPillCount, color: active ? 'var(--color-primary)' : 'inherit', fontSize: active ? '13px' : '12px' }}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Список упражнений дня */}
      <div style={styles.secLabel}>УПРАЖНЕНИЯ</div>
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
              style={{ ...styles.exRowWrap, ...rowDragStyle(idx) }}
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
              <div style={{ ...styles.exCard, ...(isDragging ? styles.exCardDragging : {}) }}>
                <div style={styles.exPreview}>
                  {ex?.preview_url
                    ? <img src={ex.preview_url} alt="" style={styles.exPreviewImg} draggable={false} />
                    : <div style={styles.exPreviewPlaceholder}>💪</div>}
                </div>
                <div style={styles.exContent}>
                  <div style={styles.exName}>{ex?.name || exId}</div>
                  {ex && (
                    <div style={styles.exTags}>
                      <span style={{ ...styles.exTag, background: c.tag, color: '#fff' }}>
                        {toTitleCase(MUSCLE_GROUP_LABELS[ex.muscle_group] || ex.muscle_group)}
                      </span>
                      <span style={{ ...styles.exTag, ...styles.exTagSecondary }}>
                        {toTitleCase(SUB_GROUP_LABELS[ex.sub_group] || ex.sub_group)}
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={() => handleRemove(exId)} className="press-tile press-danger" style={styles.removeBtn} aria-label="Удалить">✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {!kbOpen && createPortal(
        <div style={styles.dock}>
          <button
            onClick={handleAddTap}
            className="press-tile"
            style={styles.addButton}
          >
            {atLimit
              ? `Достигнут лимит ${MAX_PER_DAY}/${MAX_PER_DAY}`
              : `Добавить упражнения · ${currentDay.length}/${MAX_PER_DAY}`}
          </button>

          <ActionButton
            onClick={handleSave}
            disabled={!canSave}
            variant="accent"
          >
            {saving ? 'СОХРАНЯЮ…' : 'СОХРАНИТЬ ПРОГРАММУ'}
          </ActionButton>
        </div>,
        document.body
      )}

      {limitToast && createPortal(
        <div style={styles.limitToastWrap}>
          <div key={limitNonce} className="shake-error" style={styles.limitToast}>
            Удалите упражнение из списка, чтобы освободить место.
          </div>
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

// Дни одного места из existing.data.locations[loc] (или data.days для «Зал» —
// фолбэк на старый кеш до перезагрузки из БД).
function buildDaysForLoc(existing, locKey, dayCount) {
  const dayMap = existing?.data?.locations?.[locKey]
    || (locKey === 'gym' ? existing?.data?.days : null)
    || {}
  return LETTERS.slice(0, dayCount).map(letter => {
    const slots = dayMap[letter] || []
    return [...slots].sort((a, b) => a.order_num - b.order_num).map(s => s.default_exercise_id)
  })
}

function initByLoc(existing, dayCount) {
  return {
    gym: buildDaysForLoc(existing, 'gym', dayCount),
    home: buildDaysForLoc(existing, 'home', dayCount),
    outdoor: buildDaysForLoc(existing, 'outdoor', dayCount)
  }
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
  page: { padding: '0 16px 32px', paddingTop: 'calc(var(--tg-safe-top) - 24px)', minHeight: '100dvh' },
  dock: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    padding: '40px 16px calc(16px + env(safe-area-inset-bottom))',
    background: 'linear-gradient(to top, var(--color-bg) 0%, rgba(13,12,12,0.85) 55%, rgba(13,12,12,0) 100%)',
    display: 'flex', flexDirection: 'column', gap: '12px',
    pointerEvents: 'none',
    zIndex: 40
  },
  header: { textAlign: 'center', margin: '8px 0 20px' },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '28px', letterSpacing: '2px', color: 'var(--color-primary)' },
  nameInput: {
    width: '100%', height: '52px', padding: '0 18px',
    background: 'var(--color-card)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-card)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, outline: 'none'
  },
  section: { marginBottom: '20px' },
  secLabel: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '12px', color: 'var(--color-text-secondary)', letterSpacing: '1.5px', marginBottom: '10px' },
  segments: { display: 'flex', gap: '10px' },
  // Единая пилюля-вкладка (дней-в-программе / место / день): одной высоты и
  // ширины (flex:1), радиус 90, тонкая обводка как у таб-бара. Логика состояний
  // как в таб-баре: активная — залита фоном активного таба (стекло) + акцентный
  // текст + чуть увеличена; неактивная — приглушённый текст. Без нижней полоски.
  placeTabs: { display: 'flex', gap: '10px' },
  dayTabs: { display: 'flex', gap: '10px' },
  pillTab: {
    flex: 1, minWidth: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    height: '52px', padding: '0 8px',
    background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap',
    transition: 'transform 0.18s var(--ease-ios), background 0.18s ease, color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease, font-size 0.18s ease'
  },
  // Заливка активной пилюли — как активный таб в таб-баре (стекло + блюр).
  pillTabActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))',
    WebkitBackdropFilter: 'blur(var(--blur-sm))'
  },
  dayPillCount: { fontFamily: 'var(--font-manrope)', fontWeight: 700, opacity: 0.8, transition: 'color 0.18s ease, font-size 0.18s ease' },
  dayList: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', paddingBottom: '0px' },
  emptyDay: { textAlign: 'center', padding: '30px 20px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' },
  exRowWrap: { display: 'flex', alignItems: 'center', gap: '6px' },
  exCard: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-card)', borderRadius: 'var(--radius-card)', padding: '12px', minHeight: '90px' },
  exCardDragging: { background: '#2A2A2A', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  dragHandle: { width: '28px', flexShrink: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: 'grab' },
  exPreview: { width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  exPreviewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  exPreviewPlaceholder: { fontSize: '28px', opacity: 0.4 },
  exContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' },
  exName: { fontFamily: 'var(--font-geist)', fontSize: '13px', fontWeight: 700, lineHeight: '16px', color: 'var(--color-text)' },
  exTags: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  exTag: { display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.2px', lineHeight: '13px', whiteSpace: 'nowrap' },
  exTagSecondary: { background: 'rgba(255,255,255,0.08)', color: '#A0A0A0', fontWeight: 600 },
  removeBtn: { width: '36px', height: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, paddingBottom: '1px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', color: 'var(--color-text-secondary)', fontSize: '18px', fontWeight: 700 },
  addButton: {
    width: '100%', padding: '18px',
    border: '1.5px dashed rgba(255,255,255,0.18)', borderRadius: 'var(--radius-card)',
    background: 'rgba(34,34,34,0.55)', color: 'var(--color-text-secondary)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, letterSpacing: '1px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
    pointerEvents: 'auto'
  },
  limitToastWrap: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 'calc(155px + env(safe-area-inset-bottom))',
    display: 'flex',
    justifyContent: 'center',
    zIndex: 60,
    pointerEvents: 'none'
  },
  limitToast: {
    maxWidth: '200px',
    padding: '10px 14px',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.35,
    color: '#FF6B6B',
    textAlign: 'center'
  },
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
    width: '100%', padding: '16px', border: 'none', borderRadius: 'var(--radius-medium)',
    background: 'var(--color-primary)', color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px'
  },
  exitDiscard: {
    width: '100%', padding: '16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-medium)',
    background: 'rgba(255,255,255,0.04)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700
  },
  exitCancel: {
    width: '100%', padding: '12px', border: 'none', borderRadius: 'var(--radius-small)',
    background: 'transparent', color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600
  }
}