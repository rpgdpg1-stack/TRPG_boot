import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getWorkoutDay } from '../features/programs/api'
import { getProgramBySlug } from '../features/programs/registry'
import { getQuickSet, getQuickSetSync, setQuickSet } from '../lib/quick-workout'
import ScreenTitle from '../components/ScreenTitle'
import ActionButton from '../components/ActionButton'
import ConfirmModal from '../components/ConfirmModal'
import QuickPickList from '../components/QuickPickList'
import RocketIcon from '../components/RocketIcon'
import SkeletonCard from '../components/workout/SkeletonCard'

/**
 * Настройка «Быстрой тренировки» для одного дня.
 *
 * Открывается ДОЛГИМ тапом по ракете в шапке дня — и работает для ЛЮБОЙ
 * программы, включая встроенные (Сплит, Фулбади), у которых конструктора нет.
 * Для своей программы то же самое дублируется вкладкой «Быстрая» в конструкторе:
 * набор один и тот же, поэтому правки видны и там, и там.
 *
 * Список — общий компонент `QuickPickList` (тот же, что в конструкторе).
 * Уход без сохранения ловит подтверждение, как в конструкторе.
 */
export default function QuickWorkout() {
  const { programId, day } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const place = location.state?.place || 'gym'

  const program = useMemo(() => getProgramBySlug(programId), [programId])
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState(null)
  const [confirmExit, setConfirmExit] = useState(false)

  const initial = useRef(null)
  const goBack = () => navigate(-1)

  useEffect(() => { window.scrollTo(0, 0); lockVerticalSwipes() }, [])

  // Док внизу свой — глобальный нижний скрим гасим (как в конструкторе).
  useEffect(() => {
    document.body.classList.add('hide-app-scrim')
    return () => document.body.classList.remove('hide-app-scrim')
  }, [])

  useEffect(() => {
    let cancelled = false
    getWorkoutDay(programId, day, place).then(list => {
      if (cancelled) return
      const arr = list || []
      setSlots(arr)
      setLoading(false)
      const saved = getQuickSetSync(programId, place, day)
      // Не настраивали — считаем отмеченным весь день: снимать лишнее проще,
      // чем набирать список с нуля.
      const start = saved || arr.map(s => s.exercise_id)
      setPicked(start)
      initial.current = JSON.stringify(start)
      getQuickSet(programId, place, day).then(remote => {
        if (!cancelled && remote) {
          setPicked(remote)
          initial.current = JSON.stringify(remote)
        }
      })
    })
    return () => { cancelled = true }
  }, [programId, day, place])

  const isDirty = () => initial.current !== null && initial.current !== JSON.stringify(picked)

  // «Назад» с несохранёнными правками — то же подтверждение, что в конструкторе.
  useEffect(() => {
    backButton.setHandler(() => {
      if (isDirty()) setConfirmExit(true)
      else goBack()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])

  const toggle = (id) => {
    haptic.selection()
    setPicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const save = () => {
    haptic.success()
    setQuickSet(programId, place, day, picked, slots.length)
    initial.current = JSON.stringify(picked)
    goBack()
  }

  const items = slots.map(s => ({ id: s.exercise_id, exercise: s }))

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Быстрая</ScreenTitle>

      <div style={styles.head}>
        <span style={styles.headIcon}><RocketIcon size={26} lit /></span>
        <div style={styles.headTitle}>
          {program ? `День ${day}` : 'День'}
        </div>
      </div>

      {loading ? (
        <div style={styles.list}>{[0, 1, 2].map(i => <SkeletonCard key={i} />)}</div>
      ) : (
        <QuickPickList items={items} picked={picked || []} onToggle={toggle} />
      )}

      <div style={styles.dock}>
        <div className="dock-scrim" />
        <ActionButton onClick={save} variant="primary" hug>Сохранить</ActionButton>
      </div>

      {confirmExit && (
        <ConfirmModal
          title="Сохранить изменения?"
          text="Набор быстрой тренировки изменён."
          onClose={() => setConfirmExit(false)}
          actions={[
            { label: 'Не сохранять', onClick: () => { setConfirmExit(false); haptic.light(); goBack() } },
            { label: 'Сохранить', onClick: () => { setConfirmExit(false); save() } }
          ]}
        />
      )}
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: '110px' },
  head: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 'var(--space-15)', marginBottom: 'var(--space-5)', textAlign: 'center'
  },
  headIcon: { display: 'inline-flex' },
  headTitle: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-title-size)',
    fontWeight: 800, color: 'var(--color-text)'
  },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  dock: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    display: 'flex', justifyContent: 'center',
    padding: 'var(--space-12) var(--space-4) var(--tabbar-bottom)',
    pointerEvents: 'none', zIndex: 40
  }
}
