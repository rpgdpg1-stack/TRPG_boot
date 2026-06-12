import { useState } from 'react'
import { saveFriendProgram } from '../features/programs/customProgram'
import { haptic } from '../lib/telegram'

/**
 * Модалка сохранения программы, полученной по ссылке от друга.
 *
 * snapshot — результат api_get_shared_program: { token, name, author_name, days, days_count }.
 * replacing — у получателя уже есть программа от друга (будет заменена).
 */
export default function SaveFriendProgramModal({ snapshot, replacing, onSaved, onClose }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const exCount = countExercises(snapshot.days)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    haptic.medium()
    try {
      await saveFriendProgram(snapshot.token)
      haptic.success()
      onSaved()
    } catch (e) {
      console.error('[SaveFriendProgramModal] save error:', e)
      setSaving(false)
      setError('Не удалось сохранить. Попробуй ещё раз.')
      haptic.error()
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.emoji}>🤝</div>
        <div style={styles.title}>{snapshot.name}</div>
        {snapshot.author_name && <div style={styles.author}>от {snapshot.author_name}</div>}
        <div style={styles.meta}>{snapshot.days_count} дн. · {exCount} упр.</div>

        {replacing && (
          <div style={styles.warn}>У тебя уже есть программа от друга — она будет заменена.</div>
        )}
        {error && <div style={styles.error}>{error}</div>}

        <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? 'СОХРАНЯЮ…' : (replacing ? 'ЗАМЕНИТЬ ПРОГРАММУ ДРУГА' : 'СОХРАНИТЬ ПРОГРАММУ')}
        </button>
        <button onClick={onClose} disabled={saving} style={styles.cancelBtn}>Отмена</button>
      </div>
    </div>
  )
}

function countExercises(days) {
  if (!days) return 0
  return Object.values(days).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
  },
  modal: {
    width: '100%', maxWidth: '340px',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)',
    padding: '28px 24px', textAlign: 'center',
    border: '1px solid rgba(255,255,255,0.08)'
  },
  emoji: { fontSize: '44px', marginBottom: '12px' },
  title: { fontFamily: 'var(--font-manrope)', fontSize: '20px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '4px' },
  author: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' },
  meta: { fontFamily: 'var(--font-tiny5)', fontSize: '14px', color: 'var(--color-primary)', letterSpacing: '1px', marginBottom: '20px' },
  warn: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: '#E0A23C', background: 'rgba(224,162,60,0.1)', borderRadius: '12px', padding: '10px 12px', marginBottom: '16px' },
  error: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: '#E84545', marginBottom: '12px' },
  saveBtn: {
    width: '100%', padding: '16px', marginBottom: '10px',
    background: 'var(--color-primary)', color: '#0D0C0C', border: 'none', borderRadius: '16px',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 800, letterSpacing: '1px'
  },
  cancelBtn: {
    width: '100%', padding: '14px',
    background: 'transparent', color: 'var(--color-text-secondary)', border: 'none',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600
  }
}