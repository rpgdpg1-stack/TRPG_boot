import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { loadExerciseCatalog } from '../features/programs/customProgram'
import { MUSCLE_GROUP_LABELS, SUB_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { haptic } from '../lib/telegram'

/**
 * Пикер упражнений для конструктора.
 *
 * Полноэкранный оверлей (портал в body). Фильтр: группа мышц → подгруппа + поиск.
 * Порядок групп/подгрупп — как в каталоге (сортировка по id). Без фильтра уже
 * выбранные упражнения поднимаются наверх списка.
 */
export default function ExercisePicker({ excludeIds, atLimit, count, max, onToggle, onDone }) {
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

  const content = (
    <div style={styles.overlay}>
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

      {/* Чипы групп мышц */}
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
                background: active ? c.tag : 'rgba(255,255,255,0.06)',
                color: active ? '#fff' : 'var(--color-text-secondary)'
              }}
            >
              {toTitleCase(MUSCLE_GROUP_LABELS[group] || group)}
            </button>
          )
        })}
      </div>

      {/* Подгруппы активной группы — как содержимое открытой вкладки:
          отдельная панель с фоном чуть светлее, чтобы не путать с группами. */}
      {activeGroup && activeSubs.length > 0 && (
        <div style={styles.subPanel}>
          <div style={styles.subChipsRow}>
            {activeSubs.map(sub => {
              const active = activeSub === sub
              return (
                <button
                  key={sub}
                  onClick={() => { haptic.light(); setActiveSub(prev => (prev === sub ? null : sub)) }}
                  className="press-tile"
                  style={{
                    ...styles.subChip,
                    background: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.10)',
                    color: active ? '#0D0C0C' : 'var(--color-text-secondary)'
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
      <div key={`${activeGroup || 'all'}-${activeSub || 'all'}-${search}`} style={styles.list}>
        {loading && <div style={styles.empty}>Загрузка…</div>}
        {!loading && filtered.length === 0 && <div style={styles.empty}>Ничего не найдено</div>}
        {!loading && filtered.map(ex => {
          const added = excluded.has(ex.id)
          const c = getMuscleGroupColors(ex.muscle_group)
          const disabled = atLimit && !added
          return (
            <div key={ex.id} style={styles.row}>
              <div style={{ ...styles.preview, opacity: disabled ? 0.4 : 1 }}>
                {ex.preview_url
                  ? <img src={ex.preview_url} alt="" style={styles.previewImg} draggable={false} />
                  : <div style={styles.previewPlaceholder}>💪</div>}
              </div>
              <div style={{ ...styles.rowContent, opacity: disabled ? 0.4 : 1 }}>
                <div style={styles.rowName}>{ex.name}</div>
                <div style={styles.rowTags}>
                  <span style={{ ...styles.rowTag, background: c.tag, color: '#fff' }}>
                    {toTitleCase(MUSCLE_GROUP_LABELS[ex.muscle_group] || ex.muscle_group)}
                  </span>
                  <span style={{ ...styles.rowTag, ...styles.rowTagSecondary }}>
                    {toTitleCase(SUB_GROUP_LABELS[ex.sub_group] || ex.sub_group)}
                  </span>
                </div>
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
                    background: added ? 'rgba(158,209,83,0.15)' : 'rgba(255,255,255,0.06)',
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
        })}
      </div>
      </div>

      {/* Кнопку прячем при открытой клавиатуре; показываем с задержкой при закрытии. */}
      {!kbOpen && (
        <div style={styles.footer}>
          <button onClick={onDone} className="press-tile" style={styles.doneBtn}>
            Добавить упражнения · {count}/{max}
          </button>
        </div>
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
  header: { display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px 8px' },
  search: {
    flex: 1, height: '44px', padding: '0 16px',
    background: 'var(--color-card)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 'var(--radius-medium)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', outline: 'none'
  },
  closeBtn: {
    width: '44px', height: '44px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, paddingBottom: '2px',
    background: 'var(--color-card)', border: 'none', borderRadius: '50%',
    color: 'var(--color-text-secondary)', fontSize: '16px'
  },
  chipsRow: {
    display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 16px 6px',
    flexWrap: 'nowrap', flexShrink: 0
  },
  // Панель подгрупп — «содержимое открытой вкладки группы».
  subPanel: {
    margin: '2px 16px 6px',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 'var(--radius-medium)',
    flexShrink: 0
  },
  subChipsRow: {
    display: 'flex', gap: '8px', overflowX: 'auto',
    flexWrap: 'nowrap'
  },
  chip: {
    flexShrink: 0, padding: '8px 14px', border: 'none', borderRadius: '999px',
    fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 700,
    whiteSpace: 'nowrap', letterSpacing: '0.3px'
  },
  subChip: {
    flexShrink: 0, padding: '6px 12px', border: 'none', borderRadius: '999px',
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap'
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
    background: 'linear-gradient(to bottom, var(--color-bg) 0%, rgba(13, 12, 12, 0.7) 35%, rgba(13, 12, 12, 0) 100%)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    maskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)'
  },
  list: {
    flex: '1 1 0%', minHeight: 0, overflowY: 'auto',
    padding: '2px 16px 110px',
    display: 'block',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y'
  },
  empty: { textAlign: 'center', padding: '40px 20px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' },
  row: { position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-card)', borderRadius: 'var(--radius-card)', padding: '12px', minHeight: '90px', marginBottom: '10px' },
  preview: { width: '64px', height: '64px', flexShrink: 0, borderRadius: 'var(--radius-medium)', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewPlaceholder: { fontSize: '28px', opacity: 0.4 },
  rowContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' },
  rowName: { fontFamily: 'var(--font-geist)', fontSize: '13px', fontWeight: 700, lineHeight: '16px', color: 'var(--color-text)' },
  rowTags: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  rowTag: { display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.2px', lineHeight: '13px', whiteSpace: 'nowrap' },
  rowTagSecondary: { background: 'rgba(255,255,255,0.08)', color: '#A0A0A0', fontWeight: 600 },
  addBtn: { width: '36px', height: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: 'none', borderRadius: '50%', fontSize: '18px', fontWeight: 700 },
  // Футер поверх списка: лёгкое затемнение к низу, список уезжает под него.
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '28px 16px calc(16px + env(safe-area-inset-bottom))',
    background: 'linear-gradient(180deg, rgba(13,12,12,0) 0%, rgba(13,12,12,0.85) 40%, var(--color-bg) 85%)',
    pointerEvents: 'none'
  },
  doneBtn: {
    width: '100%', padding: '18px', borderRadius: 'var(--radius-card)',
    border: '1.5px dashed rgba(255,255,255,0.18)',
    background: 'rgba(34,34,34,0.55)', color: 'var(--color-text-secondary)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, letterSpacing: '1px',
    pointerEvents: 'auto'
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
    padding: '0 10px',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: 'var(--radius-small)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
    color: '#FF6B6B',
    whiteSpace: 'nowrap',
    zIndex: 5,
    pointerEvents: 'none'
  }
}