import { useEffect, useState, useRef } from 'react'
import { haptic } from '../lib/telegram'
import { getDailyQuests, getDailyQuestsSync, completeQuest } from '../lib/storage'
import { getTodayKey } from '../utils/dates'
import { EVENTS, on } from '../lib/events'
import PixelCheckbox from './PixelCheckbox'
import MuscleIcon from './MuscleIcon'

/**
 * Дневной буст — 3 слота на день: утро / день / вечер.
 *
 * Из каждого пула привычек на конкретный день детерминированно (по ключу дня)
 * выбирается ОДНА привычка. Набор стабилен в течение дня и меняется со сбросом
 * в 03:00 МСК — так из 22 привычек идёт ротация, но экран компактный.
 *
 * Окна открытия считаем в «часах суток буста» — той же системе, что getTodayKey
 * (сдвиг −3ч, сутки стартуют в 03:00 МСК). Час буста = 0 в 03:00, 9 в 12:00,
 * 15 в 18:00. В 00:00–02:59 МСК час буста = 21..23 — это хвост прошедших суток,
 * там открыто всё, как и должно быть до сброса.
 *   🌅 утро  — bootHour 0  (доступно с 03:00 МСК)
 *   ☀️ день  — bootHour 9  (с 12:00 МСК)
 *   🌙 вечер — bootHour 15 (с 18:00 МСК)
 * Окна НЕ сгорают: пропустил утро, зашёл вечером — оно всё ещё доступно.
 *
 * XP: каждый закрытый слот +20, все три за день +40 бонусом → итого 100.
 * Бонус начисляется автоматически при закрытии третьего слота, пишется
 * отдельным quest_id 'boost_full_day' (reward=40), чтобы не задвоился.
 */

const SLOT_XP = 20
const TOTAL_DAY_REWARD = SLOT_XP * 3 // 60

// openBootHour — час «суток буста» (от 03:00 МСК), с которого слот открыт.
const BOOST_POOLS = [
  {
    period: 'morning',
    periodEmoji: '🌅',
    periodLabel: 'Утро',
    openBootHour: 0, // 03:00 МСК
    items: [
      { id: 'm_water',   emoji: '💧',   title: 'Выпить стакан воды',     benefit: 'запуск метаболизма' },
      { id: 'm_light',   emoji: '🌞',   title: '5 минут дневного света',  benefit: 'циркадный ритм' },
      { id: 'm_protein', emoji: '🥚',   title: 'Белок на завтрак',        benefit: 'сытость и энергия' },
      { id: 'm_pushups', emoji: '💪🏻', title: '10 отжиманий от пола',    benefit: 'разбудить мышцы' },
      { id: 'm_teeth',   emoji: '🦷',   title: 'Почистить зубы',          benefit: 'гигиена и ритуал' },
      { id: 'm_goal',    emoji: '🗒️',   title: 'Записать 1 цель на день', benefit: 'фокус внимания' },
      { id: 'm_silence', emoji: '🧘🏻', title: '5 минут тишины',          benefit: 'снять утренний шум' }
    ]
  },
  {
    period: 'day',
    periodEmoji: '☀️',
    periodLabel: 'День',
    openBootHour: 9, // 12:00 МСК
    items: [
      { id: 'd_walk',    emoji: '🚶', title: '10 минут ходьбы',         benefit: 'кровообращение' },
      { id: 'd_fruit',   emoji: '🍎', title: 'Съесть фрукт',            benefit: 'витамины' },
      { id: 'd_veggies', emoji: '🥗', title: 'Добавить овощи к еде',    benefit: 'клетчатка' },
      { id: 'd_move',    emoji: '🧍', title: 'Встать и размяться 2 мин', benefit: 'снять застой' },
      { id: 'd_squats',  emoji: '🏋️', title: '20 приседаний',           benefit: 'тонизировать ноги' },
      { id: 'd_eyes',    emoji: '👁️', title: 'Смотреть вдаль 1 мин',    benefit: 'отдых для глаз' },
      { id: 'd_water',   emoji: '💧', title: 'Выпить ещё стакан воды',  benefit: 'дневная гидратация' },
      { id: 'd_music',   emoji: '🎧', title: 'Послушать любимую песню', benefit: 'поднять настроение' }
    ]
  },
  {
    period: 'evening',
    periodEmoji: '🌙',
    periodLabel: 'Вечер',
    openBootHour: 15, // 18:00 МСК
    items: [
      { id: 'e_stretch', emoji: '🤸',     title: '10 минут растяжки',              benefit: 'снять напряжение' },
      { id: 'e_breath',  emoji: '😮‍💨', title: '10 глубоких вдохов',             benefit: 'успокоить нервы' },
      { id: 'e_screen',  emoji: '📵',     title: 'Убрать телефон за час до сна',   benefit: 'качество сна' },
      { id: 'e_sleep',   emoji: '😴',     title: 'Лечь спать вовремя',             benefit: 'восстановление' },
      { id: 'e_shower',  emoji: '🚿',     title: 'Контрастный душ',                benefit: 'тонус сосудов' },
      { id: 'e_skin',    emoji: '🧴',     title: 'Увлажнить кожу',                 benefit: 'уход и ритуал' },
      { id: 'e_plank',   emoji: '📋',     title: 'Планка 30–60 сек',               benefit: 'сильный кор' }
    ]
  }
]

