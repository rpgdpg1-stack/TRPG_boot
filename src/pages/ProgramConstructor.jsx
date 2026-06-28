import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getProgramBySlug, PLACES, getPlaceMeta } from '../features/programs/registry'
import { loadExerciseCatalog, saveMyProgram } from '../features/programs/customProgram'
import { MUSCLE_GROUP_LABELS, SUB_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import ExercisePicker from '../components/ExercisePicker'
import ActionButton from '../components/ActionButton'
import ModalButton from '../components/ModalButton'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'

const LETTERS = ['A', 'B', 'C']
const MAX_PER_DAY = 10
// Плейсхолдер группы, пока каталог не загружен (у упражнения ещё нет muscle_group):
// такие упражнения собираются в одну секцию без заголовка.
const UNKNOWN_GROUP = '—'
// Перетаскивание: ширина жёлоба ручки (28) + gap обёртки (6) — на столько клон
// карточки правее левого края строки.
const HANDLE_COL_PX = 34
const NAME_MAX = 24            // лимит длины названия (фронт) — чтоб влезало в строку
const NAME_PLACEHOLDER = 'Введите название'

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
  // Возврат — шаг назад по истории (navigate(-1)), а не push на конкретный путь:
  // конструктор всегда открывается ОДНИМ push'ем со страницы-источника (главная /
  // избранное / раздел), поэтому предыдущая запись истории = эта страница. Push
  // же плодил бы лишнюю запись, и «Назад» с источника возвращал бы снова в редактор.
  const goBack = () => navigate(-1)

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
  // Трогал ли юзер места (тапнул хоть раз). Нужно, чтобы у новой программы до
  // первого тапа контейнер-таб-бар не показывался (все места голым текстом).
  // У существующей программы (есть заполненные места) — сразу true.
  const [placeTouched, setPlaceTouched] = useState(
    () => Object.keys(existing?.data?.locations || {}).length > 0
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const [limitToast, setLimitToast] = useState(false)
  const [limitNonce, setLimitNonce] = useState(0)
  const limitTimer = useRef(null)

  // Поле имени + флаг фокуса: пока инпут в фокусе (клавиатура открыта), поверх
  // экрана висит прозрачный перехватчик — первый тап по нему просто убирает
  // клавиатуру (blur), не активируя контрол под ним (место/день и т.п.).
  const nameRef = useRef(null)
  const [nameFocused, setNameFocused] = useState(false)

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

  // Перетаскивание упражнений внутри дня — живая сортировка с пересчётом групп:
  // тащим за «ручку», клон карточки летит за пальцем (fixed), на её месте — слот-
  // плейсхолдер. Порядок в массиве меняется СРАЗУ при наведении на новую позицию,
  // поэтому заголовки групп разъезжаются/слипаются вживую. Соседи доезжают плавно
  // (FLIP), у краёв экрана включается автоскролл.
  const [drag, setDrag] = useState(null) // { id, grabOffsetY, left, width, height, pointerY }
  const dragRef = useRef(null)           // зеркало drag для обработчиков (без устаревания)
  const orderRef = useRef([])            // актуальный порядок exId дня
  const rowGeoRef = useRef(new Map())    // exId -> обёртка строки (замеры offsetTop + анимация)
  const flipPrevRef = useRef(new Map())  // exId -> прежний offsetTop (для доезда соседей)
  const flipAnimRef = useRef(new Map())  // exId -> текущая Animation (чтобы не накладывались)
  const cloneRef = useRef(null)          // летящий за пальцем клон карточки
  const dayListRef = useRef(null)        // контейнер списка (границы клампа + offsetParent)
  const dragRafRef = useRef(0)           // троттл pointermove до одного раза за кадр

  useEffect(() => {
    if (pickerOpen) {
      backButton.setHandler(() => setPickerOpen(false))
    } else {
      backButton.setHandler(() => {
        if (isDirty()) setConfirmExit(true)
        else goBack()
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
    haptic.selection()
    setPlaceTouched(true)
    setActiveLoc(loc)
  }

  // Заполнено ли место (есть хоть один непустой день).
  const placeFilled = (loc) => (byLoc[loc] || []).some(d => d.length > 0)

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
      goBack()
    } catch (e) {
      console.error('[constructor] save error:', e)
      haptic.error()
      setSaving(false)
      window.alert('Не удалось сохранить. Проверь интернет и попробуй ещё раз.')
    }
  }

  const currentDay = byLoc[activeLoc]?.[activeIdx] || []
  const atLimit = currentDay.length >= MAX_PER_DAY
  // Держим порядок в ref синхронно — обработчики перетаскивания читают актуальный.
  orderRef.current = currentDay

  // Упражнения дня, сгруппированные по основной группе мышц (по порядку
  // добавления). Заголовки секций и единый тег-подгруппа держатся на этом.
  const daySections = groupDayByMuscle(currentDay, exMap)
  // Плоский список «заголовок | строка» — все в ОДНОМ контейнере (а не по секциям),
  // чтобы при переносе между группами DOM-узел строки не пересоздавался и не терял
  // pointer-capture. Заголовок ключуем по первому упражнению секции.
  const flatNodes = []
  daySections.forEach((section) => {
    if (section.muscleGroup !== UNKNOWN_GROUP) {
      flatNodes.push({ type: 'header', key: `h:${section.items[0]?.exId}`, group: section.muscleGroup })
    }
    section.items.forEach(it => flatNodes.push({ type: 'row', exId: it.exId }))
  })

  // Места внутри контейнера-таб-бара (заполненные + активное после тапа) и
  // снаружи (пустые неактивные — голым текстом, как невыбранные табы).
  const inContainerPlaces = PLACES.filter(loc => placeFilled(loc) || (loc === activeLoc && placeTouched))
  const outsidePlaces = PLACES.filter(loc => !inContainerPlaces.includes(loc))

  // Верхняя координата клона (за пальцем), зажатая в границы списка — чтобы карточка
  // не уезжала выше «УПРАЖНЕНИЯ» и ниже последней строки (без автоскролла).
  const cloneTopPx = () => {
    const d = dragRef.current
    if (!d) return 0
    let top = d.pointerY - d.grabOffsetY
    const list = dayListRef.current
    if (list) {
      const lr = list.getBoundingClientRect()
      top = Math.max(lr.top, Math.min(lr.bottom - d.height, top))
    }
    return top
  }

  // Клон карточки летит за пальцем — top задаём императивно (в style его нет; иначе
  // re-render при смене порядка сбрасывал бы позицию).
  const positionClone = () => {
    const el = cloneRef.current
    if (el) el.style.top = `${cloneTopPx()}px`
  }

  // Сдвиг порядка на ОДНУ позицию (своп с соседом), когда центр клона переходит
  // середину соседней карточки. Своп стабилен (нет осцилляции/дребезга): после него
  // следующий сосед уже в целой карточке от пальца. Середины меряем по offsetTop —
  // не зависит от текущих transform/анимаций, поэтому считается ровно.
  const updateOrder = () => {
    const d = dragRef.current
    const list = dayListRef.current
    if (!d || !list) return
    const order = orderRef.current
    const idx = order.indexOf(d.id)
    if (idx < 0) return
    const listTop = list.getBoundingClientRect().top
    const center = cloneTopPx() + d.height / 2
    const midOf = (exId) => {
      const el = rowGeoRef.current.get(exId)
      return el ? listTop + el.offsetTop + el.offsetHeight / 2 : null
    }
    let target = idx
    if (idx > 0) {
      const m = midOf(order[idx - 1])
      if (m != null && center < m) target = idx - 1
    }
    if (target === idx && idx < order.length - 1) {
      const m = midOf(order[idx + 1])
      if (m != null && center > m) target = idx + 1
    }
    if (target === idx) return
    haptic.selection()
    const next = [...order]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    orderRef.current = next // синхронно — следующий кадр видит свежий порядок
    setByLoc(prev => {
      const n = { ...prev, [activeLoc]: prev[activeLoc].map(dd => [...dd]) }
      n[activeLoc][activeIdx] = next
      return n
    })
  }

  const handleDragStart = (e, exId) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const wrap = rowGeoRef.current.get(exId)
    if (!wrap) return
    const r = wrap.getBoundingClientRect()
    const data = {
      id: exId,
      pointerY: e.clientY,
      grabOffsetY: e.clientY - r.top,
      left: r.left + HANDLE_COL_PX,
      width: r.width - HANDLE_COL_PX,
      height: r.height
    }
    dragRef.current = data
    setDrag(data)
    haptic.medium()
  }

  // pointermove троттлим до одного раза за кадр (не молотим замеры/реордер по
  // несколько раз на кадр — отсюда были лаги и «скакание»).
  const handleDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    d.pointerY = e.clientY
    if (!dragRafRef.current) {
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = 0
        positionClone()
        updateOrder()
      })
    }
  }

  const handleDragEnd = (e) => {
    if (!dragRef.current) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = 0 }
    dragRef.current = null
    setDrag(null)
    haptic.light()
  }

  // Доезд соседей на новые места (FLIP) через Web Animations API: меряем offsetTop
  // (не зависит от transform/скролла), и на сдвиг запускаем el.animate от старого
  // смещения к нулю. WAAPI сам ведёт жизненный цикл — нет гонки сброса transform
  // (из-за неё были рывки). Активный плейсхолдер не анимируем — его ведёт клон.
  useLayoutEffect(() => {
    const prev = flipPrevRef.current
    const nextTops = new Map()
    const activeId = dragRef.current?.id
    rowGeoRef.current.forEach((el, exId) => {
      if (!el) return
      const top = el.offsetTop
      nextTops.set(exId, top)
      if (exId === activeId) return
      const old = prev.get(exId)
      if (old == null) return
      const delta = old - top
      if (Math.abs(delta) < 1) return
      const running = flipAnimRef.current.get(exId)
      if (running) running.cancel()
      const anim = el.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
        { duration: 170, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      )
      flipAnimRef.current.set(exId, anim)
      anim.onfinish = () => { if (flipAnimRef.current.get(exId) === anim) flipAnimRef.current.delete(exId) }
    })
    flipPrevRef.current = nextTops
    positionClone() // top клона — только императивно (в style его нет)
  })

  useEffect(() => () => {
    if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current)
  }, [])

  // Внутренность карточки упражнения — общий рендер для строки списка и для
  // летящего клона (чтобы клон выглядел один в один).
  const renderExCardInner = (ex, exId) => {
    const c = getMuscleGroupColors(ex?.muscle_group)
    const subLabel = toTitleCase(
      SUB_GROUP_LABELS[ex?.sub_group] || ex?.sub_group ||
      MUSCLE_GROUP_LABELS[ex?.muscle_group] || ex?.muscle_group || ''
    )
    return (
      <>
        <div style={styles.exPreview}>
          {ex?.preview_url
            ? <img src={ex.preview_url} alt="" style={styles.exPreviewImg} draggable={false} />
            : <div style={styles.exPreviewPlaceholder}>💪</div>}
        </div>
        <div style={styles.exContent}>
          <div style={styles.exName}>{ex?.name || exId}</div>
          {ex && subLabel && (
            <div style={styles.exTags}>
              <span style={{ ...styles.exTag, background: c.tag, color: '#fff' }}>{subLabel}</span>
            </div>
          )}
        </div>
        <button onClick={() => handleRemove(exId)} className="press-tile press-danger" style={styles.removeBtn} aria-label="Удалить">✕</button>
      </>
    )
  }

  return (
    <div className="page page-enter" style={styles.page}>
      <ScreenTitle>{isEdit ? 'Редактировать' : 'Своя программа'}</ScreenTitle>

      <div style={styles.section}>
        <div style={styles.secLabel}>НАЗВАНИЕ</div>
        {/* Hug-блок: ширина по плейсхолдеру, растёт по тексту в одну строку
            (size в символах). Форма как неактивный таб-бар (без выделения). */}
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          placeholder={NAME_PLACEHOLDER}
          maxLength={NAME_MAX}
          size={Math.max(name.length, NAME_PLACEHOLDER.length)}
          style={styles.nameInput}
        />
      </div>

      {/* Количество дней */}
      <div style={styles.section}>
        <div style={styles.secLabel}>ДНЕЙ В ПРОГРАММЕ</div>
        <div style={styles.placeRow}>
          {[1, 2, 3].map(n => {
            const active = dayCount === n
            // Выбранное число — в контейнере-таб-баре (залито), остальные —
            // голым текстом снаружи (как одно выбранное место среди прочих).
            if (active) {
              return (
                <div key={n} style={{ ...styles.segGroup, width: 'auto' }}>
                  <button
                    onClick={() => changeDayCount(n)}
                    className="press-tile"
                    style={{
                      ...styles.segItem, ...styles.segItemActive,
                      flex: '0 0 auto', padding: '0 22px',
                      color: 'var(--color-primary)', fontSize: '24px'
                    }}
                  >
                    {n}
                  </button>
                </div>
              )
            }
            return (
              <button
                key={n}
                onClick={() => changeDayCount(n)}
                className="press-tile"
                style={{ ...styles.placeBare, fontSize: '20px' }}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>

      {/* Место (Зал/Дом/Улица) — «таб-бар на одну активную позицию»: заполненные
          места + активное собраны в контейнер-таб-бар (фон/обводка из таб-бара),
          активная позиция залита (surface-active). Пустые неактивные места — голым
          текстом снаружи (как невыбранные табы). Контейнера нет, пока не тапнули. */}
      <div style={styles.section}>
        <div style={styles.secLabel}>МЕСТО</div>
        <div style={styles.placeRow}>
          {inContainerPlaces.length > 0 && (
            <div style={{ ...styles.segGroup, width: 'auto' }}>
              {inContainerPlaces.map((loc, i) => {
                const meta = getPlaceMeta(loc)
                const active = activeLoc === loc
                return (
                  <button
                    key={loc}
                    onClick={() => changeLoc(loc)}
                    className="press-tile"
                    style={{
                      ...styles.segItem,
                      ...(active ? styles.segItemActive : {}),
                      flex: '0 0 auto',
                      padding: '0 16px',
                      marginLeft: i === 0 ? 0 : '-5px',
                      zIndex: active ? 2 : 1,
                      // Активное место — цвет самого места (зал — оранжевый,
                      // дом — синий, улица — зелёный); красятся текст и иконка
                      // (UiIcon наследует currentColor). Неактивные — как были.
                      color: active ? meta.color : 'var(--color-text-inactive)',
                      fontSize: active ? '15px' : '13px'
                    }}
                  >
                    <UiIcon name={meta.icon} size={21} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          )}
          {outsidePlaces.map(loc => {
            const meta = getPlaceMeta(loc)
            return (
              <button
                key={loc}
                onClick={() => changeLoc(loc)}
                className="press-tile"
                style={styles.placeBare}
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
        <div style={styles.segGroup}>
          {LETTERS.slice(0, dayCount).map((letter, idx) => {
            const active = activeIdx === idx
            const count = byLoc[activeLoc]?.[idx]?.length || 0
            return (
              <button
                key={letter}
                onClick={() => { haptic.light(); setActiveIdx(idx) }}
                className="press-tile"
                style={{
                  ...styles.segItem,
                  ...(active ? styles.segItemActive : {}),
                  fontWeight: 800,
                  marginLeft: idx === 0 ? 0 : '-5px',
                  zIndex: active ? 2 : 1,
                  color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)'
                }}
              >
                <span style={{ fontSize: active ? '24px' : '20px' }}>{letter}</span>
                <span style={{ ...styles.dayPillCount, color: active ? 'var(--color-primary)' : 'inherit', fontSize: active ? '13px' : '12px' }}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Список упражнений дня — сгруппирован по основной группе мышц: по центру
          заголовок группы (СПИНА / ГРУДЬ / …) в цвете группы, под ним её
          упражнения. На карточке — один тег подгруппы в цвете группы (как
          заголовок на дне тренировки). Заголовки и строки идут плоско в одном
          контейнере, чтобы перетаскивание между группами не пересоздавало узлы. */}
      <div style={styles.secLabel}>УПРАЖНЕНИЯ</div>
      <div ref={dayListRef} style={styles.dayList}>
        {currentDay.length === 0 && (
          <div style={styles.emptyDay}>Пусто. Добавь упражнения кнопкой ниже.</div>
        )}
        {flatNodes.map((node) => {
          if (node.type === 'header') {
            return (
              <h3 key={node.key} style={{ ...styles.groupHeader, color: getMuscleGroupColors(node.group).accent }}>
                {MUSCLE_GROUP_LABELS[node.group] || node.group.toUpperCase()}
              </h3>
            )
          }
          const { exId } = node
          const ex = exMap[exId]
          const isActive = drag?.id === exId
          return (
            <div
              key={exId}
              ref={(el) => { if (el) rowGeoRef.current.set(exId, el); else rowGeoRef.current.delete(exId) }}
              style={styles.exRowWrap}
            >
              <div
                onPointerDown={(e) => handleDragStart(e, exId)}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                style={{ ...styles.dragHandle, opacity: isActive ? 0.3 : 1 }}
                aria-label="Перетащить"
              >
                <GripIcon />
              </div>
              {isActive ? (
                <div style={{ ...styles.exCard, ...styles.exCardPlaceholder, height: drag.height }} />
              ) : (
                <div style={styles.exCard}>
                  {renderExCardInner(ex, exId)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Клон перетаскиваемой карточки — летит за пальцем (fixed). top задаётся
          только императивно (positionClone), в style его нет — иначе re-render при
          смене порядка сбрасывал бы позицию обратно к старту. */}
      {drag && exMap[drag.id] && createPortal(
        <div
          ref={cloneRef}
          style={{
            ...styles.exCard,
            ...styles.exCardDragging,
            position: 'fixed',
            left: drag.left,
            width: drag.width,
            height: drag.height,
            margin: 0,
            transform: 'scale(1.03)',
            zIndex: 80,
            pointerEvents: 'none',
            willChange: 'top'
          }}
        >
          {renderExCardInner(exMap[drag.id], drag.id)}
        </div>,
        document.body
      )}

      {/* Перехватчик тапа при открытой клавиатуре: прозрачный слой поверх всего —
          первый тап только убирает клавиатуру (blur), контрол под ним не срабатывает.
          onClick (а не pointerdown): слой остаётся до конца жеста, поэтому клик не
          «проваливается» на кнопку под ним. */}
      {nameFocused && createPortal(
        <div
          style={styles.kbCatcher}
          onClick={() => nameRef.current?.blur()}
        />,
        document.body
      )}

      {!kbOpen && createPortal(
        <div style={styles.dock}>
          <div className="dock-scrim" />
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
            hug
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

            {/* Две кнопки в ряд (как нативный confirm). «Остаться» — тап мимо
                модалки (overlay onClick). */}
            <div style={styles.exitButtonsRow}>
              <ModalButton
                style={{ flex: 1 }}
                onClick={() => { setConfirmExit(false); haptic.light(); goBack() }}
              >
                Не сохранять
              </ModalButton>
              <ModalButton
                style={{ flex: 1 }}
                onClick={async () => {
                  if (!canSave) {
                    // Нельзя сохранить (пустой день) — подсказываем, остаёмся.
                    haptic.error()
                    window.alert('В каждом дне должно быть хотя бы одно упражнение.')
                    return
                  }
                  setConfirmExit(false)
                  await handleSave()
                }}
              >
                Сохранить
              </ModalButton>
            </div>
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

// Группировка упражнений дня по основной группе мышц (в порядке добавления):
// подряд идущие упражнения одной группы образуют секцию. Сохраняем сквозной
// «плоский» индекс каждого упражнения (idx в currentDay) — на нём держатся
// перетаскивание и удаление. Пока каталог не загружен (нет muscle_group) —
// упражнение попадает в секцию UNKNOWN_GROUP (рисуется без заголовка).
function groupDayByMuscle(dayIds, exMap) {
  const sections = []
  let current = null
  dayIds.forEach((exId, idx) => {
    const mg = exMap[exId]?.muscle_group || UNKNOWN_GROUP
    if (!current || current.muscleGroup !== mg) {
      current = { muscleGroup: mg, items: [] }
      sections.push(current)
    }
    current.items.push({ exId, idx })
  })
  return sections
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
  page: { padding: '0 16px 32px', paddingTop: 'var(--tg-safe-top)', minHeight: '100dvh' },
  dock: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    padding: '40px 16px var(--tabbar-bottom)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
    pointerEvents: 'none',
    zIndex: 40
  },
  kbCatcher: { position: 'fixed', inset: 0, zIndex: 50, background: 'transparent' },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '28px', letterSpacing: '2px', color: 'var(--color-primary)' },
  nameInput: {
    height: '52px', padding: '0 20px', maxWidth: '100%',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)', color: 'var(--color-text)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, outline: 'none'
  },
  section: { marginBottom: '20px' },
  secLabel: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '12px', color: 'var(--color-text-secondary)', letterSpacing: '1.5px', marginBottom: '10px' },
  // Контейнер-таб-бар (как нижний таб-бар приложения): фон surface-dim + тонкая
  // обводка + блюр + тень, паддинг 4. Для дней-в-программе и дней — на всю ширину
  // (табы flex:1); для мест — width:auto (обнимает заполненные/активное).
  segGroup: {
    display: 'flex', alignItems: 'center', gap: 0, padding: '4px', width: '100%',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)', WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)'
  },
  // Таб внутри контейнера: прозрачный (как неактивный таб), активный залит
  // (surface-active). Увеличивается только текст, не сам таб. Нахлёст -5 задаётся
  // инлайн (marginLeft), активный поверх соседей (zIndex).
  segItem: {
    flex: 1, minWidth: 0, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    alignSelf: 'stretch', minHeight: '44px', padding: '0 8px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease, font-size 0.18s ease'
  },
  segItemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  },
  // Ряд мест: контейнер-таб-бар (заполненные/активное) + голые места снаружи.
  placeRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  // Голое место снаружи контейнера — просто текст+иконка, приглушённый (как
  // невыбранный таб без контейнера).
  placeBare: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', minHeight: '44px',
    background: 'transparent', border: 'none',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px',
    color: 'rgba(255, 255, 255, 0.3)', whiteSpace: 'nowrap',
    transition: 'color 0.18s ease'
  },
  dayPillCount: { fontFamily: 'var(--font-manrope)', fontWeight: 700, opacity: 0.8, transition: 'color 0.18s ease, font-size 0.18s ease' },
  // Плоский список: заголовки и строки — соседи с gap 10; у заголовка свой верхний
  // отступ, чтобы группы визуально отделялись (кроме первого — :first-child убирать
  // незачем, лишние 8px сверху не мешают).
  // position:relative — чтобы offsetParent строк был именно список (offsetTop меряем
  // относительно него, стабильно к скроллу/трансформам при перетаскивании).
  dayList: { position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', paddingBottom: '0px' },
  // Заголовок группы — по центру, в акцентном цвете группы (как на дне тренировки).
  groupHeader: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px',
    letterSpacing: '2px', textAlign: 'center', margin: 0, padding: '8px 0 2px'
  },
  emptyDay: { textAlign: 'center', padding: '30px 20px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' },
  exRowWrap: { display: 'flex', alignItems: 'center', gap: '6px' },
  exCard: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-card)', borderRadius: 'var(--radius-card)', padding: '12px', minHeight: '90px' },
  exCardDragging: { background: '#2A2A2A', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  // Слот на месте перетаскиваемой карточки — пунктирная рамка, показывает, куда ляжет.
  exCardPlaceholder: { background: 'rgba(255,255,255,0.03)', border: '1.5px dashed rgba(255,255,255,0.18)' },
  dragHandle: { width: '28px', flexShrink: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: 'grab' },
  exPreview: { width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  exPreviewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  exPreviewPlaceholder: { fontSize: '28px', opacity: 0.4 },
  exContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' },
  exName: { fontFamily: 'var(--font-geist)', fontSize: '13px', fontWeight: 700, lineHeight: '16px', color: 'var(--color-text)' },
  exTags: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  exTag: { display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.2px', lineHeight: '13px', whiteSpace: 'nowrap' },
  removeBtn: { width: '36px', height: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, paddingBottom: '1px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', color: 'var(--color-text-secondary)', fontSize: '18px', fontWeight: 700 },
  addButton: {
    width: 'auto', height: '55px', flexShrink: 0, padding: '0 36px',
    border: '1.5px dashed rgba(255,255,255,0.18)', borderRadius: 'var(--radius-pill)',
    background: 'rgba(34,34,34,0.55)', color: 'var(--color-text-secondary)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, letterSpacing: '1px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
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
    borderRadius: 'var(--radius-card)',
    padding: '24px 18px 18px',
    display: 'flex', flexDirection: 'column', gap: '8px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)'
  },
  exitTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 800,
    color: 'var(--color-text)', textAlign: 'center'
  },
  exitText: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text)', textAlign: 'center', marginBottom: '14px'
  },
  exitButtonsRow: {
    display: 'flex', gap: '10px', width: '100%'
  }
}