import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  loadMyExercises, adoptProgramExercises, MY_EXERCISE_LIMIT
} from '../features/programs/userExercises'
import { loadMyPrograms } from '../features/programs/customProgram'
import { haptic } from '../lib/telegram'
import ModalButton from './ModalButton'
import ActionButton from './ActionButton'

/**
 * Программа от друга заблокирована: в ней есть упражнения, которые автор
 * придумал сам.
 *
 * Одолжить их нельзя — в упражнение нужно вести СВОЙ вес, а вес привязан
 * к упражнению. Поэтому они копируются получателю и становятся его личными:
 * дальше он их правит, удаляет и наращивает в них вес наравне со своими.
 *
 * Копия упирается в тот же лимит 12. Не хватило места — программа не пропадает
 * и не чинится сама собой: человеку честно говорят, сколько мест освободить,
 * и дают дорогу туда, где это делается (конструктор → пикер → «Мои»).
 */
export default function AdoptExercisesModal({ program, onClose, onAdopted }) {
  const navigate = useNavigate()
  const [free, setFree] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const need = program?.pendingCustom || 0

  useEffect(() => {
    let cancelled = false
    loadMyExercises().then(list => {
      if (!cancelled) setFree(MY_EXERCISE_LIMIT - list.length)
    })
    return () => { cancelled = true }
  }, [])

  const enough = free !== null && free >= need
  const short = free === null ? 0 : Math.max(need - free, 0)

  const adopt = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await adoptProgramExercises(program.dbId)
      if (res?.ok) {
        // Перечитываем программы: блокировка снимается по pending_custom из БД,
        // а он пересчитывается только там.
        await loadMyPrograms()
        haptic.success()
        onAdopted?.()
      } else {
        haptic.error()
        setFree(res?.free ?? 0)
        setBusy(false)
      }
    } catch (e) {
      haptic.error()
      setError(e?.message || 'Не удалось скопировать')
      setBusy(false)
    }
  }

  const toConstructor = () => {
    haptic.light()
    onClose?.()
    navigate('/constructor')
  }

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>Программа пока закрыта</div>

        <div style={styles.text}>
          {program?.authorName ? `${program.authorName} собрал` : 'Автор собрал'} её
          со своими упражнениями — <b style={styles.num}>{need}</b>{' '}
          {plural(need, 'штука', 'штуки', 'штук')}. Чтобы вести в них вес,
          они должны стать твоими.
        </div>

        {free !== null && !enough && (
          <div style={styles.text}>
            Своих упражнений можно держать {MY_EXERCISE_LIMIT}, свободно{' '}
            <b style={styles.num}>{Math.max(free, 0)}</b>. Освободи ещё{' '}
            <b style={styles.num}>{short}</b> — удали лишние в конструкторе,
            долгим нажатием по упражнению.
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          {enough ? (
            <ActionButton onClick={adopt} variant="primary" hug disabled={busy}>
              {busy ? 'Копирование…' : 'Скопировать себе'}
            </ActionButton>
          ) : (
            <ActionButton onClick={toConstructor} variant="neutral" hug>
              Открыть конструктор
            </ActionButton>
          )}
        </div>

        <div style={styles.close}>
          <ModalButton onClick={onClose} style={{ width: '100%' }}>Позже</ModalButton>
        </div>
      </div>
    </div>,
    document.body
  )
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top) + 30px) var(--space-5) var(--space-5)'
  },
  modal: {
    width: '100%', maxWidth: '360px',
    background: 'var(--surface-raised)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    boxShadow: 'var(--shadow-modal)'
  },
  title: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-title-size)',
    fontWeight: 700, color: 'var(--color-text)', textAlign: 'center'
  },
  text: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)', lineHeight: 1.5, textAlign: 'center'
  },
  num: { color: 'var(--color-primary)', fontWeight: 800 },
  error: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 700, color: 'var(--color-error)', textAlign: 'center'
  },
  actions: { display: 'flex', justifyContent: 'center', marginTop: 'var(--space-1)' },
  close: { display: 'flex' }
}
