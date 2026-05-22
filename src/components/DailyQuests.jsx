import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, getDailyQuestsSync, completeQuest } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import PixelCheckbox from './PixelCheckbox'

/**
 * Дневной буст — 3 ежедневных квеста по 20 мускулов.
 *
 * Компактнее: уменьшены padding'ы строк и контейнера.
 * Когда все 3 квеста выполнены — показывается короткое сообщение
 * "+60 💪 получено / ✔ Все задания выполнены" компактным блоком.
 */

const DEMO_QUESTS = [
  { id: 'squats',  title: 'Присесть 20 раз',  xp: 20 },
  { id: 'water',   title: 'Выпить воду',      xp: 20 },
  { id: 'stretch', title: 'Растяжка 10 мин',  xp: 20 }
]

const TOTAL_QUEST_REWARD = DEMO_QUESTS.reduce((sum, q) => sum + q.xp, 0)

export default function DailyQuests() {
  const [completed, setCompleted] = useState(() => getDailyQuestsSync())
  const [animating, setAnimating] = useState(null)
  const [floatingRewards, setFloatingRewards] = useState([])

  const lastTapRef = useRef({})

  useEffect(() => {
    const loadQuests = () => { getDailyQuests().then(setCompleted) }
    loadQuests()

    const offReady = on(EVENTS.USER_READY, loadQuests)
    const offChanged = on(EVENTS.USER_CHANGED, loadQuests)
    return () => {
      offReady()
      offChanged()
    }
  }, [])

  const allDone = DEMO_QUESTS.every(q => completed[q.id])

  const handleQuestPointerDown = async (quest) => {
    const now = Date.now()
    if (lastTapRef.current[quest.id] && now - lastTapRef.current[quest.id] < 300) return
    lastTapRef.current[quest.id] = now

    if (completed[quest.id] || animating || allDone) return

    haptic.success()
    setAnimating(quest.id)

    const result = await completeQuest(quest.id, quest.xp)
    setCompleted(result.completed)

    if (result.wasNew) {
      const rewardKey = Date.now()
      setFloatingRewards(prev => [...prev, { id: quest.id, xp: quest.xp, key: rewardKey }])
      setTimeout(() => {
        setFloatingRewards(prev => prev.filter(r => r.key !== rewardKey))
      }, 1100)
    }

    setTimeout(() => setAnimating(null), 600)
  }

  return (
    <div style={styles.container}>

      {allDone ? (
        // Компактное сообщение о выполнении: две строки, плотно
        <div style={styles.allDoneBlock}>
          <div style={styles.allDoneReward}>+{TOTAL_QUEST_REWARD} 💪 получено</div>
          <div style={styles.allDoneCheck}>✔ Все задания выполнены</div>
        </div>
      ) : (
        <div style={styles.list}>
          {DEMO_QUESTS.map(quest => {
            const isDone = completed[quest.id]
            const isAnimating = animating === quest.id
            const reward = floatingRewards.find(r => r.id === quest.id)

            return (
              <button
                key={quest.id}
                data-quest-row
                onPointerDown={() => handleQuestPointerDown(quest)}
                disabled={isDone}
                style={{
                  ...styles.questRow,
                  opacity: isDone ? 0.5 : 1,
                  cursor: isDone ? 'default' : 'pointer',
                  transform: isAnimating ? 'scale(0.97)' : 'scale(1)'
                }}
              >
                <div style={styles.checkboxWrap}>
                  <PixelCheckbox checked={isDone} size={20} />
                </div>

                <span style={{
                  ...styles.questText,
                  textDecoration: isDone ? 'line-through' : 'none',
                  color: isDone ? 'var(--color-text-secondary)' : 'var(--color-text)'
                }}>
                  {quest.title}
                </span>

                <div style={styles.rewardBadgeWrap}>
                  <span style={{
                    ...styles.rewardBadge,
                    textDecoration: isDone ? 'line-through' : 'none',
                    opacity: isDone ? 0.55 : 1
                  }}>
                    +{quest.xp} 💪
                  </span>

                  {reward && (
                    <span key={reward.key} style={styles.floatingReward}>
                      +{reward.xp} 💪
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes rewardFloatUp {
          0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.8); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
          85%  { opacity: 1; transform: translateX(-50%) translateY(-42px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-54px) scale(0.9); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  // Контейнер компактнее: padding 8x14 (было 12x16)
  container: {
    position: 'relative',
    padding: '8px 14px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  // Строка квеста компактнее: padding 6x6 (было 10x8), gap 10 (было 12)
  questRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 6px',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    transition: 'transform 90ms cubic-bezier(0.4, 0, 0.6, 1), opacity 0.3s ease',
    borderRadius: '10px',
    border: 'none'
  },
  checkboxWrap: {
    position: 'relative',
    flexShrink: 0,
    width: '20px',
    height: '20px'
  },
  questText: {
    flex: 1,
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'color 0.3s ease, text-decoration 0.3s ease'
  },
  rewardBadgeWrap: {
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center'
  },
  rewardBadge: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.3s ease, text-decoration 0.3s ease'
  },
  floatingReward: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textShadow: '0 0 8px rgba(158, 209, 83, 0.7)',
    animation: 'rewardFloatUp 1.1s ease-out forwards'
  },
  // Компактный блок "всё выполнено"
  allDoneBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 4px'
  },
  allDoneReward: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    textShadow: '0 0 6px rgba(158, 209, 83, 0.3)'
  },
  allDoneCheck: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    fontWeight: 500
  }
}