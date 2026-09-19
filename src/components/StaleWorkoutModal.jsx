import { useEffect, useRef, useState } from 'react'
import ConfirmModal from './ConfirmModal'
import { getActiveWorkout, onActiveWorkoutChange, clearActiveWorkout } from '../lib/active-workout'
import { isWorkoutStale, lastTickOf } from '../utils/workout-stale'
import { loadWorkoutProgress, clearWorkoutProgress } from '../utils/workout-progress'
import { getProgramBySlug, getProgramDaySlots } from '../features/programs/registry'
import { finishWorkout, getWorkoutDay } from '../features/programs/api'
import { setLastCompletedDay } from '../lib/storage'
import { getPrefSync } from '../lib/prefs'
import { localGet } from '../utils/storage'
import { SWIM_PROGRAM, swimMinutesForMeters } from '../data/programs/swim'
import { mskParts } from '../utils/dates'
import { haptic } from '../lib/telegram'

/**
 * «Тренировка не завершена» — модалка для забытой тренировки.
 *
 * Человек начал тренировку и не нажал «Завершить». Раньше таймер копил часы
 * без предела, «Начать» на других днях была заблокирована, а позднее
 * «Завершить» записывало фальшивые 6 ч на день ЗАВЕРШЕНИЯ и съедало
 * сегодняшний лимит «1 тренировка в сутки».
 *
 * Когда считаем забытой — см. isWorkoutStale (90 мин после последней галочки,
 * 3 ч после старта, если галочек нет).
 *
 * Решение одно, но обязательное: тап мимо модалку НЕ закрывает — иначе человек
 * так и остался бы заблокирован, а модалка всплывала бы на каждом запуске.
 *  - «Засчитать» — завершаем задним числом, в момент последней галочки: день
 *    и длительность честные, сегодняшний лимит свободен;
 *  - «Не засчитывать» — сессия снимается без записи;
 *  - ни одной галочки — засчитывать нечего, только «Понятно»;
 *  - старше 7 дней — сервер задним числом дальше не принимает, только снять.
 *
 * Живёт в App: всплывает на любом экране (главная при запуске, день по ссылке,
 * возврат из фона).
 */
const CHECK_EVERY_MS = 60 * 1000
const FIRST_CHECK_DELAY_MS = 1500 // даём App свести сессию с сервером
const MAX_RETRO_MS = 7 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000 // предел сервера минус запас
const SCROLL_KEY = 'workout-scroll' // тот же ключ, что у позиции скролла в WorkoutDay

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря']

function formatWhen(iso) {
  const { m, d, hh, min } = mskParts(iso)
  return `${d} ${MONTHS[m]} в ${hh}:${String(min).padStart(2, '0')}`
}

function formatDay(iso) {
  const { m, d } = mskParts(iso)
  return `${d} ${MONTHS[m]}`
}

// Дистанция заплыва — тот же расчёт, что на экране заплыва (круги основы из настроек).
function swimMeters(slug) {
  const raw = getPrefSync(`swim-reps:${slug}`, null) ?? localGet(`swim-reps:${slug}`)
  const main = SWIM_PROGRAM.blocks.find(b => b.id === 'main')
  const reps = parseInt(raw, 10) || main?.repeat || 1
  return SWIM_PROGRAM.blocks.reduce((sum, b) => {
    const round = b.swims.reduce((s, w) => s + w.meters, 0)
    return sum + round * (b.id === 'main' ? reps : (b.repeat || 1))
  }, 0)
}

function programTitle(prog) {
  if (!prog?.title) return 'Тренировка'
  return prog.source === 'custom'
    ? prog.title
    : prog.title.charAt(0).toUpperCase() + prog.title.slice(1).toLowerCase()
}

/** Собрать всё, что нужно модалке. null — показывать нечего. */
function readStale() {
  const session = getActiveWorkout()
  if (!session) return null
  const prog = getProgramBySlug(session.programId)
  if (!prog) return null // своя программа ещё не загрузилась — проверим позже
  const swim = prog.kind === 'swim'
  const place = session.place || 'gym'
  const done = swim ? [] : loadWorkoutProgress(session.programId, session.day, place)
  if (!isWorkoutStale(session, done.length)) return null

  const meters = swim ? swimMeters(session.programId) : 0
  // Когда «закончили»: силовая — последняя галочка; заплыв галочек не ставит —
  // старт + оценка времени по дистанции.
  const finishedAt = swim
    ? new Date(new Date(session.startedAt).getTime() + swimMinutesForMeters(meters) * 60000).toISOString()
    : lastTickOf(session, done.length)

  return {
    session, prog, swim, place, done, meters, finishedAt,
    total: swim ? 0 : getProgramDaySlots(session.programId, session.day, place).length,
    tooOld: !!finishedAt && Date.now() - new Date(finishedAt).getTime() > MAX_RETRO_MS
  }
}

