import { useEffect, useState } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, completeQuest, addXP } from '../lib/storage'
import { spawnQuestBurst } from './ParticlesBg'
import PixelCheckbox from './PixelCheckbox'

/**
 * Блок ежедневных заданий на Главной.
 * 3 демо-задания, при выполнении даём XP + хаптик + усиленный всплеск частиц.
 */

// Демо-список квестов. Позже наполним динамикой/из API.
const DEMO_QUESTS = [
  { id: 'squats',  title: 'Присесть 20 раз',  xp: 20 },
  { id: 'water',   title: 'Выпить воду',       xp: 20 },
  { id: 'stretch', title: 'Растяжка 10 мин',   xp: 30 }
]

export default function DailyQuests() {
  const [completed, setCompleted] = useState({})
  const [animating, setAnimating] = useState(null) // id квеста в момент анимации

  useEffect(() => {
    getDailyQuests().then(setCompleted)
  }, [])

  const handleQuestTap = async (quest, e) => {
    // Если уже выполнен — игнорируем тап
    if (completed[quest.id] || animating) return

    haptic.success()

    // Усиленный всплеск частиц из центра квеста
    const rect = e.currentTarget.getBoundingClientRect()
    spawnQuestBurst(rect.left + rect.width / 2, rect.top + rect.height / 2)

    // Помечаем что идёт анимация (на случай если юзер быстро тапнет ещё раз)
    setAnimating(quest.id)

    // Сохраняем в хранилище
    const newCompleted = await completeQuest(quest.id)
    setCompleted(newCompleted)

    // Начисляем XP
    await addXP(quest.xp)

    // Сообщаем PlayerCard что XP изменились
    window.dispatchEvent(new CustomEvent('xp-updated'))

    // Через 600мс снимаем флаг анимации
    setTimeout(() => setAnimating(null), 600)
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>ЗАДАНИЯ НА СЕГОДНЯ</span>
      </div>

      <div style={styles.list}>
        {DEMO_QUESTS.map(quest => {
          const isDone = completed[quest.id]
          const isAnimating = animating === quest.id

          return (
            <button
              key={quest.id}
              onClick={(e) => handleQuestTap(quest, e)}
              disabled={isDone}
              style={{
                ...styles.questRow,
                opacity: isDone ? 0.5 : 1,
                cursor: isDone ? 'default' : 'pointer',
                transform: isAnimating ? 'scale(0.97)' : 'scale(1)'
              }}
            >
              <PixelCheckbox checked={isDone} size={22} />

              <span style={{
                ...styles.questText,
                textDecoration: isDone ? 'line-through' : 'none',
                color: isDone ? 'var(--color-text-secondary)' : 'var(--color-text)'
              }}>
                {quest.title}
              </span>

              <span style={{
                ...styles.questXP,
                color: isDone ? 'var(--color-text-secondary)' : 'var(--color-primary)'
              }}>
                +{quest.xp} XP
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  container: {
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
    borderRadius: '12px'
  },
  questText: {
    flex: 1,
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'color 0.3s ease, text-decoration 0.3s ease'
  },
  questXP: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1px',
    flexShrink: 0,
    transition: 'color 0.3s ease'
  }
}
