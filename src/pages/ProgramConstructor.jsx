import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getProgramBySlug, PLACES, getPlaceMeta } from '../features/programs/registry'
import { loadExerciseCatalog, saveMyProgram } from '../features/programs/customProgram'
import { exerciseTagLabel } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { isCustomExercise, loadMyExercises, getMyExercisesSync } from '../features/programs/userExercises'
import ExercisePicker from '../components/ExercisePicker'
import ActionButton from '../components/ActionButton'
import ConfirmModal from '../components/ConfirmModal'
import ScreenTitle from '../components/ScreenTitle'
import UiIcon from '../components/UiIcon'
import SlotsCount from '../components/SlotsCount'
import { SectionLabel } from '../components/GroupLabel'
import ExercisePlaceholder from '../components/ExercisePlaceholder'
import PencilIcon from '../components/PencilIcon'
import MarqueeTag from '../components/MarqueeTag'
import { pluralizeExercises } from '../utils/plural'
import EmptyState from '../components/EmptyState'
import { getQuickSet, getQuickSetSync, setQuickSet } from '../lib/quick-workout'
import RocketIcon from '../components/RocketIcon'
import QuickPickList from '../components/QuickPickList'
import { goal, GOALS } from '../lib/metrika'

const LETTERS = ['A', 'B', 'C']
// Лимит упражнений на день. Поднят с 10 до 12: последние позиции дня — мелочь
// (руки, приводящие/отводящие, икры, пресс), их объединяют в суперсеты и они
// почти не удлиняют тренировку. Второе место лимита — RPC api_save_my_program
// (проверка `v_order > 12`), менять оба разом.
const MAX_PER_DAY = 12
// Авто-скролл при перетаскивании у краёв экрана: зоны (px от верх/низ вьюпорта) и
// макс. скорость (px/кадр) — чтобы дотащить карточку до верха/низа списка.
const EDGE_TOP_PX = 110     // под системными кнопками Telegram
const EDGE_BOTTOM_PX = 130  // над доком кнопки «Сохранить»
const EDGE_MAX_SPEED = 14
// Зазор между строками списка. Числом, а не токеном: его же использует расчёт
// шага перетаскивания (stride), а из CSS-переменной число не достать. Раньше
// стиль брал --space-2 (8px), а stride был зашит на 10 — на длинном дне карточка
// уезжала мимо цели. Меняешь одно — меняется и второе.
const ROW_GAP = 8              // = --space-2
const NAME_MAX = 24            // лимит длины названия (фронт) — чтоб влезало в строку
const NAME_PLACEHOLDER = 'Введите название'
// Конструктор всегда правит СВОЮ программу (slug 'my') — набор быстрой
// сохраняется под тем же слагом, что и сама программа.
const QUICK_SLUG = 'my'
// Вкладки списка упражнений. «Все» — состав дня (добавить/удалить/переставить),
// «Быстрая» — отметить, что войдёт в короткую версию.
const LIST_MODES = [
  { key: 'all', label: 'Все' },
  { key: 'quick', label: 'Быстрый режим' }
]

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

  const [name, setName] = useState(existing?.title || '')
  const [dayCount, setDayCount] = useState(() => {
    const n = existing?.days_count || (existing ? Object.keys(existing.data?.days || {}).length : 1)
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
  // Вкладка списка: «Все» (правим состав дня) или «Быстрая» (отмечаем, что войдёт
  // в короткую версию). По умолчанию ВСЕГДА «Все» — быстрая это донастройка,
  // а не то, с чем открывают конструктор.
  const [listMode, setListMode] = useState('all')   // 'all' | 'quick'
  // Набор быстрой для ТЕКУЩЕГО места+дня. null = ещё не настраивали → считаем,
  // что отмечено всё (в этом режиме удобнее снимать лишнее, чем набирать с нуля).
  const [quickIds, setQuickIds] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [confirmDrop, setConfirmDrop] = useState(null)   // { n, lost } — убавляем дни с данными
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

  // Каталог приложения и свои упражнения держим раздельно: свои меняются прямо
  // в пикере (завёл, переименовал, удалил), и их надо перечитывать, а каталог —
  // нет. Слитый справочник — то, из чего строка дня берёт имя и тег.
  const [sysCatalog, setSysCatalog] = useState([])
  const [myCatalog, setMyCatalog] = useState(getMyExercisesSync)
  const catalog = useMemo(() => [...sysCatalog, ...myCatalog], [sysCatalog, myCatalog])
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
  const [drag, setDrag] = useState(null) // { startIndex, targetIndex, dy, stride, startY, startScrollY, pointerY, len }
  const dragRef = useRef(null)
  const rowRefs = useRef([])
  const autoScrollRef = useRef(0)        // rAF-петля авто-скролла у краёв

  useEffect(() => {
    // Пока открыт пикер, «Назад» принадлежит ему: у него внутри своя глубина
    // (форма своего упражнения), и он сам решает, на какой шаг возвращать.
    if (pickerOpen) return
    backButton.setHandler(() => {
      if (isDirty()) setConfirmExit(true)
      else goBack()
    })
    lockVerticalSwipes()
    // isDirty читает name/byLoc на момент тапа через замыкание эффекта —
    // поэтому держим их в зависимостях, чтобы handler был свежий.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, pickerOpen, name, byLoc])

  useEffect(() => {
    let cancelled = false
    loadExerciseCatalog().then(list => { if (!cancelled) setSysCatalog(list) })
    return () => { cancelled = true }
  }, [])

  // Свои перечитываем и на входе, и на КАЖДОЕ закрытие пикера. Без второго
  // упражнение, заведённое только что, приходило в день голым `ux_16` без тега:
  // справочник был снят до того, как оно появилось.
  useEffect(() => {
    if (pickerOpen) return
    let cancelled = false
    loadMyExercises().then(list => { if (!cancelled) setMyCatalog(list) })
    return () => { cancelled = true }
  }, [pickerOpen])
  
  // Набор быстрой перечитываем на каждую смену места/дня: он хранится отдельно
  // для каждой пары (в разных днях важное разное).
  useEffect(() => {
    const day = LETTERS[activeIdx]
    setQuickIds(getQuickSetSync(QUICK_SLUG, activeLoc, day))
    let alive = true
    getQuickSet(QUICK_SLUG, activeLoc, day).then(v => { if (alive) setQuickIds(v) })
    return () => { alive = false }
  }, [activeLoc, activeIdx])

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


  // Сколько упражнений пропадёт, если оставить n дней. Считаем по ВСЕМ местам:
  // день C может быть пустым в зале и собранным дома.
  const exercisesBeyond = (n) => PLACES.reduce((sum, loc) => {
    const arr = byLoc[loc] || []
    return sum + arr.slice(n).reduce((k, day) => k + day.length, 0)
  }, 0)

  const changeDayCount = (n) => {
    if (n === dayCount) return
    // Убавляем дни и в отрезаемых что-то собрано — спрашиваем. Молча стирать
    // чужую работу нельзя, а отменить это действие потом нечем: конструктор
    // хранит только текущее состояние. В обратную сторону (дней больше) ничего
    // не теряется, там подтверждение было бы шумом.
    const lost = n < dayCount ? exercisesBeyond(n) : 0
    if (lost > 0) { haptic.error(); setConfirmDrop({ n, lost }); return }
    applyDayCount(n)
  }

  const applyDayCount = (n) => {
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
      goal(GOALS.PROGRAM_CREATE, { days: dayCount })
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

  // Не настраивали — считаем отмеченным весь день. Так вкладка открывается
  // «всё включено», и человек снимает лишнее, а не собирает список заново.
  const quickSelected = quickIds || currentDay
  const isQuickPicked = (exId) => quickSelected.includes(exId)
  const toggleQuick = (exId) => {
    haptic.selection()
    const next = isQuickPicked(exId)
      ? quickSelected.filter(id => id !== exId)
      : [...quickSelected, exId]
    setQuickIds(next)
    setQuickSet(QUICK_SLUG, activeLoc, LETTERS[activeIdx], next, currentDay.length)
  }
  const atLimit = currentDay.length >= MAX_PER_DAY

  // Упражнения дня, сгруппированные по основной группе мышц (по порядку
  // добавления). Заголовки секций и единый тег-подгруппа держатся на этом.

  // Места внутри контейнера-таб-бара (заполненные + активное после тапа) и
  // снаружи (пустые неактивные — голым текстом, как невыбранные табы).
  const inContainerPlaces = PLACES.filter(loc => placeFilled(loc) || (loc === activeLoc && placeTouched))
  const outsidePlaces = PLACES.filter(loc => !inContainerPlaces.includes(loc))

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
    const stride = (el?.offsetHeight || 90) + ROW_GAP // высота строки + зазор списка
    const len = (byLoc[activeLoc]?.[activeIdx] || []).length
    const data = {
      startIndex: idx, targetIndex: idx, dy: 0, stride,
      startY: e.clientY, startScrollY: window.scrollY, pointerY: e.clientY, len
    }
    dragRef.current = data
    setDrag(data)
    haptic.medium()
    startAutoScroll()
  }

  // Пересчёт позиции из текущего пальца + текущего скролла (dy включает сдвиг
  // страницы, чтобы карточка шла за пальцем даже когда авто-скролл крутит список).
  const applyDrag = () => {
    const d = dragRef.current
    if (!d) return
    const dy = (d.pointerY - d.startY) + (window.scrollY - d.startScrollY)
    let targetIndex = d.startIndex + Math.round(dy / d.stride)
    targetIndex = Math.max(0, Math.min(d.len - 1, targetIndex))
    if (targetIndex !== d.targetIndex) haptic.selection()
    const next = { ...d, dy, targetIndex }
    dragRef.current = next
    setDrag(next)
  }

  const handleDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    d.pointerY = e.clientY
    applyDrag()
  }

  const handleDragEnd = (e) => {
    const d = dragRef.current
    if (!d) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    stopAutoScroll()
    if (d.targetIndex !== d.startIndex) moveItem(d.startIndex, d.targetIndex)
    dragRef.current = null
    setDrag(null)
  }

  // Палец у верх/низ края → плавно подкручиваем страницу, пока тащим (даёт дотащить
  // карточку до самого верха/низа списка). Палец стоит — список едет под ним,
  // applyDrag держит карточку у пальца и пересчитывает позицию вставки.
  const startAutoScroll = () => {
    if (autoScrollRef.current) return
    const tick = () => {
      const d = dragRef.current
      if (!d) { autoScrollRef.current = 0; return }
      const y = d.pointerY
      const vh = window.innerHeight
      let speed = 0
      if (y < EDGE_TOP_PX) speed = -EDGE_MAX_SPEED * Math.min(1, (EDGE_TOP_PX - y) / EDGE_TOP_PX)
      else if (y > vh - EDGE_BOTTOM_PX) speed = EDGE_MAX_SPEED * Math.min(1, (y - (vh - EDGE_BOTTOM_PX)) / EDGE_BOTTOM_PX)
      if (speed !== 0) {
        const before = window.scrollY
        window.scrollBy(0, speed)
        if (window.scrollY !== before) applyDrag()
      }
      autoScrollRef.current = requestAnimationFrame(tick)
    }
    autoScrollRef.current = requestAnimationFrame(tick)
  }

  const stopAutoScroll = () => {
    if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = 0 }
  }

  useEffect(() => () => stopAutoScroll(), [])

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
      {/* Пикер открывается поверх и ставит СВОЙ заголовок — иначе два встали бы
          друг на друга в одной полосе. */}
      {/* Один заголовок на оба режима: человек и в первый раз, и при правке
          находится в одном и том же месте — своей программе. «Редактировать»
          называло действие, а заголовок должен называть экран. */}
      {!pickerOpen && <ScreenTitle>Моя программа</ScreenTitle>}

      <div style={styles.section}>
        <SectionLabel caps>НАЗВАНИЕ</SectionLabel>
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
        <SectionLabel caps>ДНЕЙ В ПРОГРАММЕ</SectionLabel>
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
                      flex: '0 0 auto', padding: '0 var(--space-6)',
                      color: 'var(--color-primary)', fontSize: 'var(--text-heading-size)'
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
                style={{ ...styles.placeBare, fontSize: 'var(--text-heading-size)' }}
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
        <SectionLabel caps>МЕСТО</SectionLabel>
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
                      padding: '0 var(--space-4)',
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
        <SectionLabel caps>ДНИ</SectionLabel>
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
          заголовок на дне тренировки). Перетаскивание/удаление работают по
          сквозному «плоскому» индексу (idx в currentDay). */}
      <SectionLabel caps>УПРАЖНЕНИЯ</SectionLabel>

      {/* Вкладка списка — тот же сегмент-контрол, что у мест: «Все» правит состав
          дня, «Быстрая» отмечает, что войдёт в короткую версию тренировки. */}
      <div style={styles.modeRow}>
      <div style={{ ...styles.segGroup, width: 'auto' }}>
        {LIST_MODES.map((mode, i) => {
          const active = listMode === mode.key
          return (
            <button
              key={mode.key}
              onClick={() => { haptic.light(); setListMode(mode.key) }}
              className="press-tile"
              style={{
                ...styles.segItem,
                ...(active ? styles.segItemActive : {}),
                flex: '0 0 auto',
                padding: '0 var(--space-4)',
                marginLeft: i === 0 ? 0 : '-5px',
                zIndex: active ? 2 : 1,
                color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)'
              }}
            >
              {mode.key === 'quick' && <RocketIcon size={15} lit={active} />}
              {mode.label}
            </button>
          )
        })}
      </div>
      </div>

      <div style={styles.dayList}>
        {currentDay.length === 0 && (
          // Своя обёртка вместо просторных отступов EmptyState: тот рассчитан на
          // пустой экран целиком, а здесь под пустым днём сразу идёт кнопка
          // «Добавить», и текст проваливался вниз, отрываясь от переключателя.
          <div style={styles.emptyDay}>
            <EmptyState
              compact
              title="В этом дне пусто"
              hint="Добавь упражнения кнопкой внизу — их можно будет переставить перетаскиванием."
            />
          </div>
        )}
        {listMode === 'quick' ? (
          <QuickPickList
            items={currentDay.map(id => ({ id, exercise: exMap[id] }))}
            picked={quickSelected}
            onToggle={toggleQuick}
          />
        ) : currentDay.map((exId, idx) => {
          const ex = exMap[exId]
          const custom = isCustomExercise(exId)
          const c = getMuscleGroupColors(ex?.muscle_group, custom)
          const isDragging = drag?.startIndex === idx
          const tagLabel = exerciseTagLabel(ex?.muscle_group, ex?.sub_group)
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
                    : <ExercisePlaceholder size={24} />}
                </div>
                <div style={styles.exContent}>
                  <div style={styles.exName}>
                    {ex?.name || exId}
                    {custom && <span style={styles.exPencil}><PencilIcon size={13} color="var(--color-text-secondary)" /></span>}
                  </div>
                  {ex && tagLabel && (
                    <div style={styles.exTags}>
                      {/* Многоточие без прокатки: справа крестик удаления, и тег
                          не должен на него налезать. Прокатывать тут нечего —
                          строка ещё и таскается за ручку, лишний тап-жест на ней
                          спорил бы с перетаскиванием. */}
                      <MarqueeTag
                        label={tagLabel}
                        background={c.tag}
                        color="var(--color-text)"
                        style={styles.exTag}
                      />
                    </div>
                  )}
                </div>
                <button onClick={() => handleRemove(exId)} className="press-tile press-danger" style={styles.removeBtn} aria-label="Удалить">✕</button>
              </div>
            </div>
          )
        })}

        {/* Кнопка добавления — в потоке, под последним упражнением (а не прибита к
            низу). При пустом дне идёт под подсказкой «Пусто…». Лимит — тот же тост. */}
        {listMode === 'all' && (
        <div style={styles.addRow}>
          {/* Лимит — красным (это стоп), обычное состояние — акцентным зелёным. */}
          <ActionButton
            onClick={handleAddTap}
            variant="tonal"
            bordered
            hug
            style={atLimit ? { color: 'var(--color-error)' } : null}
          >
            {/* Плюс — только у живого действия: при лимите добавлять нечего,
                и знак «+» рядом со «стоп»-текстом противоречил бы сам себе. */}
            {!atLimit && <UiIcon name="add" size={20} color="var(--color-primary)" />}
            {/* Счётчик — отдельным узлом: набранное красится акцентом, лимит
                остаётся серым (SlotsCount). При достигнутом лимите текст цельно
                красный — это состояние «стоп», делить его цветами незачем. */}
            {atLimit
              ? `Достигнут лимит ${MAX_PER_DAY}/${MAX_PER_DAY}`
              : <>Добавить <SlotsCount value={currentDay.length} max={MAX_PER_DAY} /></>}
          </ActionButton>
        </div>
        )}
      </div>

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
          <ActionButton
            onClick={handleSave}
            disabled={!canSave}
            variant="primary"
            hug
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
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

      {/* Убавили дни, а в отрезаемых собраны упражнения. Называем цифру: «два
          упражнения» человек соотнесёт со своей работой, «данные будут удалены» —
          нет. «Оставить как есть» — тап мимо модалки. */}
      {confirmDrop && (
        <ConfirmModal
          title={`Удалить день ${LETTERS[confirmDrop.n]}?`}
          text={`В нём собрано ${confirmDrop.lost} ${pluralizeExercises(confirmDrop.lost)}. Уменьшив число дней, ты их потеряешь.`}
          onClose={() => setConfirmDrop(null)}
          actions={[
            { label: 'Отмена', onClick: () => setConfirmDrop(null) },
            {
              label: 'Удалить',
              danger: true,
              onClick: () => { const n = confirmDrop.n; setConfirmDrop(null); applyDayCount(n) }
            }
          ]}
        />
      )}

      {/* «Остаться» — тап мимо модалки. */}
      {confirmExit && (
        <ConfirmModal
          title="Сохранить изменения?"
          text="В программе есть несохранённые изменения."
          onClose={() => setConfirmExit(false)}
          actions={[
            { label: 'Не сохранять', onClick: () => { setConfirmExit(false); haptic.light(); goBack() } },
            {
              label: 'Сохранить',
              onClick: async () => {
                if (!canSave) {
                  // Нельзя сохранить (пустой день) — подсказываем, остаёмся.
                  haptic.error()
                  window.alert('В каждом дне должно быть хотя бы одно упражнение.')
                  return
                }
                setConfirmExit(false)
                await handleSave()
              }
            }
          ]}
        />
      )}
    </div>
  )
}

