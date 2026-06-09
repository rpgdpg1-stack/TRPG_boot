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
 * Окна ОТКРЫВАЮТСЯ по времени, но НЕ сгорают:
 *   🌅 утро  — доступно сразу (с 03:00 МСК)
 *   ☀️ день  — открывается в 12:00 МСК
 *   🌙 вечер — открывается в 18:00 МСК
 * Пропустил утренний и зашёл вечером — он всё ещё доступен. Закрыто только то,
 * чьё время не наступило. Всё открытое живёт до сброса.
 *
 * XP: каждый закрытый слот +20, все три за день +40 бонусом → итого 100.
 * Бонус начисляется автоматически в момент закрытия третьего слота, пишется
 * отдельным quest_id 'boost_full_day' (reward=40), чтобы не задвоился.
 *
 * Когда выполнены все 3 — блок схлопывается в «День пройден» с раскрытием
 * (тап-vs-скролл различаем по сдвигу пальца).
 */

const SLOT_XP = 20
const FULL_DAY_BONUS = 40
const BONUS_QUEST_ID = 'boost_full_day'
const TOTAL_DAY_REWARD = SLOT_XP * 3 + FULL_DAY_BONUS // 100

// Пулы привычек. openHourMsk: null — доступно сразу; число — час МСК открытия.
const BOOST_POOLS = [
  {
    period: 'morning',
    periodEmoji: '🌅',
    periodLabel: 'Утро',
    openHourMsk: null,
    items: [
      { id: 'm_water',   title: 'Выпить стакан воды' },
      { id: 'm_light',   title: '5 минут дневного света' },
      { id: 'm_protein', title: 'Белок на завтрак' },
      { id: 'm_pushups', title: '10 отжиманий от пола' },
      { id: 'm_teeth',   title: 'Почистить зубы' },
      { id: 'm_goal',    title: 'Записать 1 цель на день' },
      { id: 'm_silence', title: '5 минут тишины' }
    ]
  },
  {
    period: 'day',
    periodEmoji: '☀️',
    periodLabel: 'День',
    openHourMsk: 12,
    items: [
      { id: 'd_walk',    title: '10 минут ходьбы' },
      { id: 'd_fruit',   title: 'Съесть фрукт' },
      { id: 'd_veggies', title: 'Добавить овощи к еде' },
      { id: 'd_move',    title: 'Встать и размяться 2 мин' },
      { id: 'd_squats',  title: '20 приседаний' },
      { id: 'd_eyes',    title: 'Смотреть вдаль 1 мин' },
      { id: 'd_water',   title: 'Выпить ещё стакан воды' },
      { id: 'd_music',   title: 'Послушать любимую песню' }
    ]
  },
  {
    period: 'evening',
    periodEmoji: '🌙',
    periodLabel: 'Вечер',
    openHourMsk: 18,
    items: [
      { id: 'e_stretch', title: '10 минут растяжки' },
      { id: 'e_breath',  title: '10 глубоких вдохов' },
      { id: 'e_walk',    title: 'Вечерняя прогулка 15 мин' },
      { id: 'e_screen',  title: 'Отложить телефон за час до сна' },
      { id: 'e_plan',    title: 'Спланировать завтрашний день' },
      { id: 'e_read',    title: 'Прочитать 5 страниц' },
      { id: 'e_gratitude', title: 'Вспомнить 3 хороших момента' }
    ]
  }
]

// Детерминированный хеш строки в неотрицательное число (FNV-подобный).
// Один и тот же ключ дня → один и тот же индекс, без скачков при ререндере.
function hashKey(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

// Текущий час по МСК (UTC+3), независимо от часового пояса телефона.
function getMskHour() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const mskMs = utcMs + 3 * 3600000
  return new Date(mskMs).getHours()
}

