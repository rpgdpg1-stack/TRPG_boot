import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { loadExerciseCatalog } from '../features/programs/customProgram'
import { MUSCLE_GROUP_LABELS, SUB_GROUP_LABELS, exerciseTagLabel, titleCase } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import {
  loadMyExercises, getMyExercisesSync, createMyExercise, updateMyExercise,
  deleteMyExercise, MY_EXERCISE_LIMIT
} from '../features/programs/userExercises'
import { haptic, backButton } from '../lib/telegram'
import ActionButton from './ActionButton'
import AnchorMenu from './AnchorMenu'
import ConfirmModal from './ConfirmModal'
import CustomExerciseForm from './CustomExerciseForm'
import PencilIcon from './PencilIcon'
import TrashIcon from './TrashIcon'
import { useScrollLock } from '../lib/use-scroll-lock'
import ExercisePlaceholder from './ExercisePlaceholder'
import ScreenTitle from './ScreenTitle'
import SearchIcon from './SearchIcon'
import ScrollTopButton from './ScrollTopButton'
import UiIcon from './UiIcon'
import CloseCross from './CloseCross'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10

// «Все», а не «Все упражнения»: слово «Упражнения» теперь стоит в навигации
// сверху, и повторять его во вкладке значит говорить одно и то же дважды.
// Плотность «стекла» в пикере. Общий --color-surface-dim (30%) годится таб-бару
// над спокойным фоном, но здесь под шапкой едут карточки с картинками, и подписи
// фильтров сквозь него не читались.
const GLASS = 'rgba(28, 28, 28, 0.78)'

const TABS = [
  { key: 'all', label: 'Все' },
  { key: 'mine', label: 'Мои' }
]

/**
 * Пикер упражнений для конструктора.
 *
 * Полноэкранный оверлей (портал в body). Фильтр: группа мышц → подгруппа + поиск.
 * Порядок групп/подгрупп — как в каталоге (сортировка по id). Без фильтра уже
 * выбранные упражнения поднимаются наверх списка.
 *
 * ДВЕ ВКЛАДКИ: «Все упражнения» — каталог приложения, «Мои» — то, что человек
 * завёл сам. Заведение живёт именно здесь, а не отдельным пунктом в профиле:
 * нужда в своём упражнении возникает ровно в момент сборки дня — «нужного нет».
 * Уводить за этим на другой экран и заставлять возвращаться значит ломать
 * главный сценарий ради аккуратности меню.
 *
 * В «Моих» поиска и фильтров нет намеренно: там максимум дюжина карточек,
 * фильтровать нечего. Карточки те же по размеру — это один список, не две разные
 * сущности.
 */
