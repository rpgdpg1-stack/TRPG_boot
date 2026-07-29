import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync, getDailyQuests, getDailyQuestsSync } from '../lib/storage'
import { summarizeWorkouts, HISTORY_FETCH_LIMIT, MONTHS_RU } from '../utils/history'
import { getFavoritesSync, getFavoriteExercises, FAVORITE_LIMIT } from '../lib/favorite-exercises'
import { WINDOWS, getRecommendedForWindow, getActivitiesConfigSync, fetchActivitiesConfig, getCustomDone, getCurrentWindowIndex } from '../lib/activities'
import { EVENTS, on } from '../lib/events'
import UiIcon from './UiIcon'
import HeartIcon from './HeartIcon'

/**
 * Три равные карточки-входа в блоке «Мой прогресс» (главная): Статистика,
 * Любимые, Активности. Равнозначные разделы → одинаковый размер и одинаковая
 * раскладка в ДВЕ строки:
 *   иконка → строка значения: слева ЗНАЧЕНИЕ (крупная зелёная цифра + серая
 *   единица; у Активностей вместо цифр — три полоски окон), справа в углу той
 *   же строки — тихая подпись-контекст («Июль» / текущее окно суток).
 * Отдельной нижней строки нет — карточки ниже и прямоугольнее.
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
        icon={<span style={styles.icon}><HeartIcon filled size={22} color="var(--color-primary)" /></span>}
        title="Любимые"
        value={<Value num={Math.min(favCount, FAVORITE_LIMIT)} unit="упр" />}
        onClick={() => go('/favorite-exercises')}
      />
      <Card
        icon={<BoltFill filled={doneCount / WINDOWS.length} />}
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
        {/* Значение слева, подпись-контекст — в правом углу той же строки. */}
        <span style={styles.valueRow}>
          <span style={styles.valueMain}>{value}</span>
          {caption && <span style={styles.caption}>{caption}</span>}
        </span>
      </div>
    </button>
  )
}

/**
 * Молния активностей, залитая на долю выполненных окон: серый контур целиком +
 * цветной слой, обрезанный снизу вверх (0 → 1/3 → 2/3 → полностью).
 */
function BoltFill({ filled }) {
  const pct = Math.round(Math.max(0, Math.min(1, filled)) * 100)
  return (
    <span style={styles.boltWrap}>
      <UiIcon name="activity" size={22} color="rgba(255, 255, 255, 0.22)" />
      <span style={{ ...styles.boltFill, clipPath: `inset(${100 - pct}% 0 0 0)` }}>
        <UiIcon name="activity" size={22} color="#EAB308" />
      </span>
    </span>
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
    flex: 1, minWidth: 0, minHeight: '96px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: '12px', textAlign: 'left',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', cursor: 'pointer'
  },
  icon: { display: 'inline-flex', height: '22px' },
  // Молния с частичной заливкой: два слоя иконки друг на друге.
  boltWrap: { position: 'relative', display: 'inline-flex', width: '22px', height: '22px' },
  boltFill: { position: 'absolute', inset: 0, display: 'inline-flex', transition: 'clip-path 0.35s var(--ease-ios)' },
  textCol: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
  title: { fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // Строка значения: слева значение, справа подпись-контекст.
  valueRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px', minHeight: '20px', width: '100%' },
  valueMain: { display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 },
  valueNum: { fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 800, lineHeight: 1, color: 'var(--color-primary)' },
  valueUnit: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)' },
  // Подпись-контекст — тихая, в правом углу строки значения («Июль» / «Утро»).
  caption: { fontFamily: 'var(--font-manrope)', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0 },
  // Полоски окон: чуть толще и уже прежних, с бо́льшим шагом.
  stripsRow: { display: 'flex', gap: '6px', alignItems: 'center' },
  strip: { width: '15px', height: '7px', borderRadius: '4px' }
}
