import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { localGet } from '../utils/storage'
import { getProgramBySlug } from '../features/programs/registry'
import { getWorkoutDay } from '../features/programs/api'
import { MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'

/**
 * Пикер любимого упражнения — ТОЛЬКО из закреплённой программы раздела «Силовая»
 * (favorite_programs['gym']). Переключалка дней (A/B/C) + упражнения с круглым
 * чекбоксом, лимит 1. Нет закрепа → подсказка закрепить программу.
 *
 * Пропсы: usedIds (Set уже-любимых), onPick(exerciseId), onClose.
 */
function readPinnedGym() {
  try { return (JSON.parse(localGet('favorite_programs') || '{}') || {}).gym || null } catch { return null }
}

export default function FavoritePicker({ usedIds, onPick, onClose }) {
  const navigate = useNavigate()
  const pinnedSlug = readPinnedGym()
  const program = pinnedSlug ? getProgramBySlug(pinnedSlug) : null
  const days = program ? Object.keys(program.data?.days || {}) : []

  const [day, setDay] = useState(days[0] || null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // exercise_id

  useEffect(() => {
    if (!program || !day) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    getWorkoutDay(pinnedSlug, day, 'gym').then(arr => {
      if (!cancelled) { setSlots(arr || []); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [pinnedSlug, day, program])

  // Группировка по мышце (заголовки групп, как в дне тренировки).
  const groups = useMemo(() => {
    const map = new Map()
    for (const s of slots) {
      if (!map.has(s.muscle_group)) map.set(s.muscle_group, [])
      map.get(s.muscle_group).push(s)
    }
    return [...map.entries()]
  }, [slots])

  const excluded = usedIds instanceof Set ? usedIds : new Set(usedIds || [])

  const pickRow = (s) => {
    if (excluded.has(s.exercise_id)) return
    haptic.selection()
    setSelected(prev => (prev === s.exercise_id ? null : s.exercise_id))
  }

  const save = () => {
    if (!selected) return
    haptic.success()
    onPick(selected)
  }

  const goPin = () => { haptic.light(); onClose(); navigate('/category/gym') }

  return createPortal(
    <div style={styles.overlay}>
      <div style={styles.header}>
        <button style={styles.close} onClick={onClose} aria-label="Закрыть">✕</button>
        <div style={styles.title}>{program ? cap(program.title) : 'Любимое упражнение'}</div>
        <div style={{ width: '32px' }} />
      </div>

      {!program ? (
        <div style={styles.empty}>
          <div style={styles.emptyTitle}>Нет закреплённой программы</div>
          <div style={styles.emptyText}>
            Закрепи программу в разделе «Силовая» — и добавляй любимые упражнения отсюда.
          </div>
          <button style={styles.emptyBtn} className="press-tile" onClick={goPin}>К разделу «Силовая»</button>
        </div>
      ) : (
        <>
          {days.length > 1 && (
            <div style={styles.dayRow}>
              {days.map(d => (
                <button
                  key={d}
                  className="press-tile"
                  onClick={() => { haptic.light(); setDay(d) }}
                  style={{ ...styles.dayPill, ...(d === day ? styles.dayPillActive : {}) }}
                >
                  День {d}
                </button>
              ))}
            </div>
          )}

          <div style={styles.list}>
            {loading ? (
              <div style={styles.loading}>Загрузка…</div>
            ) : (
              groups.map(([group, rows]) => {
                const color = getMuscleGroupColors(group).accent
                return (
                  <div key={group}>
                    <div style={{ ...styles.groupHead, color }}>{MUSCLE_GROUP_LABELS[group] || group}</div>
                    {rows.map(s => {
                      const isUsed = excluded.has(s.exercise_id)
                      const isSel = selected === s.exercise_id
                      const locked = selected && !isSel // выбран другой → блокируем
                      return (
                        <button
                          key={s.exercise_id + s.order_num}
                          onClick={() => pickRow(s)}
                          disabled={isUsed}
                          style={{ ...styles.row, opacity: isUsed || locked ? 0.4 : 1 }}
                        >
                          <span style={{ ...styles.check, ...(isSel ? { borderColor: color, background: color } : {}) }}>
                            {isSel && <span style={styles.checkMark}>✓</span>}
                          </span>
                          <span style={styles.exName}>{cap(s.exercise_name)}</span>
                          {isUsed && <span style={styles.usedTag}>в любимых</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div style={styles.footer}>
            <button
              style={{ ...styles.saveBtn, opacity: selected ? 1 : 0.4 }}
              className={selected ? 'press-tile' : undefined}
              onClick={save}
              disabled={!selected}
            >
              Сохранить
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  )
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--color-bg)',
    display: 'flex', flexDirection: 'column'
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'calc(var(--tg-safe-top) + 6px) 16px 10px'
  },
  close: {
    width: '32px', height: '32px', border: 'none', background: 'transparent',
    color: 'var(--color-text)', fontSize: '18px', cursor: 'pointer'
  },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: 'var(--color-text)' },
  dayRow: { display: 'flex', gap: '6px', padding: '4px 16px 12px' },
  dayPill: {
    flex: 1, minHeight: '34px', borderRadius: 'var(--radius-pill)',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    color: 'var(--color-text-inactive)', fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '13px',
    cursor: 'pointer'
  },
  dayPillActive: { background: 'var(--color-surface-active)', color: 'var(--color-primary)' },
  list: { flex: 1, overflowY: 'auto', padding: '0 16px 12px', WebkitOverflowScrolling: 'touch' },
  groupHead: {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '11px', letterSpacing: '1.5px',
    textTransform: 'uppercase', margin: '14px 0 6px', paddingLeft: '2px'
  },
  row: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 4px',
    background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-hairline)',
    textAlign: 'left', cursor: 'pointer', transition: 'opacity 0.15s ease'
  },
  check: {
    flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.25)', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center'
  },
  checkMark: { color: '#0D0C0C', fontSize: '13px', fontWeight: 900, lineHeight: 1 },
  exName: { flex: 1, minWidth: 0, fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' },
  usedTag: { flexShrink: 0, fontFamily: 'var(--font-manrope)', fontSize: '11px', color: 'var(--color-text-secondary)' },
  footer: { padding: '10px 16px calc(var(--tg-safe-top) + 12px)', borderTop: '1px solid var(--border-hairline)' },
  saveBtn: {
    width: '100%', minHeight: '50px', borderRadius: 'var(--radius-medium)', border: 'none',
    background: 'var(--color-primary)', color: '#0D0C0C',
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: '15px', letterSpacing: '0.5px', cursor: 'pointer'
  },
  loading: { textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-manrope)', fontSize: '13px' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '24px', textAlign: 'center' },
  emptyTitle: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: 'var(--color-text)' },
  emptyText: { fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, maxWidth: '280px' },
  emptyBtn: {
    marginTop: '8px', padding: '12px 20px', borderRadius: 'var(--radius-medium)', border: 'none',
    background: 'var(--color-primary)', color: '#0D0C0C', fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: '14px', cursor: 'pointer'
  }
}