// Выбрать привычки на сегодня — по одной из каждого пула, детерминированно.
function pickTodaysQuests(dayKey) {
  return BOOST_POOLS.map((pool, poolIdx) => {
    // Сдвигаем seed индексом пула, чтобы три пула не двигались синхронно.
    const idx = hashKey(`${dayKey}:${pool.period}:${poolIdx}`) % pool.items.length
    const item = pool.items[idx]
    return {
      ...item,
      period: pool.period,
      periodEmoji: pool.periodEmoji,
      periodLabel: pool.periodLabel,
      openHourMsk: pool.openHourMsk,
      xp: SLOT_XP
    }
  })
}

export default function DailyQuests() {
  // Сегодняшний набор. Считаем один раз за монтирование — ключ дня стабилен.
  const [dayKey] = useState(() => getTodayKey())
  const [quests] = useState(() => pickTodaysQuests(getTodayKey()))

  const [completed, setCompleted] = useState(() => getDailyQuestsSync())
  const [animating, setAnimating] = useState(null)
  const [floatingRewards, setFloatingRewards] = useState([])

  // Текущий час МСК в state — чтобы окна открывались без перезагрузки страницы.
  const [mskHour, setMskHour] = useState(() => getMskHour())

  // Раскрыт ли блок с зачёркнутыми квестами под «День пройден».
  const [expanded, setExpanded] = useState(false)

  const lastTapRef = useRef({})
  const expandedListRef = useRef(null)
  const [expandedHeight, setExpandedHeight] = useState(0)

  const TAP_THRESHOLD_PX = 8
  const pointerStartRef = useRef(null)
  const containerRef = useRef(null)

  // Флаг «бонус уже начисляли в этой сессии» — страховка от двойного вызова
  // (бэкенд тоже защищён уникальным ключом, но лишний RPC ни к чему).
  const bonusInFlightRef = useRef(false)

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
    return () => {
      offReady()
      offChanged()
    }
  }, [])

  // Тикаем час МСК раз в минуту — чтобы слот сам разблокировался, если юзер
  // держит страницу открытой через 12:00 или 18:00.
  useEffect(() => {
    const t = setInterval(() => setMskHour(getMskHour()), 60000)
    return () => clearInterval(t)
  }, [])

  // Слот открыт, если его час наступил (или открыт сразу).
  const isSlotOpen = (q) => q.openHourMsk === null || mskHour >= q.openHourMsk

  const allSlotsDone = quests.every(q => completed[q.id])
  const bonusDone = !!completed[BONUS_QUEST_ID]
  // «День пройден» показываем только когда и слоты, и бонус закрыты —
  // иначе на миг мелькнул бы свёрнутый блок без начисленного бонуса.
  const dayComplete = allSlotsDone && bonusDone

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

  // Когда все 3 слота закрыты, а бонус ещё нет — автоначисляем +40.
  useEffect(() => {
    if (!allSlotsDone || bonusDone || bonusInFlightRef.current) return

    bonusInFlightRef.current = true
    haptic.success()

    // Плавающая награда бонуса — летит над центром карточки.
    const rewardKey = Date.now()
    setFloatingRewards(prev => [...prev, { id: BONUS_QUEST_ID, xp: FULL_DAY_BONUS, key: rewardKey }])
    setTimeout(() => {
      setFloatingRewards(prev => prev.filter(r => r.key !== rewardKey))
    }, 1300)

    completeQuest(BONUS_QUEST_ID, FULL_DAY_BONUS).then(result => {
      setCompleted(result.completed)
    }).finally(() => {
      // Не сбрасываем флаг — бонус за день уже отдан, повторов быть не должно.
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
    if (dx > TAP_THRESHOLD_PX || dy > TAP_THRESHOLD_PX) return // скролл
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
                  <span style={styles.periodEmojiDone}>{quest.periodEmoji}</span>
                  <span style={styles.questTextDone}>{quest.title}</span>
                  <span style={{ ...styles.rewardBadgeDone, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    +{quest.xp} <MuscleIcon size={18} earned={true} />
                  </span>
                </div>
              ))}
              {/* Строка бонуса за полный день */}
              <div style={{ ...styles.questRowDone, ...styles.bonusRowDone }}>
                <span style={styles.bonusGift}>🎁</span>
                <span style={styles.questTextDone}>Бонус за полный день</span>
                <span style={{ ...styles.rewardBadgeDone, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  +{FULL_DAY_BONUS} <MuscleIcon size={18} earned={true} />
                </span>
              </div>
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
                  opacity: isDone ? 0.5 : locked ? 0.4 : 1,
                  cursor: isDone || locked ? 'default' : 'pointer',
                  transform: isAnimating ? 'scale(0.97)' : 'scale(1)'
                }}
              >
                <div style={styles.checkboxWrap}>
                  {locked ? (
                    <LockIcon />
                  ) : (
                    <PixelCheckbox checked={isDone} size={20} />
                  )}
                </div>

                <span style={styles.periodEmoji}>{quest.periodEmoji}</span>

                <span style={{
                  ...styles.questText,
                  textDecoration: isDone ? 'line-through' : 'none',
                  color: isDone
                    ? 'var(--color-text-secondary)'
                    : locked
                      ? 'var(--color-text-secondary)'
                      : 'var(--color-text)'
                }}>
                  {locked ? `Откроется в ${quest.openHourMsk}:00` : quest.title}
                </span>

                <div style={styles.rewardBadgeWrap}>
                  {locked ? (
                    <span style={styles.lockedHint}>{quest.periodLabel}</span>
                  ) : (
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
                  )}

                  {reward && (
                    <span key={reward.key} style={styles.floatingReward}>
                      +{reward.xp} <MuscleIcon size={18} earned={true} />
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Плавающая награда бонуса по центру карточки (когда летит boost_full_day) */}
      {floatingRewards.some(r => r.id === BONUS_QUEST_ID) && (
        <span style={styles.bonusFloating}>
          +{FULL_DAY_BONUS} <MuscleIcon size={20} earned={true} /> бонус!
        </span>
      )}

      <style>{`
        @keyframes rewardFloatUp {
          0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.8); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
          85%  { opacity: 1; transform: translateX(-50%) translateY(-42px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-54px) scale(0.9); }
        }
        @keyframes bonusPop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.7); }
          20%  { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.1); }
          75%  { opacity: 1; transform: translateX(-50%) translateY(-6px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.95); }
        }
      `}</style>
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

// Замочек для заблокированного слота — на месте чекбокса.
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', margin: '2px' }}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none"
        stroke="var(--color-text-secondary)" strokeWidth="1.4" />
      <path d="M5 7 V5 a3 3 0 0 1 6 0 V7" fill="none"
        stroke="var(--color-text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
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
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  periodEmoji: {
    fontSize: '15px',
    lineHeight: 1,
    flexShrink: 0,
    width: '20px',
    textAlign: 'center'
  },
  periodEmojiDone: {
    fontSize: '15px',
    lineHeight: 1,
    flexShrink: 0,
    width: '20px',
    textAlign: 'center',
    opacity: 0.55
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
  // Подпись периода у заблокированного слота вместо бейджа награды.
  lockedHint: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    opacity: 0.7
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
  // Крупная плавающая награда бонуса по центру карточки.
  bonusFloating: {
    position: 'absolute',
    bottom: '50%',
    left: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '17px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textShadow: '0 0 12px rgba(158, 209, 83, 0.8)',
    animation: 'bonusPop 1.3s ease-out forwards',
    zIndex: 5
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
    gap: '2px'
  },
  questRowDone: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 6px',
    opacity: 0.55
  },
  // Строка бонуса — лёгкий акцент сверху отделяющей линией.
  bonusRowDone: {
    marginTop: '2px',
    paddingTop: '8px',
    borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
    opacity: 0.7
  },
  bonusGift: {
    fontSize: '16px',
    lineHeight: 1,
    flexShrink: 0,
    width: '20px',
    textAlign: 'center'
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