import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, completeQuest } from '../lib/storage'
import PixelCheckbox from './PixelCheckbox'

/**
 * Дневной буст — 3 ежедневных квеста по 20 💪 каждый.
 *
 * Е2:
 * - Название "ДНЕВНОЙ БУСТ"
 * - Справа от каждого квеста — бейдж "+20 💪"
 * - При выполнении: 💪 эмодзи улетает ВВЕРХ из бейджа справа
 * - Выполнено → текст и бейдж зачёркнуты
 * - Снэппи отклик: реагируем по pointerdown, не ждём click
 * - Все квесты собраны → попап-подсказка в центре блока
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
  const [showAllDonePopup, setShowAllDonePopup] = useState(false)

  const containerRef = useRef(null)
  const popupRef = useRef(null)
  const popupAutoCloseTimer = useRef(null)
  const lastTapRef = useRef({}) // защита от двойного pointerdown

  useEffect(() => {
    const loadQuests = () => { getDailyQuests().then(setCompleted) }
    loadQuests()
    window.addEventListener('user-ready', loadQuests)
    window.addEventListener('user-updated', loadQuests)
    return () => {
      window.removeEventListener('user-ready', loadQuests)
      window.removeEventListener('user-updated', loadQuests)
    }
  }, [])

  // Закрытие попапа по клику вне
  useEffect(() => {
    if (!showAllDonePopup) return
    const handleOutsideClick = (e) => {
      if (containerRef.current?.contains(e.target)) return
      if (popupRef.current?.contains(e.target)) return
      setShowAllDonePopup(false)
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [showAllDonePopup])

  // Авто-закрытие через 4 сек
  useEffect(() => {
    if (showAllDonePopup) {
      popupAutoCloseTimer.current = setTimeout(() => setShowAllDonePopup(false), 4000)
    }
    return () => {
      if (popupAutoCloseTimer.current) clearTimeout(popupAutoCloseTimer.current)
    }
  }, [showAllDonePopup])

  const allDone = DEMO_QUESTS.every(q => completed[q.id])

  // Снэппи реакция на pointerdown — не ждём click (60ms экономии)
  const handleQuestPointerDown = async (quest, e) => {
    // Защита: не реагируем повторно если только что обработали (300мс)
    const now = Date.now()
    if (lastTapRef.current[quest.id] && now - lastTapRef.current[quest.id] < 300) return
    lastTapRef.current[quest.id] = now

    if (allDone) {
      e.stopPropagation()
      handleContainerInteraction()
      return
    }

    if (completed[quest.id] || animating) return

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
      window.dispatchEvent(new CustomEvent('xp-updated'))
    }

    setTimeout(() => setAnimating(null), 600)
  }

  const handleContainerInteraction = () => {
    haptic.light()
    setShowAllDonePopup(true)
    if (popupAutoCloseTimer.current) clearTimeout(popupAutoCloseTimer.current)
    popupAutoCloseTimer.current = setTimeout(() => setShowAllDonePopup(false), 4000)
  }

  const handleContainerPointerDown = (e) => {
    if (!allDone) return
    if (e.target.closest('button[data-quest-row]')) return
    handleContainerInteraction()
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      style={{
        ...styles.container,
        cursor: allDone ? 'pointer' : 'default'
      }}
    >
      <div style={styles.header}>
        <span style={styles.title}>ДНЕВНОЙ БУСТ</span>
      </div>

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
              disabled={isDone && !allDone}
              style={{
                ...styles.questRow,
                opacity: isDone ? 0.5 : 1,
                cursor: isDone && !allDone ? 'default' : 'pointer',
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

      {/* Попап в центре блока — когда все собраны */}
      {showAllDonePopup && (
        <div ref={popupRef} style={styles.popup}>
          Все бусты на сегодня собраны.<br />
          Возвращайся завтра — будут новые.
        </div>
      )}

      <style>{`
        @keyframes rewardFloatUp {
          0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.8); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
          85%  { opacity: 1; transform: translateX(-50%) translateY(-42px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-54px) scale(0.9); }
        }
        @keyframes questPopupShowHideCenter {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
          6%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          94%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    position: 'relative',
    margin: '20px 0',
    padding: '14px 16px 12px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
    paddingLeft: '4px'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  },
  list: { display: 'flex', flexDirection: 'column', gap: '4px' },
  questRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 8px',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    // Снэппи реакция — короткий transition только на transform
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
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    padding: '4px 8px',
    background: 'rgba(158, 209, 83, 0.10)',
    border: '1px solid rgba(158, 209, 83, 0.25)',
    borderRadius: '8px',
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
  popup: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '14px',
    padding: '12px 16px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text)',
    textAlign: 'center',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    animation: 'questPopupShowHideCenter 4.4s ease-out forwards',
    zIndex: 50,
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
  }
}
