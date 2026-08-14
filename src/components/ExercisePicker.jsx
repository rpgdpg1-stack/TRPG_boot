import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { loadExerciseCatalog } from '../features/programs/customProgram'
import { MUSCLE_GROUP_LABELS, SUB_GROUP_LABELS, exerciseTagLabel } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import {
  loadMyExercises, getMyExercisesSync, createMyExercise, updateMyExercise,
  deleteMyExercise, MY_EXERCISE_LIMIT
} from '../features/programs/userExercises'
import { haptic } from '../lib/telegram'
import ActionButton from './ActionButton'
import AnchorMenu from './AnchorMenu'
import ConfirmModal from './ConfirmModal'
import CustomExerciseForm from './CustomExerciseForm'
import PencilIcon from './PencilIcon'
import TrashIcon from './TrashIcon'
import { useScrollLock } from '../lib/use-scroll-lock'
import ExercisePlaceholder from './ExercisePlaceholder'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10

const TABS = [
  { key: 'all', label: 'Все упражнения' },
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
  const [mineError, setMineError] = useState('')
  const longTimer = useRef(null)
  const pressStart = useRef({ x: 0, y: 0 })

  const excluded = useMemo(
    () => (excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])),
    [excludeIds]
  )

  const handleClearSearch = () => {
    haptic.selection()
    setSearch('')
    try { inputRef.current?.blur() } catch { /* ignore */ }
  }

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

  const handleFormSave = async (values) => {
    if (form?.mode === 'edit') await updateMyExercise(form.ex.id, values)
    else await createMyExercise(values)
    setMine(await loadMyExercises())
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
      : toTitleCase(
          SUB_GROUP_LABELS[ex.sub_group] || ex.sub_group ||
          MUSCLE_GROUP_LABELS[ex.muscle_group] || ex.muscle_group
        )
    return (
      <div
        key={ex.id}
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
              <span style={{ ...styles.rowTag, background: c.tag, color: '#fff', opacity: 0.7 }}>
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
      {/* Вкладки — тот же сегмент-контрол, что «Все / Быстрый режим» в конструкторе. */}
      <div style={styles.tabsRow}>
        <div style={styles.segGroup}>
          {TABS.map((t, i) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => { haptic.light(); setTab(t.key) }}
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

      {tab === 'all' && (
      <div style={styles.header}>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => haptic.selection()}
          placeholder="Поиск упражнения"
          className="press-grow"
          style={styles.search}
        />
        <button onClick={handleClearSearch} className="press-tile" style={styles.closeBtn} aria-label="Очистить поиск">✕</button>
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
                background: active ? c.tag : 'var(--highlight-recent)',
                color: active ? '#fff' : 'var(--color-text-secondary)'
              }}
            >
              {toTitleCase(MUSCLE_GROUP_LABELS[group] || group)}
            </button>
          )
        })}
      </div>
      )}

      {/* Подгруппы активной группы — как содержимое открытой вкладки:
          отдельная панель с фоном чуть светлее, чтобы не путать с группами. */}
      {tab === 'all' && activeGroup && activeSubs.length > 0 && (
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
                  onClick={() => { haptic.light(); setActiveSub(prev => (prev === sub ? null : sub)) }}
                  className="press-tile"
                  style={{
                    ...styles.subChip,
                    background: active ? gc.tag : 'var(--layer-2)',
                    color: active ? '#fff' : 'var(--color-text-secondary)'
                  }}
                >
                  {toTitleCase(SUB_GROUP_LABELS[sub] || sub)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Обёртка списка: сверху fade-scrim (как под карточкой игрока на главной) —
          список уезжает под теги групп/подгрупп плавно, без обрыва. */}
      <div style={styles.listWrap}>
        <div style={styles.topFade} aria-hidden="true" />
      {/* Список. key пересоздаёт контейнер при смене фильтра — новый монтируется
          с нулевым скроллом, без ручного scrollTop (на WebKit он запаздывает). */}
      {tab === 'all' ? (
        // key пересоздаёт контейнер при смене фильтра — новый монтируется
        // с нулевым скроллом, без ручного scrollTop (на WebKit он запаздывает).
        <div key={`${activeGroup || 'all'}-${activeSub || 'all'}-${search}`} style={styles.list}>
          {loading && <div style={styles.empty}>Загрузка…</div>}
          {!loading && filtered.length === 0 && <div style={styles.empty}>Ничего не найдено</div>}
          {!loading && filtered.map(ex => renderRow(ex))}
        </div>
      ) : (
        <div style={styles.list}>
          {/* Кнопка заведения — первой строкой, ростом с карточку: это такой же
              элемент списка, а не служебная мелочь под ним. */}
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

          {mineError && <div style={styles.mineError}>{mineError}</div>}

          {mine.length === 0 && (
            <div style={styles.empty}>
              Здесь будут упражнения, которых нет в каталоге.<br />
              Название, группа и подходы — на твоё усмотрение.
            </div>
          )}

          {mine.map(ex => renderRow(ex, { custom: true }))}

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
          {/* Тот же компонент-кнопка, что «Завершить» в дне и «Добавить» в конструкторе. */}
          <ActionButton
            onClick={onDone}
            variant="neutral"
            hug
            style={count >= max ? { color: 'var(--color-error)' } : null}
          >
            {count >= max ? `Достигнут лимит ${count}/${max}` : `Добавить упражнения · ${count}/${max}`}
          </ActionButton>
        </div>
      )}
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
          onClose={() => setForm(null)}
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

function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    height: '100dvh',
    background: 'var(--color-bg)',
    display: 'flex', flexDirection: 'column',
    paddingTop: 'var(--tg-safe-top)',
    overflow: 'hidden'
  },
  // Без верхнего padding: поле поиска начинается ровно на 16px ниже кнопок
  // Telegram (отступ задаёт var(--tg-safe-top) у overlay).
  header: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-4) var(--space-2)' },

  // Сегмент-контрол вкладок — один в один с «Все / Быстрый режим» в конструкторе.
  tabsRow: { display: 'flex', padding: '0 var(--space-4) var(--space-3)', flexShrink: 0 },
  segGroup: {
    display: 'flex', alignItems: 'center', gap: 0, padding: 'var(--space-1)', width: '100%',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
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
  search: {
    flex: 1, height: '44px', padding: '0 var(--space-4)',
    background: 'var(--color-card)', border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-medium)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', outline: 'none'
  },
  closeBtn: {
    width: '44px', height: '44px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, paddingBottom: 'var(--space-05)',
    background: 'var(--color-card)', border: 'none', borderRadius: '50%',
    color: 'var(--color-text-secondary)', fontSize: 'var(--text-body-size)'
  },
  chipsRow: {
    display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', padding: 'var(--space-2) var(--space-4) var(--space-15)',
    flexWrap: 'nowrap', flexShrink: 0
  },
  // Панель подгрупп — «содержимое открытой вкладки группы».
  subPanel: {
    margin: 'var(--space-05) var(--space-4) var(--space-15)',
    padding: 'var(--space-3) var(--space-3)',
    background: 'var(--layer-1)',
    borderRadius: 'var(--radius-medium)',
    flexShrink: 0
  },
  subChipsRow: {
    display: 'flex', gap: 'var(--space-2)', overflowX: 'auto',
    flexWrap: 'nowrap'
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
  // Обёртка списка — даёт точку отсчёта для верхнего fade-scrim (absolute).
  listWrap: {
    position: 'relative',
    flex: '1 1 0%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column'
  },
  // Верхний fade-scrim — как под карточкой игрока на главной (градиент + blur).
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '24px',
    zIndex: 5,
    pointerEvents: 'none',
    background: 'var(--scrim-sticky)'
  },
  list: {
    flex: '1 1 0%', minHeight: 0, overflowY: 'auto',
    padding: 'var(--space-05) var(--space-4) 100px',
    display: 'block',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y'
  },
  empty: { textAlign: 'center', padding: 'var(--space-10) var(--space-5)', fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-text-secondary)' },
  row: { position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--color-card)', borderRadius: 'var(--radius-card)', padding: 'var(--space-3)', minHeight: '90px', marginBottom: 'var(--space-3)' },
  preview: { width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
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