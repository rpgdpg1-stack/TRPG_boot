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
  const [activeGroup, setActiveGroup] = useState(null)
  const [activeSub, setActiveSub] = useState(null)
  const [limitToast, setLimitToast] = useState(false)
  const inputRef = useRef(null)
  const limitTimer = useRef(null)

  const excluded = useMemo(
    () => (excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])),
    [excludeIds]
  )

  const handleClearSearch = () => {
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
      haptic.warning()
      setLimitToast(true)
      if (limitTimer.current) clearTimeout(limitTimer.current)
      limitTimer.current = setTimeout(() => setLimitToast(false), 2600)
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
          placeholder="Поиск упражнения"
          style={styles.search}
        />
        <button onClick={handleClearSearch} style={styles.closeBtn} aria-label="Очистить поиск">✕</button>
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

      {/* Список */}
      <div style={styles.list}>
        {loading && <div style={styles.empty}>Загрузка…</div>}
        {!loading && filtered.length === 0 && <div style={styles.empty}>Ничего не найдено</div>}
        {!loading && filtered.map(ex => {
          const added = excluded.has(ex.id)
          const c = getMuscleGroupColors(ex.muscle_group)
          const disabled = atLimit && !added
          return (
            <div key={ex.id} style={{ ...styles.row, opacity: disabled ? 0.4 : 1 }}>
              <div style={styles.preview}>
                {ex.preview_url
                  ? <img src={ex.preview_url} alt="" style={styles.previewImg} draggable={false} />
                  : <div style={styles.previewPlaceholder}>💪</div>}
              </div>
              <div style={styles.rowContent}>
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
              <button
                onClick={() => handleToggle(ex)}
                className="press-tile"
                style={{
                  ...styles.addBtn,
                  background: added ? 'rgba(158,209,83,0.15)' : 'var(--color-primary)',
                  color: added ? 'var(--color-primary)' : '#0D0C0C',
                  opacity: disabled ? 0.45 : 1
                }}
                aria-label={added ? 'Убрать' : 'Добавить'}
              >
                {added ? '✓' : '+'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Красный попап про лимит — появляется при тапе на «+» сверх лимита. */}
      {limitToast && (
        <div style={styles.limitToast}>
          Лимит {max}/{max} достигнут. Снимите галочку с одного из выбранных упражнений, чтобы добавить это.
        </div>
      )}

      {/* Кнопка всегда внизу: absolute в полноэкранном оверлее. При открытой
          клавиатуре уходит ПОД неё, без скрытия/показа — значит без морганий. */}
      <div style={styles.footer}>
        <button onClick={onDone} className="press-tile" style={styles.doneBtn}>
          Добавить упражнения · {count}/{max}
        </button>
      </div>
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
  header: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px' },
  search: {
    flex: 1, height: '44px', padding: '0 16px',
    background: 'var(--color-card)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', outline: 'none'
  },
  closeBtn: {
    width: '44px', height: '44px', flexShrink: 0,
    background: 'var(--color-card)', border: 'none', borderRadius: '14px',
    color: 'var(--color-text-secondary)', fontSize: '16px'
  },
  chipsRow: {
    display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 16px',
    flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', flexShrink: 0
  },
  // Панель подгрупп — «содержимое открытой вкладки группы».
  subPanel: {
    margin: '2px 16px 4px',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '16px',
    flexShrink: 0
  },
  subChipsRow: {
    display: 'flex', gap: '8px', overflowX: 'auto',
    flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch'
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
  list: {
    flex: '1 1 0%', minHeight: 0, height: '100%', overflowY: 'auto',
    padding: '8px 16px 110px',
    display: 'block',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y'
  },
  empty: { textAlign: 'center', padding: '40px 20px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-card)', borderRadius: '20px', padding: '10px', marginBottom: '10px' },
  preview: { width: '56px', height: '56px', flexShrink: 0, borderRadius: '16px', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewPlaceholder: { fontSize: '24px', opacity: 0.4 },
  rowContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  rowName: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowTags: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  rowTag: { padding: '2px 8px', borderRadius: '999px', fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' },
  rowTagSecondary: { background: 'rgba(255,255,255,0.08)', color: '#A0A0A0', fontWeight: 600 },
  addBtn: { width: '40px', height: '40px', flexShrink: 0, border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: 700 },
  // Футер поверх списка: лёгкое затемнение к низу, список уезжает под него.
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '28px 16px calc(16px + env(safe-area-inset-bottom))',
    background: 'linear-gradient(180deg, rgba(13,12,12,0) 0%, rgba(13,12,12,0.85) 40%, var(--color-bg) 85%)',
    pointerEvents: 'none'
  },
  doneBtn: {
    width: '100%', padding: '16px', border: 'none', borderRadius: '16px',
    background: 'var(--color-primary)', color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px',
    boxShadow: '0 4px 20px rgba(158, 209, 83, 0.3)',
    pointerEvents: 'auto'
  },
  limitToast: {
    position: 'absolute',
    left: '16px', right: '16px',
    bottom: 'calc(96px + env(safe-area-inset-bottom))',
    padding: '12px 14px',
    background: 'rgba(232, 69, 69, 0.16)',
    border: '1px solid rgba(232, 69, 69, 0.5)',
    borderRadius: '14px',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.35,
    color: '#FF6B6B',
    textAlign: 'center',
    zIndex: 60,
    pointerEvents: 'none',
    animation: 'menuOverlayFadeIn 0.18s ease-out forwards'
  }
}