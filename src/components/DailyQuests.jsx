import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, getDailyQuestsSync, completeQuest } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import PixelCheckbox from './PixelCheckbox'

/**
 * Дневной буст — 3 ежедневных квеста по 20 мускулов.
 *
 * ОБНОВЛЕНИЕ: моментальный первый рендер из localStorage.
 *
 * Раньше: маунт → запрос в БД → пока запрос идёт показываем "ничего не выполнено"
 *         → ответ приходит → если все выполнены, схлопываемся в "Все бусты собраны"
 *         → юзер видит МОРГАНИЕ.
 *
 * Теперь: маунт → getDailyQuestsSync() из localStorage СИНХРОННО → корректный
 *         первый рендер → параллельно фоновый getDailyQuests() из БД → если
 *         состояние совпало (обычный случай) ничего не меняется. Если БД
 *         отдала что-то новое — обновляем без моргания, т.к. меняются конкретные
 *         квесты, а не весь блок.
 */

const DEMO_QUESTS = [
  { id: 'squats',  title: 'Присесть 20 раз',  xp: 20 },
  { id: 'water',   title: 'Выпить воду',      xp: 20 },
  { id: 'stretch', title: 'Растяжка 10 мин',  xp: 20 }
]

export default function DailyQuests() {
  // Первый рендер берётся из localStorage синхронно — без моргания
  const [completed, setCompleted] = useState(() => getDailyQuestsSync())
  const [animating, setAnimating] = useState(null)
  const [floatingRewards, setFloatingRewards] = useState([])

  const lastTapRef = useRef({})

  useEffect(() => {
    // Фоновая синхронизация с БД
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

  const handleQuestPointerDown = async (quest, e) => {
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
        <div style={styles.allDoneText}>
          Все бусты на сегодня собраны.<br />
          Возвращайся завтра — будут новые.
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
                onPointerDown={(e) => handleQuestPointerDown(quest, e)}
                disabled={isDone}
                style={{
                  ...styles.questRow,
                  opacity: isDone ? 0.5 : 1,
                  cursor: isDone ? 'default' : 'pointer',
                  transform: isAnimating ? 'scale(0.97)' : 'scale(1)'
                }}
              >
                <div style={styles.checkboxWrap}>
                  <PixelCheckbox checked={isDone} size={22} />
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
  container: {
    position: 'relative',
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  questRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 8px',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    transition: 'transform 90ms cubic-bezier(0.4, 0, 0.6, 1), opacity 0.3s ease',
    borderRadius: '12px',
    border: 'none'
  },
  checkboxWrap: {
    position: 'relative',
    flexShrink: 0,
    width: '22px',
    height: '22px'
  },
  questText: {
    flex: 1,
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
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
    fontSize: '13px',
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
  allDoneText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.5,
    padding: '14px 8px'
  }
}