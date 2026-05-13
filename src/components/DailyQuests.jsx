import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, completeQuest } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import PixelCheckbox from './PixelCheckbox'

/**
 * Дневной буст — 3 ежедневных квеста по 20 💪 каждый.
 *
 * ПРАВКИ:
 * - Заголовок "ДНЕВНОЙ БУСТ" теперь живёт в Home.jsx (снаружи блока,
 *   симметрия с заголовком "ТРЕНИРОВКИ"). Здесь только список квестов.
 * - Бейдж "+20 💪" без фоновой плашки/рамки — только текст
 * - Когда все 3 буста собраны → блок плавно схлопывается в компактную строку
 *   "Все бусты на сегодня собраны. Возвращайся завтра — будут новые".
 *   Логика всплывающего попапа удалена (раньше показывалась по тапу).
 */

const DEMO_QUESTS = [
  { id: 'squats',  title: 'Присесть 20 раз',  xp: 20 },
  { id: 'water',   title: 'Выпить воду',      xp: 20 },
  { id: 'stretch', title: 'Растяжка 10 мин',  xp: 20 }
]

export default function DailyQuests() {
  const [completed, setCompleted] = useState({})
  const [animating, setAnimating] = useState(null)
  const [floatingRewards, setFloatingRewards] = useState([])

  const lastTapRef = useRef({}) // защита от двойного pointerdown

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
    <div style={{
      ...styles.container,
      // Когда всё собрано — блок схлопывается:
      // высота уменьшается, отступы сжимаются, появляется компактный текст.
      maxHeight: allDone ? '60px' : '300px',
      transition: 'max-height 0.45s cubic-bezier(0.32, 0.72, 0, 1), padding 0.45s ease'
    }}>

      {/* СПИСОК КВЕСТОВ — видим пока не все собраны */}
      <div style={{
        ...styles.list,
        opacity: allDone ? 0 : 1,
        pointerEvents: allDone ? 'none' : 'auto',
        transition: 'opacity 0.3s ease'
      }}>
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
              {/* Чекбокс */}
              <div style={styles.checkboxWrap}>
                <PixelCheckbox checked={isDone} size={22} />
              </div>

              {/* Текст квеста */}
              <span style={{
                ...styles.questText,
                textDecoration: isDone ? 'line-through' : 'none',
                color: isDone ? 'var(--color-text-secondary)' : 'var(--color-text)'
              }}>
                {quest.title}
              </span>

              {/* Бейдж +20💪 справа + точка спавна летящей награды */}
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

      {/* КОМПАКТНОЕ СООБЩЕНИЕ — видим когда все собраны */}
      {allDone && (
        <div style={styles.allDoneText}>
          Все бусты на сегодня собраны. Возвращайся завтра — будут новые.
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
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
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
  // Бейдж стал чище — без плашки и рамки, просто текст
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
  // Компактный текст «всё собрано» — заполняет блок целиком когда схлопнут
  allDoneText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.4,
    padding: '8px 4px'
  }
}