import { useState } from 'react'
import { saveFriendProgram } from '../features/programs/customProgram'
import { haptic } from '../lib/telegram'
import Dialog from './Dialog'

/**
 * Модалка сохранения программы, полученной по ссылке от друга.
 *
 * snapshot — результат api_get_shared_program: { token, name, author_name, days, days_count }.
 * replacing — у получателя уже есть программа от друга (будет заменена).
 * Вид — общий Dialog: Primary «Сохранить программу» сверху, тихая «Отмена» под ней.
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

  const meta = [snapshot.author_name && `от ${snapshot.author_name}`, `${snapshot.days_count} дн.`, `${exCount} упр.`].filter(Boolean).join(' · ')

  return (
    <Dialog
      icon="friends-fill"
      title={snapshot.name}
      text={meta}
      onClose={saving ? undefined : onClose}
      layout="column"
      actions={[
        { label: replacing ? 'Заменить программу друга' : 'Сохранить программу', role: 'primary', onClick: handleSave, loading: saving },
        { label: 'Отмена', role: 'tertiary', onClick: onClose, disabled: saving }
      ]}
    >
      {replacing && <div style={styles.warn}>У тебя уже есть программа от друга — она будет заменена.</div>}
      {error && <div style={styles.error}>{error}</div>}
    </Dialog>
  )
}

function countExercises(days) {
  if (!days) return 0
  return Object.values(days).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
}

const styles = {
  warn: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-caution)', background: 'var(--color-caution-surface)', borderRadius: 'var(--radius-small)', padding: 'var(--space-3)', marginTop: 'var(--space-4)', width: '100%' },
  error: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-error)', marginTop: 'var(--space-3)' }
}