// Группировка упражнений дня по основной группе мышц (в порядке добавления):
// подряд идущие упражнения одной группы образуют секцию. Сохраняем сквозной
// «плоский» индекс каждого упражнения (idx в currentDay) — на нём держатся
// перетаскивание и удаление. Пока каталог не загружен (нет muscle_group) —
// упражнение попадает в секцию UNKNOWN_GROUP (рисуется без заголовка).
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
  // Низ — место под прибитый док «Сохранить» (кнопка «Добавить» в потоке,
  // последним элементом списка, прокручивается выше дока).
  // marginBottom гасит таб-баровский padding-bottom у .app (тут таб-бара нет),
  // иначе под контентом копится двойной отступ → «пропасть» ~190px + лишний
  // скролл на коротком списке. Без min-height:100dvh страница ровно по контенту:
  // мало упражнений → не скроллится; много → у низа фикс-зазор (paddingBottom).
  page: {
    padding: '0 var(--space-4)', paddingTop: 'var(--tg-safe-top)', paddingBottom: '100px',
    marginBottom: 'calc(-1 * (var(--tabbar-height) + var(--tabbar-bottom) + 60px))'
  },
  dock: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    padding: 'var(--space-10) var(--space-4) var(--tabbar-bottom)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
    pointerEvents: 'none',
    zIndex: 40
  },
  kbCatcher: { position: 'fixed', inset: 0, zIndex: 50, background: 'transparent' },
  nameInput: {
    height: '52px', padding: '0 var(--space-5)', maxWidth: '100%',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)', color: 'var(--color-text)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700, outline: 'none'
  },
  section: { marginBottom: 'var(--space-5)' },
  // Контейнер-переключатель («Дней в программе», «Место», «Дни») — стеклянная
  // пилюля с хайрлайном, как PeriodSwitcher и переключатель места в дне
  // тренировки. Один язык переключателей на весь проект.
  segGroup: {
    display: 'flex', alignItems: 'center', gap: 0, padding: 'var(--space-1)', width: '100%',
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
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-15)',
    alignSelf: 'stretch', minHeight: '44px', padding: '0 var(--space-2)',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease, font-size 0.18s ease'
  },
  segItemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  },
  // Ряд мест: контейнер-таб-бар (заполненные/активное) + голые места снаружи.
  placeRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' },
  // Голое место снаружи контейнера — просто текст+иконка, приглушённый (как
  // невыбранный таб без контейнера).
  placeBare: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-15)', padding: '0 var(--space-3)', minHeight: '44px',
    background: 'transparent', border: 'none',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-label-size)', letterSpacing: '0.5px',
    color: 'rgba(255, 255, 255, 0.3)', whiteSpace: 'nowrap',
    transition: 'color 0.18s ease'
  },
  dayPillCount: { fontFamily: 'var(--font-manrope)', fontWeight: 700, opacity: 0.8, transition: 'color 0.18s ease, font-size 0.18s ease' },
  // Между секциями групп — больше воздуха (20), внутри секции ряды — 10 (совпадает
  // со страйдом перетаскивания: высота строки + 10).
  // Заголовков групп нет — список сплошной, шаг между строками ROW_GAP
  // (тот же, что в расчёте перетаскивания).
  dayList: { display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px`, marginBottom: 'var(--space-4)', paddingBottom: '0px' },
  exRowWrap: { display: 'flex', alignItems: 'center', gap: 'var(--space-15)' },
  exCard: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--color-card)', borderRadius: 'var(--radius-card)', padding: 'var(--space-3)', minHeight: '90px' },
  // Отметка «входит в быструю» — круглая, как икон-кнопки проекта (36px).
  exCardDragging: { background: '#2A2A2A', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  // Переключатель режима — по содержимому, а не во всю ширину.
  modeRow: { display: 'flex', marginBottom: 'var(--space-3)' },
  dragHandle: { width: '28px', flexShrink: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: 'grab' },
  exPreview: { width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)', overflow: 'hidden', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  exPreviewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  exContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' },
  exName: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-label-size)', fontWeight: 700, lineHeight: '16px', color: 'var(--color-text)' },
  exPencil: { display: 'inline-flex', verticalAlign: 'middle', marginLeft: 'var(--space-15)' },
  exTags: { display: 'flex', gap: 'var(--space-15)', minWidth: 0, maxWidth: '100%' },
  // Форма пилюли — в MarqueeTag; здесь только приглушение и мелкий шрифт строки.
  exTag: { padding: 'var(--space-05) var(--space-2)', fontSize: 'var(--text-caption-size)', letterSpacing: '0.2px', lineHeight: '13px', opacity: 0.7 },
  removeBtn: { width: '36px', height: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, paddingBottom: '1px', background: 'var(--highlight-recent)', border: 'none', borderRadius: '50%', color: 'var(--color-text-secondary)', fontSize: 'var(--text-title-size)', fontWeight: 700, WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' },
  // «Добавить упражнения» — общий ActionButton (variant neutral, hug), как
  // «Завершить» в дне тренировки: своей вёрстки у кнопки больше нет.
  // 20px сверху и снизу: текст стоит на таком же расстоянии от переключателя
  // режима, как встала бы первая карточка, и столько же до кнопки «Добавить».
  emptyDay: { margin: '20px 0' },
  addRow: { display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-1)' },
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
    padding: 'var(--space-3) var(--space-4)',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-medium)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    lineHeight: 1.35,
    color: 'var(--color-error)',
    textAlign: 'center'
  },
}