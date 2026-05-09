import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, completeQuest } from '../lib/storage'
import PixelCheckbox from './PixelCheckbox'

/**
 * Блок ежедневных бустов на Главной — "ЗАБУСТИТЬ ДЕНЬ".
 *
 * НОВОЕ в Г8:
 * - Попап "всё выполнено" появляется снизу плавной анимацией
 * - Закрывается по клику вне (не только повторным тапом по блоку)
 */

const DEMO_QUESTS = [
  { id: 'squats',  title: 'Присесть 20 раз',  xp: 20 },
  { id: 'water',   title: 'Выпить воду',      xp: 20 },
  { id: 'stretch', title: 'Растяжка 10 мин',  xp: 30 }
]

export default function DailyQuests() {
  const [completed, setCompleted] = useState({})
  const [animating, setAnimating] = useState(null)
  const [floatingRewards, setFloatingRewards] = useState([])
  const [showAllDonePopup, setShowAllDonePopup] = useState(false)

  const containerRef = useRef(null)
  const popupRef = useRef(null)

  useEffect(() => {
    const loadQuests = () => {
      getDailyQuests().then(setCompleted)
    }
    loadQuests()
    window.addEventListener('user-ready', loadQuests)
    window.addEventListener('user-updated', loadQuests)
    return () => {
      window.removeEventListener('user-ready', loadQuests)
      window.removeEventListener('user-updated', loadQuests)
    }
  }, [])

  // Закрытие попапа "всё выполнено" по клику вне
  useEffect(() => {
    if (!showAllDonePopup) return

    const handleOutsideClick = (e) => {
      // Не закрываем если кликнули по контейнеру (это переключатель) или по самому попапу
      if (containerRef.current?.contains(e.target)) return
      if (popupRef.current?.contains(e.target)) return
      setShowAllDonePopup(false)
    }

    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [showAllDonePopup])

  const allDone = DEMO_QUESTS.every(q => completed[q.id])

  const handleQuestTap = async (quest) => {
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

  const handleContainerTap = (e) => {
    if (!allDone) return
    if (e.target.closest('button[data-quest-row]')) return
    haptic.light()
    setShowAllDonePopup(prev => !prev)
  }

  return (
    <div
      ref={containerRef}
      onClick={handleContainerTap}
      style={{
        ...styles.container,
        cursor: allDone ? 'pointer' : 'default'
      }}
    >
      <div style={styles.header}>
        <span style={styles.title}>⬆️ ЗАБУСТИТЬ ДЕНЬ</span>
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
              onClick={() => handleQuestTap(quest)}
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
                {reward && (
                  <span key={reward.key} style={styles.floatingReward}>
                    +{reward.xp} 💪
                  </span>
                )}
              </div>

              <span style={{
                ...styles.questText,
                textDecoration: isDone ? 'line-through' : 'none',
                color: isDone ? 'var(--color-text-secondary)' : 'var(--color-text)'
              }}>
                {quest.title}
              </span>
            </button>
          )
        })}
      </div>

      {showAllDonePopup && (
        <div ref={popupRef} style={styles.popup}>
          Все бусты на сегодня собраны.<br />
          Возвращайся завтра — будут новые.
        </div>
      )}

      <style>{`
        @keyframes rewardFloat {
          0%   { opacity: 0; transform: translate(-50%, 0) scale(0.8); }
          15%  { opacity: 1; transform: translate(-50%, -8px) scale(1); }
          85%  { opacity: 1; transform: translate(-50%, -34px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -44px) scale(0.9); }
        }
        @keyframes questPopupSlideDown {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
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
    transition: 'transform 0.15s ease, opacity 0.3s ease',
    borderRadius: '12px',
    border: 'none'
  },
  checkboxWrap: {
    position: 'relative',
    flexShrink: 0,
    width: '22px',
    height: '22px'
  },
  floatingReward: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textShadow: '0 0 6px rgba(158, 209, 83, 0.6)',
    animation: 'rewardFloat 1.1s ease-out forwards'
  },
  questText: {
    flex: 1,
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'color 0.3s ease, text-decoration 0.3s ease'
  },
  popup: {
    // Снизу от блока, плавно сверху-вниз
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '14px',
    padding: '10px 14px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text)',
    textAlign: 'center',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    animation: 'questPopupSlideDown 0.25s ease-out',
    zIndex: 50
  }
}