function dropSession(s) {
  clearWorkoutProgress(s.session.programId, s.session.day, s.place)
  try { localStorage.removeItem(`${SCROLL_KEY}:${s.session.programId}/${s.session.day}/${s.place}`) } catch { /* ignore */ }
  clearActiveWorkout()
}

export default function StaleWorkoutModal() {
  const [stale, setStale] = useState(null)
  // Итог после «Засчитать», когда за тот день уже есть тренировка раздела.
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState('')
  const busy = useRef(false)

  useEffect(() => {
    const check = () => { if (!busy.current) setStale(readStale()) }
    const first = setTimeout(check, FIRST_CHECK_DELAY_MS)
    const every = setInterval(check, CHECK_EVERY_MS)
    const off = onActiveWorkoutChange(check)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      off()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (notice) {
    return (
      <ConfirmModal
        title={notice.title}
        text={notice.text}
        onClose={() => setNotice(null)}
        actions={[{ label: 'Понятно', role: 'primary', onClick: () => setNotice(null) }]}
      />
    )
  }

  if (!stale) return null
  const { session, prog, swim, done, total, meters, finishedAt, tooOld } = stale

  const discard = () => {
    haptic.light()
    dropSession(stale)
    setStale(null)
    setError('')
  }

  const count = async () => {
    if (busy.current) return
    busy.current = true
    setError('')
    try {
      let exerciseIds = []
      if (!swim) {
        const slots = await getWorkoutDay(session.programId, session.day, stale.place)
        exerciseIds = slots.filter(s => done.includes(s.order_num)).map(s => s.exercise_id).filter(Boolean)
      }
      const result = await finishWorkout(
        session.programId, session.day, exerciseIds,
        swim ? meters : null, session.startedAt, finishedAt
      )
      if (!result) {
        haptic.error()
        setError('Не получилось сохранить. Проверь интернет и попробуй ещё раз.')
        return
      }
      await setLastCompletedDay(session.programId, session.day)
      dropSession(stale)
      setStale(null)
      if (result.alreadyCompletedToday) {
        haptic.warning()
        setNotice({
          title: 'Этот день уже записан',
          text: `За ${formatDay(finishedAt)} ${swim ? 'заплыв' : 'тренировка'} этого раздела уже есть — вторую не засчитали.`
        })
      } else {
        haptic.success()
      }
    } catch (e) {
      console.error('[stale-workout] count error:', e)
      haptic.error()
      setError('Не получилось сохранить. Попробуй ещё раз.')
    } finally {
      busy.current = false
    }
  }

  const head = `${programTitle(prog)}${swim ? '' : ` · день ${session.day}`}, начата ${formatWhen(session.startedAt)}.`
  const nothing = !swim && done.length === 0
  const detail = swim
    ? `Дистанция — ${meters} м.`
    : nothing
      ? 'Ни одно упражнение не отмечено — засчитывать нечего.'
      : `Отмечено ${done.length} из ${total}. Засчитаем по времени последней отметки.`
  const oldNote = tooOld ? ' Она старше недели — задним числом её уже не записать.' : ''

  const actions = nothing
    ? [{ label: 'Понятно', role: 'primary', onClick: discard }]
    : tooOld
      ? [{ label: 'Не засчитывать', role: 'destructive', onClick: discard }]
      : [
          { label: 'Не засчитывать', role: 'destructive', onClick: discard },
          { label: 'Засчитать', role: 'primary', onClick: count }
        ]

  return (
    <ConfirmModal
      title="Тренировка не завершена"
      icon="clock"
      text={`${head} ${detail}${oldNote}${error ? ` ${error}` : ''}`}
      // Тап мимо не закрывает: решение нужно, иначе тренировка так и висит.
      required
      onClose={() => {}}
      actions={actions}
    />
  )
}
