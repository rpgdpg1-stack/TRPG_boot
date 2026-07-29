import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync, getDailyQuests, getDailyQuestsSync } from '../lib/storage'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT, MONTHS_RU } from '../utils/history'
import { getFavoritesSync, getFavoriteExercises, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { WINDOWS, getRecommendedForWindow, getActivitiesConfigSync, fetchActivitiesConfig, getCustomDone, getCurrentWindowIndex } from '../lib/activities'
import { EVENTS, on } from '../lib/events'
import UiIcon from './UiIcon'

/**
 * Три равные карточки-входа в блоке «Мой прогресс» (главная): Статистика,
 * Любимые, Активности. Равнозначные разделы → одинаковый размер и одинаковая
 * раскладка в три строки:
 *   иконка → ЗНАЧЕНИЕ (крупная зелёная цифра + серая единица; у Активностей
 *   вместо цифр — три полоски окон) → тихая подпись-контекст внизу
 *   («Июль» / «Твой топ» / текущее окно «Утро–День–Вечер»).
 */
export default function HomeCards() {
  const navigate = useNavigate()

  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [favCount, setFavCount] = useState(() => (getFavoritesSync() || []).length)
  const [config, setConfig] = useState(getActivitiesConfigSync)
  const [completed, setCompleted] = useState(() => getDailyQuestsSync())
  const [customDone, setCustomDone] = useState(() => getCustomDone())

  useEffect(() => {
    let alive = true
    const load = () => {
      getRecentWorkouts(HISTORY_FETCH_LIMIT).then(d => { if (alive) setWorkouts(d || []) })
      getFavoriteExercises().then(l => { if (alive) setFavCount((l || []).length) })
      getDailyQuests().then(r => { if (alive && Object.keys(r).length) setCompleted(r) })
    }
    load()
    fetchActivitiesConfig().then(c => { if (alive && c) setConfig(c) })
    const off = on(EVENTS.USER_CHANGED, load)
    const onCfg = () => { setConfig(getActivitiesConfigSync()); setCustomDone(getCustomDone()) }
    window.addEventListener('activities-changed', onCfg)
    return () => { alive = false; off(); window.removeEventListener('activities-changed', onCfg) }
  }, [])

  // Статистика — тренировок за текущий месяц + метка месяца.
  const monthCount = summarizeWorkouts(workouts, 'month', new Date()).count
  const monthLabel = MONTHS_RU[new Date().getMonth()]

  // Активности — сколько окон (утро/день/вечер) закрыто сегодня + какие именно.
  const recByWindow = WINDOWS.map(w => getRecommendedForWindow(w.id))
  const doneWindows = WINDOWS.map((w, i) => {
    const rec = recByWindow[i]
    const recDone = config.showRecommended && rec && !!completed[rec.id]
    const customs = config.showCustom ? (config.custom[w.id] || []) : []
    const customAny = customs.some(it => customDone[it.id])
    return !!(recDone || customAny)
  })
  // Текущее окно суток (МСК) — подпись Активностей: «Утро» / «День» / «Вечер».
  const windowLabel = WINDOWS[getCurrentWindowIndex()]?.label || ''

  const go = (path) => { haptic.light(); navigate(path, { state: { from: '/' } }) }

  return (
    <div style={styles.row}>
      <Card
        icon={<UiIcon name="stats" size={22} color="#3FA2F7" />}
        title="Статистика"
        value={<Value num={monthCount} unit="трен" />}
        caption={monthLabel}
        onClick={() => go('/history')}
      />
      <Card
        icon={<UiIcon name="heart" size={22} color="var(--color-primary)" />}
        title="Любимые"
        value={<Value num={Math.min(favCount, FAVORITE_LIMIT)} unit="упр" />}
        caption="Твой топ"
        onClick={() => go('/favorite-exercises')}
      />
      <Card
        icon={<UiIcon name="activity" size={22} color="#EAB308" />}
        title="Активности"
        value={<Strips states={doneWindows} />}
        caption={windowLabel}
        onClick={() => go('/daily-boost')}
      />
    </div>
  )
}

function Card({ icon, title, value, caption, onClick }) {
  return (
    <button style={styles.card} className="press-tile" onClick={onClick}>
      <span style={styles.icon}>{icon}</span>
      <div style={styles.textCol}>
        <span style={styles.title}>{title}</span>
        <span style={styles.valueRow}>{value}</span>
      </div>
      <span style={styles.caption}>{caption}</span>
    </button>
  )
}

// Значение карточки: крупная зелёная цифра + тихая единица измерения.
function Value({ num, unit }) {
  return (
    <>
      <span style={styles.valueNum}>{num}</span>
      <span style={styles.valueUnit}>{unit}</span>
    </>
  )
}

// Полоски окон (утро/день/вечер): закрашены акцентом там, где активность выполнена.
// Стоят в строке значения — вместо цифр «2/3» (счётчик убран, полоски и так всё говорят).
function Strips({ states }) {
  return (
    <span style={styles.stripsRow}>
      {states.map((on_, i) => (
        <span key={i} style={{ ...styles.strip, background: on_ ? 'var(--color-primary)' : 'rgba(255,255,255,0.14)' }} />
      ))}
    </span>
  )
}

const styles = {
  row: { display: 'flex', gap: '10px', alignItems: 'stretch' },
  card: {
    flex: 1, minWidth: 0, minHeight: '112px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: '12px', textAlign: 'left',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', cursor: 'pointer'
  },
  icon: { display: 'inline-flex', height: '22px' },
  textCol: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
  title: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // Строка значения: крупная цифра + единица (или полоски у Активностей).
  valueRow: { display: 'flex', alignItems: 'center', gap: '5px', minHeight: '20px' },
  valueNum: { fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 800, lineHeight: 1, color: 'var(--color-primary)' },
  valueUnit: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' },
  // Нижняя подпись-контекст — тихая, с заглавной («Июль» / «Твой топ» / «Утро»).
  caption: { fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  // Полоски окон: чуть толще и уже прежних, с бо́льшим шагом.
  stripsRow: { display: 'flex', gap: '6px', alignItems: 'center' },
  strip: { width: '15px', height: '7px', borderRadius: '4px' }
}