// Детерминированный хеш строки в неотрицательное число (FNV-подобный).
function hashKey(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

// Час «суток буста» от 03:00 МСК. 03:00 → 0, 12:00 → 9, 18:00 → 15,
// 00:00–02:59 → 21..23 (хвост прошедших суток). Та же система, что getTodayKey.
function getBoostHour() {
  const now = new Date()
  // Текущее МСК-время: к UTC прибавляем 3ч (нейтрализуя локальный пояс телефона).
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const msk = new Date(utcMs + 3 * 3600000)
  return (msk.getHours() - 3 + 24) % 24
}

// Выбрать привычки на сегодня — по одной из каждого пула, детерминированно.
function pickTodaysQuests(dayKey) {
  return BOOST_POOLS.map((pool, poolIdx) => {
    const idx = hashKey(`${dayKey}:${pool.period}:${poolIdx}`) % pool.items.length
    const item = pool.items[idx]
    return {
      ...item,
      period: pool.period,
      periodEmoji: pool.periodEmoji,
      periodLabel: pool.periodLabel,
      openBootHour: pool.openBootHour,
      xp: SLOT_XP
    }
  })
}

// Человекочитаемое время открытия слота для подписи «Откроется в HH:00».
function openLabel(openBootHour) {
  const mskHour = (openBootHour + 3) % 24
  return `${String(mskHour).padStart(2, '0')}:00`
}

export default function DailyQuests() {
  const [quests] = useState(() => pickTodaysQuests(getTodayKey()))

  const [completed, setCompleted] = useState(() => getDailyQuestsSync())
  const [animating, setAnimating] = useState(null)
  const [floatingRewards, setFloatingRewards] = useState([])

  const [boostHour, setBoostHour] = useState(() => getBoostHour())

  const [expanded, setExpanded] = useState(false)

  const lastTapRef = useRef({})
  const expandedListRef = useRef(null)
  const [expandedHeight, setExpandedHeight] = useState(0)

  const TAP_THRESHOLD_PX = 8
  const pointerStartRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const loadQuests = () => {
      getDailyQuests().then(result => {
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
    return () => { offReady(); offChanged() }
  }, [])

  // Тикаем час буста раз в минуту — слот сам разблокируется на 12:00/18:00.
  useEffect(() => {
    const t = setInterval(() => setBoostHour(getBoostHour()), 60000)
    return () => clearInterval(t)
  }, [])

  const isSlotOpen = (q) => boostHour >= q.openBootHour

  const allSlotsDone = quests.every(q => completed[q.id])
  const dayComplete = allSlotsDone

  useEffect(() => {
    if (!dayComplete) setExpanded(false)
  }, [dayComplete])

  useEffect(() => {
    if (!expandedListRef.current) return
    setExpandedHeight(expandedListRef.current.scrollHeight)
  }, [expanded, dayComplete])

  useEffect(() => {
    if (!expanded) return
    const handleOutside = (e) => {
      if (containerRef.current?.contains(e.target)) return
      setExpanded(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [expanded])

  // Все 3 слота закрыты, бонус ещё нет → автоначисляем +40.
  useEffect(() => {
    if (!allSlotsDone || bonusDone || bonusInFlightRef.current) return
    bonusInFlightRef.current = true
    haptic.success()

    const rewardKey = Date.now()
    setFloatingRewards(prev => [...prev, { id: BONUS_QUEST_ID, xp: FULL_DAY_BONUS, key: rewardKey }])
    setTimeout(() => {
      setFloatingRewards(prev => prev.filter(r => r.key !== rewardKey))
    }, 1300)

    completeQuest(BONUS_QUEST_ID, FULL_DAY_BONUS).then(result => {
      setCompleted(result.completed)
    })
  }, [allSlotsDone, bonusDone])

  const handleQuestPointerDown = async (quest) => {
    const now = Date.now()
    if (lastTapRef.current[quest.id] && now - lastTapRef.current[quest.id] < 300) return
    lastTapRef.current[quest.id] = now

    if (completed[quest.id] || animating || !isSlotOpen(quest) || dayComplete) return

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

  const handleAllDonePointerDown = (e) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
  }
  const handleAllDonePointerUp = (e) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start) return
    const dx = Math.abs(e.clientX - start.x)
    const dy = Math.abs(e.clientY - start.y)
    if (dx > TAP_THRESHOLD_PX || dy > TAP_THRESHOLD_PX) return
    haptic.light()
    setExpanded(prev => !prev)
  }

  return (
    <div ref={containerRef} style={styles.container}>

      {dayComplete ? (
        <>
          <div
            onPointerDown={handleAllDonePointerDown}
            onPointerUp={handleAllDonePointerUp}
            onPointerCancel={() => { pointerStartRef.current = null }}
            style={styles.allDoneBlock}
          >
            <div style={{ ...styles.allDoneReward, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              +{TOTAL_DAY_REWARD} <MuscleIcon size={18} earned={true} /> получено
            </div>
            <div style={styles.allDoneCheck}>✔ День пройден</div>
            <Chevron expanded={expanded} />
          </div>

          <div
            style={{
              ...styles.expandWrap,
              maxHeight: expanded ? `${expandedHeight}px` : '0px',
              opacity: expanded ? 1 : 0
            }}
            aria-hidden={!expanded}
          >
            <div ref={expandedListRef} style={styles.expandInner}>
              {quests.map(quest => (
                <div key={quest.id} style={styles.questRowDone}>
                  <div style={styles.checkboxWrap}>
                    <PixelCheckbox checked={true} size={20} />
                  </div>
                  <span style={styles.taskEmojiDone}>{quest.emoji}</span>
                  <div style={styles.textColDone}>
                    <span style={styles.questTextDone}>{quest.title}</span>
                    <span style={styles.benefitTextDone}>{quest.benefit}</span>
                  </div>
                  <span style={{ ...styles.rewardBadgeDone, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    +{quest.xp} <MuscleIcon size={18} earned={true} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={styles.list}>
          {quests.map(quest => {
            const isDone = completed[quest.id]
            const isAnimating = animating === quest.id
            const open = isSlotOpen(quest)
            const reward = floatingRewards.find(r => r.id === quest.id)
            const locked = !open && !isDone

            return (
              <button
                key={quest.id}
                data-quest-row
                onPointerDown={() => handleQuestPointerDown(quest)}
                disabled={isDone || locked}
                style={{
                  ...styles.questRow,
                  position: 'relative',
                  opacity: isDone ? 0.5 : 1,
                  cursor: isDone || locked ? 'default' : 'pointer',
                  transform: isAnimating ? 'scale(0.97)' : 'scale(1)'
                }}
              >
                {/* Содержимое слота. Под блюром, если слот ещё закрыт по времени. */}
                <div style={{
                  ...styles.slotInner,
                  filter: locked ? 'blur(4px)' : 'none',
                  opacity: locked ? 0.5 : 1
                }}>
                  <div style={styles.checkboxWrap}>
                    <PixelCheckbox checked={isDone} size={20} />
                  </div>

                  <span style={{ ...styles.taskEmoji, opacity: isDone ? 0.5 : 1 }}>
                    {quest.emoji}
                  </span>

                  <div style={styles.textCol}>
                    <span style={{
                      ...styles.questText,
                      textDecoration: isDone ? 'line-through' : 'none',
                      color: isDone ? 'var(--color-text-secondary)' : 'var(--color-text)'
                    }}>
                      {quest.title}
                    </span>
                    <span style={{ ...styles.benefitText, opacity: isDone ? 0.4 : 1 }}>
                      {quest.benefit}
                    </span>
                  </div>

                  <div style={styles.rewardBadgeWrap}>
                    <span style={{
                      ...styles.rewardBadge,
                      textDecoration: isDone ? 'line-through' : 'none',
                      opacity: isDone ? 0.55 : 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      +{quest.xp} <MuscleIcon size={18} earned={isDone} />
                    </span>

                    {reward && (
                      <span key={reward.key} style={styles.floatingReward}>
                        +{reward.xp} <MuscleIcon size={18} earned={true} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Плашка времени поверх блюра — только для закрытого слота. */}
                {locked && (
                  <div style={styles.lockedOverlay}>
                    <span style={styles.lockedOverlayText}>
                      Откроется в {openLabel(quest.openBootHour)} {quest.periodEmoji}
                    </span>
                  </div>
                )}
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
        @`}</style>
    </div>
  )
}

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
        <path d="M1 1 L7 6 L13 1" fill="none" stroke="var(--color-text-secondary)"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
    gap: '8px'
  },
  questRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 6px',
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
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Крупное эмодзи задания, центрируется по вертикали относительно двух строк.
  taskEmoji: {
    fontSize: '24px',
    lineHeight: 1,
    flexShrink: 0,
    width: '30px',
    textAlign: 'center',
    alignSelf: 'center',
    transition: 'opacity 0.3s ease'
  },
  taskEmojiDone: {
    fontSize: '20px',
    lineHeight: 1,
    flexShrink: 0,
    width: '30px',
    textAlign: 'center',
    alignSelf: 'center',
    opacity: 0.55
  },
  
  // Колонка текста: задание сверху, польза снизу.
  textCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  textColDone: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px'
  },
  questText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1.2,
    transition: 'color 0.3s ease, text-decoration 0.3s ease'
  },
  // Польза — мелкий приглушённый шрифт под заданием.
  benefitText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: 1.2,
    color: 'var(--color-text-secondary)',
    transition: 'opacity 0.3s ease'
  },
  // Обёртка содержимого слота (под блюр уходит целиком).
  slotInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    transition: 'filter 0.3s ease, opacity 0.3s ease'
  },
  // Плашка поверх заблокированного слота с временем открытия.
  lockedOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  },
  lockedOverlayText: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    textShadow: '0 1px 4px rgba(0,0,0,0.5)'
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
  expandWrap: {
    overflow: 'hidden',
    transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease'
  },
  expandInner: {
    paddingTop: '8px',
    marginTop: '4px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  questRowDone: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px 6px',
    opacity: 0.55
  },
  
  questTextDone: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textDecoration: 'line-through',
    lineHeight: 1.2
  },
  benefitTextDone: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    opacity: 0.7,
    lineHeight: 1.2
  },
  rewardBadgeDone: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    textDecoration: 'line-through',
    opacity: 0.6,
    alignSelf: 'center'
  }
}