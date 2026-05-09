import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, completeQuest } from '../lib/storage'
import PixelCheckbox from './PixelCheckbox'

/**
 * Блок ежедневных бустов на Главной — "ЗАБУСТИТЬ ДЕНЬ".
 *
 * Г8.1:
 * - Когда все 3 буста выполнены — попап появляется при тапе ПО ВСЕМУ блоку (включая зоны квестов)
 * - Попап в геометрическом центре блока, плавное появление и исчезновение через 4 сек
 * - Закрывается также по клику вне
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
  const popupAutoCloseTimer = useRef(null)

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

  const handleQuestTap = async (quest, e) => {
    // Если все буст выполнены — делегируем тап на контейнер (показываем попап)
    if (allDone) {
      e.stopPropagation() // не даём дважды сработать
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

  // Открыть/переоткрыть попап (общий для тапа по контейнеру и по строкам когда allDone)
  const handleContainerInteraction = () => {
    haptic.light()
    setShowAllDonePopup(true)
    // Если уже был открыт — сбрасываем таймер на новые 4 сек
    if (popupAutoCloseTimer.current) clearTimeout(popupAutoCloseTimer.current)
    popupAutoCloseTimer.current = setTimeout(() => setShowAllDonePopup(false), 4000)
  }

  // Тап по контейнеру (не по строке)
  const handleContainerTap = (e) => {
    if (!allDone) return
    if (e.target.closest('button[data-quest-row]')) return
    handleContainerInteraction()
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
              onClick={(e) => handleQuestTap(quest, e)}
              // Не дизаблим если все выполнены — нужен тап для попапа
              disabled={isDone && !allDone}
              style={{
                ...styles.questRow,
                opacity: isDone ? 0.5 : 1,
                cursor: isDone && !allDone ? 'default' : 'pointer',
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

      {/* Попап в геометрическом центре блока */}
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
        /* Появление из центра + автоисчезновение через 4 сек.
           Длительность 4.4с = 0.25с появление + 4с показ + 0.4с исчезновение */
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
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingLeft: '4px' },
  title: { fontFamily: 'var(--font-tiny5)', fontSize: '12px', color: 'var(--color-text-secondary)', letterSpacing: '2px' },
  list: { display: 'flex', flexDirection: 'column', gap: '4px' },
  questRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 8px',
    background: 'transparent',
    width: '100%', textAlign: 'left',
    transition: 'transform 0.15s ease, opacity 0.3s ease',
    borderRadius: '12px',
    border: 'none'
  },
  checkboxWrap: { position: 'relative', flexShrink: 0, width: '22px', height: '22px' },
  floatingReward: {
    position: 'absolute',
    bottom: '100%', left: '50%',
    fontFamily: 'var(--font-tiny5)', fontSize: '13px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textShadow: '0 0 6px rgba(158, 209, 83, 0.6)',
    animation: 'rewardFloat 1.1s ease-out forwards'
  },
  questText: { flex: 1, fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 500, transition: 'color 0.3s ease, text-decoration 0.3s ease' },
  popup: {
    // Геометрический центр контейнера
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
