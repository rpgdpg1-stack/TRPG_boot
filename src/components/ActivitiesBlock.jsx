import { useEffect, useState } from 'react'
import { getDailyQuests, getDailyQuestsSync } from '../lib/storage'
import { WINDOWS, getRecommendedForWindow, getActivitiesConfigSync, getCustomDone } from '../lib/activities'
import { EVENTS, on } from '../lib/events'
import UiIcon from './UiIcon'
import DailyQuests from './DailyQuests'

/**
 * Блок «Активности» на главной: заголовок (молния, залитая по прогрессу дня) +
 * тонкая линия-разделитель + сам виджет окон (утро/день/вечер, листается).
 * Устроен как блок раздела: одна карточка, шапка отделена линией.
 */
export default function ActivitiesBlock() {
  const [config, setConfig] = useState(getActivitiesConfigSync)
  const [completed, setCompleted] = useState(() => getDailyQuestsSync())
  const [customDone, setCustomDone] = useState(() => getCustomDone())

  useEffect(() => {
    let alive = true
    const load = () => {
      getDailyQuests().then(r => { if (alive && Object.keys(r).length) setCompleted(r) })
    }
    load()
    const off = on(EVENTS.USER_CHANGED, load)
    const onCfg = () => { setConfig(getActivitiesConfigSync()); setCustomDone(getCustomDone()) }
    window.addEventListener('activities-changed', onCfg)
    return () => { alive = false; off(); window.removeEventListener('activities-changed', onCfg) }
  }, [])

  // Сколько окон закрыто сегодня — по ним заливается молния (0 → 1/3 → 2/3 → 1).
  const doneCount = WINDOWS.filter((w) => {
    const rec = getRecommendedForWindow(w.id)
    const recDone = config.showRecommended && rec && !!completed[rec.id]
    const customs = config.showCustom ? (config.custom[w.id] || []) : []
    return !!(recDone || customs.some(it => customDone[it.id]))
  }).length
  const pct = Math.round((doneCount / WINDOWS.length) * 100)

  return (
    <div style={styles.block}>
      <div style={styles.head}>
        <span style={styles.bolt}>
          <UiIcon name="activity" size={20} color="rgba(255, 255, 255, 0.22)" />
          <span style={{ ...styles.boltFill, clipPath: `inset(${100 - pct}% 0 0 0)` }}>
            <UiIcon name="activity" size={20} color="#EAB308" />
          </span>
        </span>
        <span style={styles.title}>Активности</span>
      </div>

      <div style={styles.body}>
        <DailyQuests />
      </div>
    </div>
  )
}

const styles = {
  block: {
    background: 'color-mix(in srgb, #FFFFFF 6%, var(--surface-raised))',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  head: {
    display: 'flex', alignItems: 'center', gap: '7px',
    padding: '10px 14px 10px 12px',
    borderBottom: '1px solid var(--border-hairline)'
  },
  // Молния заливается снизу вверх по числу закрытых окон.
  bolt: { position: 'relative', display: 'inline-flex', width: '20px', height: '20px' },
  boltFill: { position: 'absolute', inset: 0, display: 'inline-flex', transition: 'clip-path 0.35s var(--ease-ios)' },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px'
  },
  body: { padding: '12px 12px 14px' }
}
