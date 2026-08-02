import { useState, useRef } from 'react'
import { saveFriendProgram } from '../features/programs/customProgram'
import { haptic } from '../lib/telegram'
import ActionButton from './ActionButton'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Модалка сохранения программы, полученной по ссылке от друга.
 *
 * snapshot — результат api_get_shared_program: { token, name, author_name, days, days_count }.
 * replacing — у получателя уже есть программа от друга (будет заменена).
 */
export default function SaveFriendProgramModal({ snapshot, replacing, onSaved, onClose }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
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
    <div ref={overlayRef} style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.emoji}>🤝</div>
        <div style={styles.title}>{snapshot.name}</div>
        {snapshot.author_name && <div style={styles.author}>от {snapshot.author_name}</div>}
        <div style={styles.meta}>{snapshot.days_count} дн. · {exCount} упр.</div>

        {replacing && (
          <div style={styles.warn}>У тебя уже есть программа от друга — она будет заменена.</div>
        )}
        {error && <div style={styles.error}>{error}</div>}

        <ActionButton variant="gray" size="sm" onClick={handleSave} disabled={saving} style={{ width: '100%', marginBottom: 'var(--space-3)' }}>
          {saving ? 'СОХРАНЯЮ…' : (replacing ? 'ЗАМЕНИТЬ ПРОГРАММУ ДРУГА' : 'СОХРАНИТЬ ПРОГРАММУ')}
        </ActionButton>
        <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={saving} style={{ width: '100%', border: 'none' }}>Отмена</ActionButton>
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
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)'
  },
  modal: {
    width: '100%', maxWidth: '340px',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-6)', textAlign: 'center',
    border: '1px solid var(--layer-2)'
  },
  emoji: { fontSize: '44px', marginBottom: 'var(--space-3)' },
  title: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-heading-size)', fontWeight: 800, color: 'var(--color-text)', marginBottom: 'var(--space-1)' },
  author: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' },
  meta: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-button-size)', color: 'var(--color-primary)', letterSpacing: '1px', marginBottom: 'var(--space-5)' },
  warn: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: '#E0A23C', background: 'rgba(224,162,60,0.1)', borderRadius: 'var(--radius-small)', padding: 'var(--space-3) var(--space-3)', marginBottom: 'var(--space-4)' },
  error: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-error)', marginBottom: 'var(--space-3)' },
}