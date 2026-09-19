import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import { useNavigate } from 'react-router-dom'
import {
  loadMyExercises, adoptProgramExercises, MY_EXERCISE_LIMIT
} from '../features/programs/userExercises'
import { loadMyPrograms } from '../features/programs/customProgram'
import { haptic } from '../lib/telegram'

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

  return (
    <Dialog
      icon="alert"
      title="Программа пока закрыта"
      text={<>
        {program?.authorName ? `${program.authorName} собрал` : 'Автор собрал'} её
        со своими упражнениями — <b style={styles.num}>{need}</b>{' '}
        {plural(need, 'штука', 'штуки', 'штук')}. Чтобы вести в них вес,
        они должны стать твоими.
      </>}
      onClose={onClose}
      layout="column"
      actions={[
        enough
          ? { label: 'Скопировать себе', role: 'primary', onClick: adopt, loading: busy }
          : { label: 'Открыть конструктор', role: 'secondary', onClick: toConstructor },
        { label: 'Позже', role: 'tertiary', onClick: onClose }
      ]}
    >
      {free !== null && !enough && (
        <div style={styles.text}>
          Своих упражнений можно держать {MY_EXERCISE_LIMIT}, свободно{' '}
          <b style={styles.num}>{Math.max(free, 0)}</b>. Освободи ещё{' '}
          <b style={styles.num}>{short}</b> — удали лишние в конструкторе,
          долгим нажатием по упражнению.
        </div>
      )}
      {error && <div style={styles.error}>{error}</div>}
    </Dialog>
  )
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const styles = {
  text: {
    fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 500,
    color: 'var(--color-text-secondary)', lineHeight: 1.45, marginTop: 'var(--space-2)'
  },
  num: { color: 'var(--color-primary)', fontWeight: 800 },
  error: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 700, color: 'var(--color-error)', marginTop: 'var(--space-2)'
  }
}
