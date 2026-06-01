import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, getDailyQuestsSync, completeQuest } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import PixelCheckbox from './PixelCheckbox'

/**
 * Дневной буст — 3 ежедневных квеста по 20 мускулов.
 *
 * Когда все 3 квеста выполнены — показывается компактное сообщение
 * "+60 💪 получено / ✔ Все задания выполнены" и стрелочка вниз.
 * По тапу стрелочка превращается в "вверх", раскрывается список зачёркнутых
 * квестов плавно (slide + fade). Повторный тап по карточке или клик вне её
 * сворачивает обратно.
 *
 * Чтобы тап не срабатывал при скролле — отслеживаем сдвиг пальца от pointerdown
 * к pointerup, если больше 8px — считаем что это был скролл, тап игнорируем.
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

  // Раскрыт ли блок с зачёркнутыми квестами под сообщением "выполнено"
  const [expanded, setExpanded] = useState(false)

  const lastTapRef = useRef({})

  // Замеряем высоту раскрытого списка для плавной анимации max-height.
  // ref-callback вместо useRef — срабатывает в нужный момент рендера.
  const expandedListRef = useRef(null)
  const [expandedHeight, setExpandedHeight] = useState(0)

  // Сдвиг пальца от pointerdown — нужен для отличия "тапа" от "скролла".
  // Если палец сдвинулся больше TAP_THRESHOLD — это скролл, тап не срабатывает.
  const TAP_THRESHOLD_PX = 8
  const pointerStartRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const loadQuests = () => {
      getDailyQuests().then(result => {
        // Не перетираем уже показанное синхронное состояние пустым объектом
        // (если сеть вернула пусто, а локально что-то было) — иначе моргнёт.
        setCompleted(prev => {
          const prevDone = Object.keys(prev).length
          const nextDone = Object.keys(result).length
          if (nextDone === 0 && prevDone > 0) return prev
          return result
        })
      })
    }
    loadQuests()

    const offReady = on(EVENTS.USER_READY, loadQuests)
    const offChanged = on(EVENTS.USER_CHANGED, loadQuests)
    return () => {
      offReady()
      offChanged()
    }
  }, [])

  const allDone = DEMO_QUESTS.every(q => completed[q.id])

  // Когда выполняются все задания — сбрасываем expanded в false на случай
  // если юзер уйдёт со страницы раскрытым (хотя такое маловероятно).
  // А когда блок только что стал allDone — пусть стартует в свёрнутом виде.
  useEffect(() => {
    if (!allDone) setExpanded(false)
  }, [allDone])

  // Замеряем высоту контента когда expanded меняется или контент меняется.
  // scrollHeight даёт реальную высоту даже когда max-height: 0.
  useEffect(() => {
    if (!expandedListRef.current) return
    setExpandedHeight(expandedListRef.current.scrollHeight)
  }, [expanded, allDone])

  // Закрытие при клике вне карточки. Слушатель ставим только когда expanded,
  // чтобы не висеть подписанным постоянно.
  useEffect(() => {
    if (!expanded) return

    const handleOutside = (e) => {
      if (containerRef.current?.contains(e.target)) return
      setExpanded(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [expanded])

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

  // Тап по сообщению "всё выполнено" — раскрыть/свернуть.
  // Отсекаем скролл: если палец сдвинулся больше TAP_THRESHOLD_PX от старта,
  // тап игнорируем (юзер скроллил, а не тапал).
  const handleAllDonePointerDown = (e) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleAllDonePointerUp = (e) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start) return

    const dx = Math.abs(e.clientX - start.x)
    const dy = Math.abs(e.clientY - start.y)
    if (dx > TAP_THRESHOLD_PX || dy > TAP_THRESHOLD_PX) return // это скролл

    haptic.light()
    setExpanded(prev => !prev)
  }

  return (
    <div ref={containerRef} style={styles.container}>

      {allDone ? (
        // Свёрнутая часть — то же сообщение что раньше + стрелочка снизу.
        // Сам блок кликабельный — тап по всей карточке раскрывает список.
        <>
          <div
            onPointerDown={handleAllDonePointerDown}
            onPointerUp={handleAllDonePointerUp}
            onPointerCancel={() => { pointerStartRef.current = null }}
            style={styles.allDoneBlock}
          >
            <div style={styles.allDoneReward}>+{TOTAL_QUEST_REWARD} 💪 получено</div>
            <div style={styles.allDoneCheck}>✔ Все задания выполнены</div>

            {/* Стрелочка вниз / вверх. Поворачиваем через transform, плавно. */}
            <Chevron expanded={expanded} />
          </div>

          {/* Раскрывающийся список зачёркнутых квестов.
              Анимация через max-height + opacity — стандартный приём для
              плавного раскрытия неизвестной заранее высоты. */}
          <div
            style={{
              ...styles.expandWrap,
              maxHeight: expanded ? `${expandedHeight}px` : '0px',
              opacity: expanded ? 1 : 0
            }}
            aria-hidden={!expanded}
          >
            <div ref={expandedListRef} style={styles.expandInner}>
              {DEMO_QUESTS.map(quest => (
                <div key={quest.id} style={styles.questRowDone}>
                  <div style={styles.checkboxWrap}>
                    <PixelCheckbox checked={true} size={20} />
                  </div>
                  <span style={styles.questTextDone}>
                    {quest.title}
                  </span>
                  <span style={styles.rewardBadgeDone}>
                    +{quest.xp} 💪
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
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

/**
 * Аккуратная стрелочка-шеврон. Поворачивается на 180° когда expanded.
 * Тонкий SVG, цвет — текст-секондари, лёгкое скругление концов.
 */
function Chevron({ expanded }) {
  return (
    <div
      style={{
        marginTop: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '14px',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
      }}
    >
      <svg width="14" height="8" viewBox="0 0 14 8" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M1 1 L7 6 L13 1"
          fill="none"
          stroke="var(--color-text-secondary)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

const styles = {
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
  // Свёрнутый блок "всё выполнено". Кликабельный целиком — раскрывает список.
  allDoneBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 4px 2px',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none'
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
  },
  // Обёртка раскрывающегося блока. max-height + opacity анимируются.
  // overflow: hidden обязательно — без него содержимое будет торчать
  // когда блок свёрнут.
  expandWrap: {
    overflow: 'hidden',
    transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease'
  },
  // Внутренний контейнер с реальным контентом. Высота берётся через
  // scrollHeight в эффекте и подставляется в max-height родителя.
  expandInner: {
    paddingTop: '8px',
    marginTop: '4px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  // Строки зачёркнутых квестов — некликабельный div, не button.
  // Юзер уже всё выполнил, нажимать там нечего.
  questRowDone: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 6px',
    opacity: 0.55
  },
  questTextDone: {
    flex: 1,
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textDecoration: 'line-through'
  },
  rewardBadgeDone: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    textDecoration: 'line-through',
    opacity: 0.6
  }
}