import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync, getDailyQuests, getDailyQuestsSync } from '../lib/storage'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT, MONTHS_RU } from '../utils/history'
import { getFavoritesSync, getFavoriteExercises, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { WINDOWS, getRecommendedForWindow, getActivitiesConfigSync, fetchActivitiesConfig, getCustomDone } from '../lib/activities'
import { EVENTS, on } from '../lib/events'
import UiIcon from './UiIcon'

/**
 * Три равные карточки-входа под карточкой программы (главная): Статистика,
 * Любимые, Активности. Равнозначные разделы → одинаковый размер. Каждая
 * читается за полсекунды: иконка, короткая подпись, мини-индикатор снизу,
 * тап → свой экран.
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
  const doneCount = doneWindows.filter(Boolean).length

  const go = (path) => { haptic.light(); navigate(path, { state: { from: '/' } }) }

  return (
    <div style={styles.row}>
      <Card
        icon={<UiIcon name="stats" size={22} color="#3FA2F7" />}
        title="Статистика"
        sub={`${monthCount} трен.`}
        indicator={<span style={styles.monthLabel}>{monthLabel}</span>}
        onClick={() => go('/history')}
      />
      <Card
        icon={<UiIcon name="heart" size={22} color="var(--color-primary)" />}
        title="Любимые"
        sub="Топ-3"
        indicator={<Dots total={FAVORITE_LIMIT} filled={Math.min(favCount, FAVORITE_LIMIT)} />}
        onClick={() => go('/favorite-exercises')}
      />
      <Card
        icon={<UiIcon name="activity" size={22} color="#EAB308" />}
        title="Активности"
        sub={`${doneCount}/${WINDOWS.length}`}
        indicator={<Strips states={doneWindows} />}
        onClick={() => go('/daily-boost')}
      />
    </div>
  )
}

function Card({ icon, title, sub, indicator, onClick }) {
  return (
    <button style={styles.card} className="press-tile" onClick={onClick}>
      <span style={styles.icon}>{icon}</span>
      <div style={styles.textCol}>
        <span style={styles.title}>{title}</span>
        <span style={styles.sub}>{sub}</span>
      </div>
      <div style={styles.indicator}>{indicator}</div>
    </button>
  )
}

// Точки «топ-3»: закрашенные акцентом = сколько любимых задано.
function Dots({ total, filled }) {
  return (
    <div style={styles.dotsRow}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ ...styles.dot, background: i < filled ? 'var(--color-primary)' : 'rgba(255,255,255,0.14)' }} />
      ))}
    </div>
  )
}

// Полоски окон (утро/день/вечер): закрашены акцентом там, где активность выполнена.
function Strips({ states }) {
  return (
    <div style={styles.stripsRow}>
      {states.map((on_, i) => (
        <span key={i} style={{ ...styles.strip, background: on_ ? 'var(--color-primary)' : 'rgba(255,255,255,0.14)' }} />
      ))}
    </div>
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
  textCol: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  title: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sub: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' },
  indicator: { display: 'flex', alignItems: 'center', minHeight: '8px' },
  monthLabel: { fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  dotsRow: { display: 'flex', gap: '5px', alignItems: 'center' },
  dot: { width: '6px', height: '6px', borderRadius: '50%' },
  stripsRow: { display: 'flex', gap: '4px', alignItems: 'center', width: '100%' },
  strip: { flex: 1, height: '5px', borderRadius: '3px' }
}