export default function ExercisePicker({ excludeIds, atLimit, count, max, onToggle, onDone }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState(null)
  const [activeSub, setActiveSub] = useState(null)
  const [limitRowId, setLimitRowId] = useState(null)
  const [limitNonce, setLimitNonce] = useState(0)
  const inputRef = useRef(null)
  const limitTimer = useRef(null)

  // Вкладка и всё, что относится к своим упражнениям.
  const [tab, setTab] = useState('all')
  const [mine, setMine] = useState(getMyExercisesSync)
  const [form, setForm] = useState(null)        // { mode:'new' } | { mode:'edit', ex }
  const [menu, setMenu] = useState(null)        // { rect, ex } — меню долгого нажатия
  const [confirmDel, setConfirmDel] = useState(null)
  const [formDirty, setFormDirty] = useState(false)
  const [confirmFormExit, setConfirmFormExit] = useState(false)
  const formSubmit = useRef(null)
  const [mineError, setMineError] = useState('')
  const longTimer = useRef(null)
  const pressStart = useRef({ x: 0, y: 0 })

  // Шапка: закреплена поверх прозрачного списка. Вкладки видны всегда, а поиск
  // и фильтры сворачиваются при прокрутке вниз и возвращаются от первого же
  // движения вверх — как навигация в iOS и Telegram.
  const listRef = useRef(null)
  const headRef = useRef(null)
  const [headH, setHeadH] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const lastY = useRef(0)
  // Пока открыта клавиатура (и ~350мс после закрытия) тап по фильтру ТОЛЬКО
  // убирает клавиатуру. Иначе первый же промах по чипу и закрывал клавиатуру,
  // и менял фильтр — человек этого не просил.
  const kbGuardUntil = useRef(0)

  const excluded = useMemo(
    () => (excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])),
    [excludeIds]
  )

  // Крестик нужен, только когда есть что отменять: курсор в поле или введён
  // текст. Иначе он висел бы всегда и читался как «закрыть пикер».
  const showClear = searchFocused || !!search

  const handleClearSearch = () => {
    haptic.selection()
    setSearch('')
    setSearchFocused(false)
    try { inputRef.current?.blur() } catch { /* ignore */ }
  }

  // Пока пикер открыт, системная «Назад» принадлежит ЕМУ. Из формы она
  // возвращает в список упражнений, а не выкидывает в конструктор: человек
  // пришёл сюда из пикера и ждёт возврата на шаг, а не на два.
  useEffect(() => {
    backButton.setHandler(() => {
      if (form) {
        if (formDirty) setConfirmFormExit(true)
        else setForm(null)
        return
      }
      onDone?.()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, formDirty])

  useEffect(() => {
    let cancelled = false
    loadExerciseCatalog().then(list => {
      if (!cancelled) {
        setCatalog(list)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadMyExercises().then(list => { if (!cancelled) setMine(list) })
    return () => { cancelled = true }
  }, [])

  // Долгое нажатие по своей карточке — меню «Редактировать / Удалить», тот же
  // жест и тот же AnchorMenu, что у программы на главной и у строки друга.
  // Допуск на смещение обязателен: палец на удержании всегда чуть плывёт, и без
  // допуска меню не открывалось бы, а список при этом должен листаться свободно.
  const startLongPress = (e, ex) => {
    const el = e.currentTarget
    pressStart.current = { x: e.clientX, y: e.clientY }
    if (longTimer.current) clearTimeout(longTimer.current)
    longTimer.current = setTimeout(() => {
      haptic.medium()
      setMenu({ rect: el.getBoundingClientRect(), ex })
    }, LONG_PRESS_MS)
  }
  const moveLongPress = (e) => {
    if (!longTimer.current) return
    if (Math.abs(e.clientX - pressStart.current.x) > MOVE_TOLERANCE_PX ||
        Math.abs(e.clientY - pressStart.current.y) > MOVE_TOLERANCE_PX) cancelLongPress()
  }
  const cancelLongPress = () => { if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null } }
  useEffect(() => cancelLongPress, [])

  // Высота шапки задаёт верхний отступ списка: под ней контент виден насквозь,
  // но начинаться должен ниже. Меряем, а не задаём числом — состав шапки разный
  // на вкладках и при открытой панели подгрупп.
  useEffect(() => {
    const el = headRef.current
    if (!el) return
    const measure = () => setHeadH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab, activeGroup, searchFocused, search])

  useEffect(() => {
    const box = listRef.current
    if (!box) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = box.scrollTop
        const dy = y - lastY.current
        lastY.current = y
        // У самой кромки шапка всегда развёрнута — иначе она «залипала» бы
        // свёрнутой на коротких списках.
        if (y <= 8) { setCollapsed(false); return }
        if (dy > 4) setCollapsed(true)
        else if (dy < -4) setCollapsed(false)
      })
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => { box.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [tab])

  // Смена вкладки/фильтра начинает список сначала — и прокрутку, и шапку.
  useEffect(() => {
    setCollapsed(false)
    lastY.current = 0
    if (listRef.current) listRef.current.scrollTop = 0
  }, [tab, activeGroup, activeSub, search])

  // Тап мимо поля: убрать клавиатуру и на 350мс проглотить действие под пальцем.
  const dismissKeyboard = () => {
    if (!searchFocused) return false
    try { inputRef.current?.blur() } catch { /* ignore */ }
    kbGuardUntil.current = Date.now() + 350
    return true
  }
  const kbGuarded = () => dismissKeyboard() || Date.now() < kbGuardUntil.current

  const handleFormSave = async (values) => {
    if (form?.mode === 'edit') await updateMyExercise(form.ex.id, values)
    else await createMyExercise(values)
    setMine(await loadMyExercises())
    setFormDirty(false)
    setForm(null)
  }

  const handleDelete = async (ex) => {
    setConfirmDel(null)
    try {
      await deleteMyExercise(ex.id)
      // Упражнение могло стоять в собираемом сейчас дне — снимаем и оттуда,
      // иначе конструктор сохранил бы ссылку на удалённое.
      if (excluded.has(ex.id)) onToggle(ex)
      setMine(await loadMyExercises())
      haptic.success()
    } catch (err) {
      haptic.error()
      setMineError(err?.message || 'Не удалось удалить')
    }
  }

  const atMineLimit = mine.length >= MY_EXERCISE_LIMIT

  // Клавиатура: прячем кнопку сразу, показываем с задержкой при закрытии.
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



  // Группы в порядке появления (каталог отсортирован по id), подгруппы внутри.
  const groups = useMemo(() => {
    const map = new Map()
    const order = []
    for (const e of catalog) {
      if (!map.has(e.muscle_group)) { map.set(e.muscle_group, []); order.push(e.muscle_group) }
      const subs = map.get(e.muscle_group)
      if (!subs.includes(e.sub_group)) subs.push(e.sub_group)
    }
    return order.map(g => ({ group: g, subs: map.get(g) }))
  }, [catalog])

  const activeSubs = useMemo(() => {
    if (!activeGroup) return []
    return groups.find(g => g.group === activeGroup)?.subs || []
  }, [groups, activeGroup])

  const filtered = useMemo(() => {
    let list = catalog
    if (activeGroup) list = list.filter(e => e.muscle_group === activeGroup)
    if (activeSub) list = list.filter(e => e.sub_group === activeSub)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(e => (e.name || '').toLowerCase().includes(q))
    // Без фильтра и поиска — уже выбранные наверх (стабильно, порядок внутри сохраняется).
    if (!activeGroup && !activeSub && !q) {
      list = [...list].sort((a, b) => Number(excluded.has(b.id)) - Number(excluded.has(a.id)))
    }
    return list
    // excluded меняется при каждом тапе галочки — это и двигает выбранное наверх.
  }, [catalog, activeGroup, activeSub, search, excluded])

  const handleGroupTap = (g) => {
    if (kbGuarded()) return
    haptic.light()
    setActiveSub(null)
    setActiveGroup(prev => (prev === g ? null : g))
  }

  const handleToggle = (ex) => {
    const isAdded = excluded.has(ex.id)
    if (!isAdded && atLimit) {
      haptic.error()
      setLimitRowId(ex.id)
      setLimitNonce(n => n + 1)
      if (limitTimer.current) clearTimeout(limitTimer.current)
      limitTimer.current = setTimeout(() => setLimitRowId(null), 2600)
      return
    }
    haptic.selection()
    onToggle(ex)
  }

  useEffect(() => () => { if (limitTimer.current) clearTimeout(limitTimer.current) }, [])

  // Строка списка — одна и та же в обеих вкладках: свои упражнения не должны
  // выглядеть «другим сортом», отличие только в карандаше и цвете тега.
  const renderRow = (ex, { custom = false } = {}) => {
    const added = excluded.has(ex.id)
    const c = getMuscleGroupColors(ex.muscle_group, custom)
    const disabled = atLimit && !added
    const tag = custom
      ? exerciseTagLabel(ex.muscle_group, ex.sub_group)
      : titleCase(
          SUB_GROUP_LABELS[ex.sub_group] || ex.sub_group ||
          MUSCLE_GROUP_LABELS[ex.muscle_group] || ex.muscle_group
        )
    return (
      <div
        key={ex.id}
        // press-dim, а не press-tile: внутри карточки своя кнопка «+», и scale
        // увёл бы её вместе с карточкой. Отклик тот же, что у строки друга —
        // подсветка светлее, пока держишь.
        className={custom ? 'press-dim' : undefined}
        style={styles.row}
        onPointerDown={custom ? (e) => startLongPress(e, ex) : undefined}
        onPointerUp={custom ? cancelLongPress : undefined}
        onPointerMove={custom ? moveLongPress : undefined}
        onPointerCancel={custom ? cancelLongPress : undefined}
      >
        <div style={{ ...styles.preview, opacity: disabled ? 0.4 : 1 }}>
          {ex.preview_url
            ? <img src={ex.preview_url} alt="" style={styles.previewImg} draggable={false} />
            : <ExercisePlaceholder size={24} />}
        </div>
        <div style={{ ...styles.rowContent, opacity: disabled ? 0.4 : 1 }}>
          <div style={styles.rowName}>
            {ex.name}
            {/* Карандаш = «это завёл ты, это можно править». В каталоге его нет
                вовсе — так видно с одного взгляда, где своё. */}
            {custom && <span style={styles.pencil}><PencilIcon size={13} color="var(--color-text-secondary)" /></span>}
          </div>
          <div style={styles.rowTags}>
            {tag && (
              <span style={{ ...styles.rowTag, background: c.tag, color: 'var(--color-text)', opacity: 0.7 }}>
                {tag}
              </span>
            )}
          </div>
          {custom && ex.meta_info && <div style={styles.rowMeta}>{ex.meta_info}</div>}
        </div>
        <div style={styles.addBtnWrap}>
          {limitRowId === ex.id && (
            <div key={limitNonce} className="shake-error" style={styles.limitBubble}>
              Лимит {max}/{max}
            </div>
          )}
          <button
            onClick={() => handleToggle(ex)}
            className="press-tile"
            style={{
              ...styles.addBtn,
              background: added ? 'rgba(158,209,83,0.15)' : 'var(--highlight-recent)',
              color: added ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              opacity: disabled ? 0.45 : 1
            }}
            aria-label={added ? 'Убрать' : 'Добавить'}
          >
            {added ? '✓' : '+'}
          </button>
        </div>
      </div>
    )
  }

  const content = (
    <div ref={overlayRef} style={styles.overlay}>
      {/* Пикер открывается поверх конструктора, поэтому полосу заголовка
          приходится поднимать над оверлеем — иначе она осталась бы под ним. */}
      {!form && <ScreenTitle zIndex={101}>Упражнения</ScreenTitle>}

      {/* Шапка закреплена ПОВЕРХ списка и полностью прозрачна: карточки видно,
          как они уезжают под фильтры. Своего фона у неё нет — стекло держат сами
          пилюли, а верхнюю кромку экрана и так закрывает общий скрим приложения. */}
      {/* Тот же верхний скрим, что у обычных экранов (.app::before). Пикер —
          оверлей выше его слоя, поэтому общий сюда не достаёт: рисуем свой,
          иначе карточки уезжали бы под полосу заголовка резким краем. */}
      <div style={styles.topScrim} aria-hidden="true" />

      <div ref={headRef} style={styles.head}>

      {/* Вкладки — тот же сегмент-контрол, что «Все / Быстрый режим» в конструкторе.
          Они на месте всегда: это не фильтр, а «где я нахожусь». */}
      <div style={styles.tabsRow}>
        <div style={styles.segGroup}>
          {TABS.map((t, i) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => { if (kbGuarded()) return; haptic.light(); setTab(t.key) }}
                className="press-tile"
                style={{
                  ...styles.segItem,
                  ...(active ? styles.segItemActive : null),
                  marginLeft: i === 0 ? 0 : '-5px',
                  zIndex: active ? 2 : 1,
                  color: active ? 'var(--color-primary)' : 'var(--color-text-inactive)'
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Сворачиваемая часть: поиск и фильтры. Уходит вверх и тает при прокрутке
          вниз, возвращается от первого движения вверх. Место под ней НЕ
          схлопывается — иначе список дёргался бы на каждом сворачивании; вместо
          этого сквозь освободившуюся прозрачную зону видно карточки. */}
      <div
        style={{
          ...styles.collapsible,
          transform: collapsed ? 'translateY(-10px)' : 'translateY(0)',
          opacity: collapsed ? 0 : 1,
          // Не 'auto': тогда кликабельным стал бы весь прямоугольник шапки,
          // включая прозрачные поля, и тапы по карточкам под ним пропадали бы.
          // Кликабельность включена точечно у самих контролов.
          pointerEvents: collapsed ? 'none' : undefined
        }}
      >
      {tab === 'all' && (
      <div style={styles.header}>
        {/* Поле во всю строку. Крестик появляется только когда есть что убирать:
            курсор в поле или введён текст. Иначе он висел бы всегда и читался
            как «закрыть пикер» — а закрывает он поиск. */}
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}><SearchIcon size={18} /></span>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => { haptic.selection(); setSearchFocused(true) }}
            onBlur={() => { setSearchFocused(false); kbGuardUntil.current = Date.now() + 350 }}
            placeholder="Поиск упражнения"
            style={styles.search}
          />
        </div>
        {/* Крестик СНАРУЖИ пилюли, отдельным кружком: внутри поля он читался
            как часть ввода, а он отменяет поиск целиком. Поле под него плавно
            ужимается — кружок не появляется поверх текста. */}
        <div style={{
          ...styles.clearSlot,
          width: showClear ? '44px' : 0,
          marginLeft: showClear ? 'var(--space-2)' : 0,
          opacity: showClear ? 1 : 0
        }}>
          <CloseCross
            onClose={handleClearSearch}
            hitSize={44}
            bubbleSize={40}
            iconSize={17}
            // Тот же стеклянный фон и хайрлайн, что у поля поиска рядом:
            // два контрола одной строки должны быть из одного материала.
            bubbleStyle={{
              background: GLASS,
              border: '1px solid var(--color-border)',
              backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
              WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
            }}
          />
        </div>
      </div>
      )}

      {/* Чипы групп мышц */}
      {tab === 'all' && (
      <div style={styles.chipsRow}>
        {groups.map(({ group }) => {
          const c = getMuscleGroupColors(group)
          const active = activeGroup === group
          return (
            <button
              key={group}
              onClick={() => handleGroupTap(group)}
              className="press-tile"
              style={{
                ...styles.chip,
                // Выбранный — сплошной цвет своей группы, без стекла: он несёт
                // смысл «здесь ты сейчас». Остальные стеклянные, чтобы выбранный
                // читался с одного взгляда, а не выискивался по оттенку.
                ...(active ? null : styles.chipGlass),
                background: active ? c.tag : GLASS,
                color: active ? 'var(--color-text)' : 'var(--color-text-secondary)'
              }}
            >
              {titleCase(MUSCLE_GROUP_LABELS[group] || group)}
            </button>
          )
        })}
      </div>
      )}

      {/* Подгруппы активной группы — как содержимое открытой вкладки:
          отдельная панель с фоном чуть светлее, чтобы не путать с группами. */}
      {tab === 'all' && activeGroup && activeSubs.length > 0 && (
        // Обводка панели ВСЕГДА нейтральная. Цветом кричит только выбранная
        // пилюля внутри — обвести цветом ещё и всю область значит поднять фон
        // до уровня выбора и спорить с ним.
        <div style={styles.subPanel}>
          <div style={styles.subChipsRow}>
            {activeSubs.map(sub => {
              const active = activeSub === sub
              // Активная подгруппа заливается цветом СВОЕЙ группы (спина/грудь…),
              // а не общим зелёным.
              const gc = getMuscleGroupColors(activeGroup)
              return (
                <button
                  key={sub}
                  onClick={() => {
                    if (kbGuarded()) return
                    haptic.light()
                    setActiveSub(prev => (prev === sub ? null : sub))
                  }}
                  className="press-tile"
                  style={{
                    ...styles.subChip,
                    ...(active ? null : styles.chipGlass),
                    background: active ? gc.tag : GLASS,
                    color: active ? 'var(--color-text)' : 'var(--color-text-secondary)'
                  }}
                >
                  {titleCase(SUB_GROUP_LABELS[sub] || sub)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      </div>
      </div>

      {/* Затемнения над списком нет: пилюли фильтров сами стеклянные, список
          виден сквозь них — второй слой поверх только мутил картинку. */}
      {/* Прокручивается САМ этот блок, а не вложенный список: шапка над ним
          закреплена, и следить за прокруткой (сворачивание, кнопка «наверх»)
          нужно за одним постоянным элементом. Верхний отступ = высота шапки. */}
      <div
        ref={listRef}
        style={{ ...styles.listWrap, paddingTop: headH ? `${headH}px` : 'var(--tg-safe-top)' }}
        // Тап или протяжка по списку убирает клавиатуру: поле поиска не должно
        // держать её, пока человек уже смотрит результаты.
        onPointerDown={dismissKeyboard}
      >
      {tab === 'all' ? (
        // key пересоздаёт содержимое при смене фильтра. Скролл при этом сбрасываем
        // отдельным эффектом — крутится теперь внешний блок, и ремаунт внутреннего
        // сам по себе его наверх больше не возвращает.
        <div key={`${activeGroup || 'all'}-${activeSub || 'all'}-${search}`} style={styles.list}>
          {loading && <div style={styles.empty}>Загрузка…</div>}
          {!loading && filtered.length === 0 && <div style={styles.empty}>Ничего не найдено</div>}
          {!loading && filtered.map(ex => renderRow(ex))}
        </div>
      ) : (
        <div style={styles.list}>
          {mineError && <div style={styles.mineError}>{mineError}</div>}

          {mine.length === 0 && (
            <div style={styles.empty}>
              Здесь будут упражнения, которых нет в каталоге.<br />
              Название, группа и подходы — на твоё усмотрение.
            </div>
          )}

          {mine.map(ex => renderRow(ex, { custom: true }))}

          {/* Кнопка заведения — ПОСЛЕДНЕЙ строкой, ростом с карточку. Внизу
              потому, что список растёт сверху вниз: заведённое остаётся на
              месте, а «создать ещё» всегда в конце — как пустая строка в конце
              списка дел. Сверху она отодвигала бы уже созданное каждый раз. */}
          <button
            onClick={() => {
              if (atMineLimit) { haptic.error(); setMineError(`Достигнут лимит — ${MY_EXERCISE_LIMIT} своих упражнений`); return }
              haptic.light(); setMineError(''); setForm({ mode: 'new' })
            }}
            className="press-tile"
            style={{ ...styles.createRow, opacity: atMineLimit ? 0.45 : 1 }}
          >
            <span style={styles.createPlus}>+</span>
            <span style={styles.createText}>
              Создать упражнение
              <span style={styles.createCount}>{mine.length}/{MY_EXERCISE_LIMIT}</span>
            </span>
          </button>

          {mine.length > 0 && (
            <div style={styles.mineHint}>
              Долгое нажатие по своему упражнению — правка и удаление.
            </div>
          )}
        </div>
      )}
      </div>

      {/* Кнопку прячем при открытой клавиатуре; показываем с задержкой при закрытии. */}
      {!kbOpen && (
        <div style={styles.footer}>
          <div className="dock-scrim" />
          {/* Ровно тот же вид, что «Завершить» в дне: tonal + hairline. Раньше
              была «neutral» — полупрозрачная с блюром, и на фоне списка кнопка
              выглядела бледнее, чем главное действие экрана. */}
          <ActionButton
            onClick={onDone}
            variant="tonal"
            bordered
            hug
            style={count >= max ? { color: 'var(--color-error)' } : null}
          >
            {/* Плюс — только пока добавлять есть куда (см. конструктор). */}
            {count < max && <UiIcon name="add" size={20} color="var(--color-primary)" />}
            {/* Без слова «упражнения»: оно уже стоит заголовком экрана. */}
            {count >= max ? `Достигнут лимит ${count}/${max}` : `Добавить ${count}/${max}`}
          </ActionButton>
        </div>
      )}
      {/* Стрелка «наверх» — та же, что в дне тренировки, но следит за списком
          пикера: окно здесь неподвижно. Прячем при открытой клавиатуре. */}
      {!kbOpen && <ScrollTopButton scrollRef={listRef} zIndex={102} />}

      {menu && (
        <AnchorMenu
          anchorRect={menu.rect}
          onClose={() => setMenu(null)}
          align="left"
          gap={3}
          motion="drop"
          items={[
            {
              key: 'edit',
              icon: <PencilIcon size={20} color="var(--cat-cardio)" />,
              label: 'Редактировать',
              onClick: () => setForm({ mode: 'edit', ex: menu.ex })
            },
            { divider: true },
            {
              key: 'delete',
              icon: <TrashIcon />,
              label: 'Удалить',
              labelColor: 'var(--color-error)',
              onClick: () => setConfirmDel(menu.ex)
            }
          ]}
        />
      )}

      {form && (
        <CustomExerciseForm
          groups={groups.map(g => g.group)}
          initial={form.mode === 'edit' ? form.ex : null}
          onSave={handleFormSave}
          onDirtyChange={setFormDirty}
          submitRef={formSubmit}
        />
      )}

      {confirmFormExit && (
        <ConfirmModal
          title="Сохранить изменения?"
          text="Упражнение изменено."
          onClose={() => setConfirmFormExit(false)}
          actions={[
            { label: 'Не сохранять', onClick: () => { setConfirmFormExit(false); haptic.light(); setForm(null) } },
            { label: 'Сохранить', onClick: () => { setConfirmFormExit(false); formSubmit.current?.() } }
          ]}
        />
      )}

      {confirmDel && (
        <ConfirmModal
          title="Удалить упражнение?"
          text="Оно исчезнет из программ, где стоит. Прошлые тренировки и веса останутся в истории."
          onClose={() => setConfirmDel(null)}
          actions={[
            { label: 'Отмена', onClick: () => setConfirmDel(null) },
            { label: 'Удалить', danger: true, onClick: () => handleDelete(confirmDel) }
          ]}
        />
      )}
    </div>
  )

  return createPortal(content, document.body)
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    height: '100dvh',
    background: 'var(--color-bg)',
    overflow: 'hidden'
  },
  topScrim: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 'calc(var(--tg-safe-top) + 14px)',
    zIndex: 7, pointerEvents: 'none',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    background: 'linear-gradient(to bottom, var(--color-bg) 0%, rgba(13, 12, 12, 0.7) 35%, rgba(13, 12, 12, 0) 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)',
    maskImage: 'linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)'
  },
  // Шапка поверх списка и БЕЗ своего фона: сквозь неё видно, как карточки
  // уезжают под фильтры. Раньше здесь была сплошная заливка, и список обрывался
  // ровной чёрной полосой.
  head: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
    paddingTop: 'var(--tg-safe-top)',
    pointerEvents: 'none'
  },
  collapsible: {
    transition: 'transform 0.24s var(--ease-ios), opacity 0.2s ease'
  },
  // Без верхнего padding: поле поиска начинается ровно на 16px ниже кнопок
  // Telegram (отступ задаёт var(--tg-safe-top) у overlay).
  // gap НЕ ставим: он держал бы пустое место справа и без крестика поле не
  // доходило бы до края экрана. Зазор даёт сам слот крестика, когда появляется.
  header: { pointerEvents: 'auto', display: 'flex', alignItems: 'center', padding: '0 var(--space-4)' },

  // Сегмент-контрол вкладок — один в один с «Все / Быстрый режим» в конструкторе.
  tabsRow: { display: 'flex', padding: '0 var(--space-4) var(--space-4)', flexShrink: 0 },
  segGroup: {
    pointerEvents: 'auto',
    display: 'flex', alignItems: 'center', gap: 0, padding: 'var(--space-1)', width: '100%',
    background: GLASS, border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)', WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)'
  },
  segItem: {
    flex: 1, minWidth: 0, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-15)',
    alignSelf: 'stretch', minHeight: '44px', padding: '0 var(--space-2)',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  segItemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  },

  // Строка заведения — ростом с карточку списка (90px), чтобы читалась как его
  // часть, а не как кнопка над ним.
  createRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%',
    background: 'var(--layer-1)', border: '1px dashed var(--color-border)',
    borderRadius: 'var(--radius-card)', padding: 'var(--space-3)', minHeight: '90px',
    marginBottom: 'var(--space-3)', textAlign: 'left',
    WebkitTapHighlightColor: 'transparent'
  },
  createPlus: {
    width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--layer-2)', color: 'var(--color-primary)',
    fontSize: 'var(--text-heading-size)', fontWeight: 700, lineHeight: 1
  },
  createText: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-05)',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text)'
  },
  createCount: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 500, color: 'var(--color-text-secondary)'
  },
  mineError: {
    marginBottom: 'var(--space-3)', textAlign: 'center',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 700, color: 'var(--color-error)'
  },
  mineHint: {
    padding: 'var(--space-3) var(--space-2) 0', textAlign: 'center',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', lineHeight: 1.5
  },
  pencil: { display: 'inline-flex', verticalAlign: 'middle', marginLeft: 'var(--space-15)' },
  rowMeta: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)'
  },
  // Поле поиска — стеклянная пилюля того же семейства, что таб-бар и фильтры.
  searchWrap: {
    flex: 1, minWidth: 0, height: '44px',
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '0 var(--space-2) 0 var(--space-4)',
    background: GLASS, border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
  },
  searchIcon: { display: 'inline-flex', flexShrink: 0 },
  clearSlot: {
    flexShrink: 0, height: '44px', overflow: 'hidden', pointerEvents: 'auto',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'width 0.22s var(--ease-ios), margin-left 0.22s var(--ease-ios), opacity 0.18s ease'
  },
  search: {
    flex: 1, minWidth: 0, height: '100%', padding: 0,
    background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)'
  },
  // Нижнего отступа у фильтров нет: расстояние до первой карточки задаёт сам
  // список (16px), иначе оно складывалось бы из двух отступов и плыло.
  // Сверху 8px — тот же зазор, что между группами и панелью подгрупп: поиск,
  // группы и подгруппы это один инструмент подбора, и держаться друг от друга
  // они должны одинаково.
  chipsRow: {
    pointerEvents: 'auto',
    display: 'flex', gap: 'var(--space-2)', overflowX: 'auto',
    // Поля 16px — МАРЖИНОМ, а не паддингом: паддинг не обрезает, и чипы при
    // прокрутке заезжали в безопасную зону у самой кромки экрана. С маржином
    // лента кончается там же, где остальной контент, и обрезанный чип сам
    // показывает, что список листается.
    margin: '0 var(--space-4)', padding: 'var(--space-2) 0 0',
    flexWrap: 'nowrap', flexShrink: 0
  },
  // Панель подгрупп — «содержимое открытой вкладки группы».
  subPanel: { pointerEvents: 'auto',
    margin: 'var(--space-2) var(--space-4) 0',
    padding: 'var(--space-2)',
    background: GLASS,
    // Пилюля в пилюлях — та же форма, что у самих чипов внутри: панель читается
    // как «раскрытая группа», а не как чужеродная плашка.
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    // Контент уезжает В СКРУГЛЕНИЕ: без overflow чипы обрезались прямой
    // вертикальной линией поперёк пилюли, будто её край им не указ.
    overflow: 'hidden',
    transition: 'border-color 0.22s ease',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    flexShrink: 0
  },
  subChipsRow: {
    display: 'flex', gap: 'var(--space-2)', overflowX: 'auto',
    flexWrap: 'nowrap'
  },
  // Общее «стекло» невыбранной пилюли — одно на группы и подгруппы.
  // Своя, более плотная подложка вместо --color-surface-dim (30%): сквозь неё
  // просвечивали карточки и подписи фильтров становились нечитаемыми. Стекло
  // здесь работает на глубину, а не на прозрачность ради прозрачности.
  chipGlass: {
    background: GLASS,
    border: '1px solid var(--color-border)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
  },
  chip: {
    flexShrink: 0, padding: 'var(--space-2) var(--space-4)', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    whiteSpace: 'nowrap', letterSpacing: '0.3px'
  },
  subChip: {
    flexShrink: 0, padding: 'var(--space-15) var(--space-3)', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 700, whiteSpace: 'nowrap'
  },
  listWrap: {
    position: 'absolute', inset: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y'
  },
  list: { padding: 'var(--space-4) var(--space-4) 120px', display: 'block' },
  empty: { textAlign: 'center', padding: 'var(--space-10) var(--space-5)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-text-secondary)' },
  row: { position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--color-card)', borderRadius: 'var(--radius-card)', padding: 'var(--space-3)', minHeight: '90px', marginBottom: 'var(--space-3)' },
  preview: { width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)', overflow: 'hidden', background: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  rowContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' },
  rowName: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-label-size)', fontWeight: 700, lineHeight: '16px', color: 'var(--color-text)' },
  rowTags: { display: 'flex', gap: 'var(--space-15)', flexWrap: 'wrap' },
  rowTag: { display: 'inline-block', padding: 'var(--space-05) var(--space-2)', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 700, letterSpacing: '0.2px', lineHeight: '13px', whiteSpace: 'nowrap' },
  addBtn: { width: '36px', height: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: 'none', borderRadius: '50%', fontSize: 'var(--text-title-size)', fontWeight: 700 },
  // Футер поверх списка: лёгкое затемнение к низу, список уезжает под него.
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 'var(--space-6) var(--space-4) var(--tabbar-bottom)',
    display: 'flex', justifyContent: 'center',
    pointerEvents: 'none',
    // z-index → footer становится контекстом наложения, чтобы dock-scrim (z:-1)
    // лёг внутри него (за кнопкой), а не за списком пикера.
    zIndex: 2
  },
  addBtnWrap: {
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  limitBubble: {
    position: 'absolute',
    right: 'calc(100% + 10px)',
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    padding: '0 var(--space-3)',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-small)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 700,
    lineHeight: 1,
    color: 'var(--color-error)',
    whiteSpace: 'nowrap',
    zIndex: 5,
    pointerEvents: 'none'
  }
}