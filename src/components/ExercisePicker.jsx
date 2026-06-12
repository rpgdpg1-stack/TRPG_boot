import { useState, useEffect, useMemo, useRef } from 'react'
import { loadExerciseCatalog } from '../features/programs/customProgram'
import { MUSCLE_GROUP_LABELS, SUB_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import { haptic } from '../lib/telegram'

/**
 * Пикер упражнений для конструктора.
 *
 * Полноэкранный оверлей. Фильтр: группа мышц → подгруппа + поиск по названию.
 * excludeIds — id упражнений, уже добавленных в текущий день (показываем галочку).
 * atLimit — день уже заполнен (10): добавление заблокировано.
 *
 * onAdd(exercise) — добавить выбранное. onClose() — закрыть.
 */
export default function ExercisePicker({ excludeIds, atLimit, onToggle }) {
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState(null)
  const [activeSub, setActiveSub] = useState(null)
  const inputRef = useRef(null)

  const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])

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

  // Группы в порядке появления (каталог уже отсортирован по priority),
  // и подгруппы внутри каждой группы.
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
    return list
  }, [catalog, activeGroup, activeSub, search])

  const handleGroupTap = (g) => {
    haptic.light()
    setActiveSub(null)
    setActiveGroup(prev => (prev === g ? null : g))
  }

  const handleToggle = (ex) => {
    const isAdded = excluded.has(ex.id)
    if (!isAdded && atLimit) return // добавить сверх лимита нельзя
    haptic.selection()
    onToggle(ex)
  }

  return (
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

      {atLimit && (
        <div style={styles.limitNote}>В дне уже 10 упражнений — лимит</div>
      )}

      {/* Чипы групп мышц */}
      <div style={styles.chipsRow}>
        {groups.map(({ group }) => {
          const c = getMuscleGroupColors(group)
          const active = activeGroup === group
          return (
            <button
              key={group}
              onClick={() => handleGroupTap(group)}
              style={{
                ...styles.chip,
                background: active ? c.tag : 'rgba(255,255,255,0.06)',
                color: active ? '#fff' : 'var(--color-text-secondary)'
              }}
            >
              {MUSCLE_GROUP_LABELS[group] || group}
            </button>
          )
        })}
      </div>

      {/* Чипы подгрупп выбранной группы */}
      {activeGroup && activeSubs.length > 0 && (
        <div style={styles.chipsRow}>
          {activeSubs.map(sub => {
            const active = activeSub === sub
            return (
              <button
                key={sub}
                onClick={() => { haptic.light(); setActiveSub(prev => (prev === sub ? null : sub)) }}
                style={{
                  ...styles.subChip,
                  background: active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#fff' : 'var(--color-text-secondary)'
                }}
              >
                {SUB_GROUP_LABELS[sub] || sub}
              </button>
            )
          })}
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
                    {MUSCLE_GROUP_LABELS[ex.muscle_group] || ex.muscle_group}
                  </span>
                  <span style={{ ...styles.rowTag, ...styles.rowTagSecondary }}>
                    {SUB_GROUP_LABELS[ex.sub_group] || ex.sub_group}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleToggle(ex)}
                disabled={disabled}
                style={{
                  ...styles.addBtn,
                  background: added ? 'rgba(158,209,83,0.15)' : 'var(--color-primary)',
                  color: added ? 'var(--color-primary)' : '#0D0C0C'
                }}
                aria-label={added ? 'Убрать' : 'Добавить'}
              >
                {added ? '✓' : '+'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'var(--color-bg)',
    display: 'flex', flexDirection: 'column',
    paddingTop: 'var(--tg-safe-top)'
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
  limitNote: {
    margin: '0 16px 4px', padding: '8px 12px',
    background: 'rgba(232,69,69,0.1)', borderRadius: '10px',
    fontFamily: 'var(--font-manrope)', fontSize: '12px', color: '#E84545', textAlign: 'center'
  },
  chipsRow: {
    display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 16px',
    flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch'
  },
  chip: {
    flexShrink: 0, padding: '8px 14px', border: 'none', borderRadius: '999px',
    fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 700,
    whiteSpace: 'nowrap', letterSpacing: '0.3px'
  },
  subChip: {
    flexShrink: 0, padding: '6px 12px', border: 'none', borderRadius: '999px',
    fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
  },
  list: { flex: 1, overflowY: 'auto', padding: '8px 16px 32px', display: 'flex', flexDirection: 'column', gap: '10px' },
  empty: { textAlign: 'center', padding: '40px 20px', fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-card)', borderRadius: '20px', padding: '10px' },
  preview: { width: '56px', height: '56px', flexShrink: 0, borderRadius: '16px', overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewPlaceholder: { fontSize: '24px', opacity: 0.4 },
  rowContent: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  rowName: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowTags: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  rowTag: { padding: '2px 8px', borderRadius: '999px', fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' },
  rowTagSecondary: { background: 'rgba(255,255,255,0.08)', color: '#A0A0A0', fontWeight: 600 },
  addBtn: { width: '40px', height: '40px', flexShrink: 0, border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: 700 }
}