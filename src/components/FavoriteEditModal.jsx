import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { getExerciseNoteCached, getExerciseNote, saveExerciseNote, NOTE_MAX_LENGTH } from '../lib/notes'
import { saveExerciseWeight } from '../features/exercises/api'
import { sanitizeWeightInput, normalizeWeightForSave } from '../features/exercises/weight-format'

/**
 * Мини-модалка любимого упражнения: рабочий вес + заметка. Без «сменить упражнение».
 * (Открывается тапом по карточке на странице «Любимые упражнения».)
 */
export default function FavoriteEditModal({ fav, onClose, onSaved }) {
  const [weight, setWeight] = useState(
    fav.weight_kg != null && Number(fav.weight_kg) > 0 ? String(fav.weight_kg) : ''
  )
  const [note, setNote] = useState(() => getExerciseNoteCached(fav.exercise_id) || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getExerciseNote(fav.exercise_id).then(n => { if (!cancelled) setNote(n || '') })
    return () => { cancelled = true }
  }, [fav.exercise_id])

  const onWeight = (e) => setWeight(sanitizeWeightInput(e.target.value))

  const save = async () => {
    setSaving(true)
    haptic.light()
    const w = normalizeWeightForSave(weight)
    if (!w.invalid) await saveExerciseWeight(fav.exercise_id, w.value)
    await saveExerciseNote(fav.exercise_id, note)
    setSaving(false)
    haptic.success()
    onSaved?.()
    onClose()
  }

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>{cap(fav.name)}</div>

        <label style={styles.label}>Рабочий вес, кг</label>
        <input
          style={styles.input}
          value={weight}
          onChange={onWeight}
          inputMode="decimal"
          placeholder="0"
          aria-label="Рабочий вес"
        />

        <label style={{ ...styles.label, marginTop: '12px' }}>Заметка</label>
        <textarea
          style={styles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
          placeholder="Техника, ощущения, напоминание…"
          rows={3}
        />

        <button style={styles.saveBtn} className="press-tile" onClick={save} disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button style={styles.cancel} onClick={onClose}>Отмена</button>
      </div>
    </div>,
    document.body
  )
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(13,12,12,0.85)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 9999
  },
  modal: {
    width: '100%', maxWidth: '340px', background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)', padding: '20px',
    display: 'flex', flexDirection: 'column'
  },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: 'var(--color-text)', marginBottom: '14px' },
  label: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px', marginBottom: '6px' },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-medium)',
    background: 'var(--surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', outline: 'none'
  },
  textarea: {
    width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-medium)', resize: 'none',
    background: 'var(--surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)', fontSize: '14px', lineHeight: 1.4, outline: 'none'
  },
  saveBtn: {
    marginTop: '16px', width: '100%', minHeight: '48px', borderRadius: 'var(--radius-medium)', border: 'none',
    background: 'var(--color-primary)', color: '#0D0C0C', fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: '15px', cursor: 'pointer'
  },
  cancel: {
    marginTop: '8px', width: '100%', padding: '10px', background: 'transparent', border: 'none',
    color: 'var(--color-text-secondary)', fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
  }
}
