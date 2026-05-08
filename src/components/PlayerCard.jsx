import { useEffect, useState } from 'react'
import { getUser, haptic } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak } from '../lib/storage'
import { getLevelFromXP, getRankByLevel, getLevelProgress, getXPInCurrentLevel, pluralizeWorkouts, XP_REWARDS } from '../lib/levels'
import { spawnFireSparks } from './ParticlesBg'
import XPBar from './XPBar'

/**
 * Главный блок персонажа на Главной.
 *
 * НОВОЕ в Порции В:
 * - Аватар без зелёных пикселей (только круглое кольцо XP)
 * - Фото больше — занимает место бывших пикселей
 * - Подпись формата "🟢 НОВОБРАНЕЦ 1" (без слова "УРОВЕНЬ")
 * - XP-бар с эмодзи 💪 слева, сплошной полосой и цифрами справа
 * - Внизу 3 огонька серии (демо: 1 горит, 2 пустых)
 * - 4-й огонёк появляется только если стрик > 3
 */
export default function PlayerCard() {
  const [user, setUser] = useState(null)
  const [xp, setXP] = useState(0)
  const [weeklyStreak, setWeeklyStreak] = useState(1) // демо-значение
  const [showXPDetails, setShowXPDetails] = useState(false)
  const [showStreakHint, setShowStreakHint] = useState(false)

  useEffect(() => {
    setUser(getUser())

    const loadData = () => {
      Promise.all([getTotalXP(), getWeeklyStreak()]).then(([xpVal, streak]) => {
        setXP(xpVal)
        setWeeklyStreak(streak)
      })
    }

    loadData()

    window.addEventListener('xp-updated', loadData)
    window.addEventListener('user-ready', loadData)
    window.addEventListener('user-updated', loadData)
    return () => {
      window.removeEventListener('xp-updated', loadData)
      window.removeEventListener('user-ready', loadData)
      window.removeEventListener('user-updated', loadData)
    }
  }, [])

  const level = getLevelFromXP(xp)
  const rank = getRankByLevel(level)
  const progress = getLevelProgress(xp)
  const { current, needed } = getXPInCurrentLevel(xp)

  const displayName = user?.first_name || 'ATHLETE'
  const username = user?.username ? `@${user.username}` : ''

  const handleXPTap = () => {
    haptic.light()
    setShowXPDetails(prev => !prev)
  }

  const handleStreakTap = (e) => {
    haptic.light()
    setShowStreakHint(prev => !prev)
    setTimeout(() => setShowStreakHint(false), 4000)

    // Если стрик 3+ — пускаем искорки из огоньков вверх
    if (weeklyStreak >= 3) {
      const rect = e.currentTarget.getBoundingClientRect()
      // Из каждого огонька (равномерно по ширине ряда)
      const flameCount = weeklyStreak >= 4 ? 4 : 3
      for (let i = 0; i < flameCount; i++) {
        const x = rect.left + (rect.width / (flameCount + 1)) * (i + 1)
        const y = rect.top + rect.height / 2
        spawnFireSparks(x, y)
      }
    }
  }

  // Сколько огоньков всего показывать: 3 по умолчанию, 4 если стрик 4+
  const totalFlames = weeklyStreak >= 4 ? 4 : 3
  const filledFlames = Math.min(weeklyStreak, totalFlames)

  return (
    <div style={styles.container}>

      {/* АВАТАР с круглым кольцом XP (без пиксельных квадратов) */}
      <div style={styles.avatarWrap}>
        <svg
          style={styles.ring}
          viewBox="0 0 140 140"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Кольцо-фон */}
          <circle
            cx="70"
            cy="70"
            r="66"
            fill="none"
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth="3"
          />
          {/* Кольцо XP */}
          <circle
            cx="70"
            cy="70"
            r="66"
            fill="none"
            stroke={rank.color}
            strokeWidth="3"
            strokeLinecap="butt"
            strokeDasharray={`${(progress / 100) * 414.7} 414.7`}
            transform="rotate(-90 70 70)"
            style={{
              filter: `drop-shadow(0 0 4px ${rank.color})`,
              transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease'
            }}
          />
        </svg>

        {/* Сама фотка — теперь крупнее (132×132 при контейнере 140×140) */}
        <div style={styles.avatarInner}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={styles.avatarImg} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* ИМЯ И НИК */}
      <div style={styles.name}>{displayName}</div>
      {username && <div style={styles.username}>{username}</div>}

      {/* РАНГ — формат "🟢 НОВОБРАНЕЦ 1" */}
      <div style={{ ...styles.rank, color: rank.color }}>
        {rank.emoji} {rank.name} {rank.subLevel}
      </div>

      {/* XP-БАР (мускулы) */}
      <div style={styles.xpBlock}>
        <button onClick={handleXPTap} style={styles.xpBarButton}>
          <XPBar progress={progress} color={rank.color} current={current} needed={needed} />
        </button>

        {/* Попап с разбором мускулов */}
        {showXPDetails && (
          <div style={styles.popup}>
            <div style={styles.popupRow}>
              <span>За тренировку</span>
              <span style={styles.popupValue}>+{XP_REWARDS.WORKOUT_COMPLETE} 💪</span>
            </div>
            <div style={styles.popupRow}>
              <span>За серию (3 дня)</span>
              <span style={styles.popupValue}>+{XP_REWARDS.STREAK_BONUS_3DAYS} 💪</span>
            </div>
            <div style={styles.popupRow}>
              <span>За серию (7 дней)</span>
              <span style={styles.popupValue}>+{XP_REWARDS.STREAK_BONUS_7DAYS} 💪</span>
            </div>
            <div style={{ ...styles.popupRow, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, marginTop: 4 }}>
              <span>До следующего уровня</span>
              <span style={{ ...styles.popupValue, color: rank.color }}>{needed - current} 💪</span>
            </div>
          </div>
        )}
      </div>

      {/* РЯД ОГОНЬКОВ СЕРИИ */}
      <button onClick={handleStreakTap} style={styles.streakRow} aria-label="Серия тренировок">
        {Array.from({ length: totalFlames }).map((_, i) => {
          const isLit = i < filledFlames
          return <FlameIcon key={i} lit={isLit} />
        })}
      </button>

      {/* Попап серии — пиксельные оранжевые цифры */}
      {showStreakHint && (
        <div style={styles.streakPopup}>
          <span style={styles.streakPopupText}>
            Серия:🔥
            <span style={styles.streakPopupNumber}>{weeklyStreak}</span>
            {' '}{pluralizeWorkouts(weeklyStreak)} в неделю
          </span>
          <span style={styles.streakPopupSub}>
            (серия сбросится в начале следующей недели)
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Иконка огонька — горящий или пустой контур.
 * SVG примитивно повторяет форму эмодзи 🔥.
 */
function FlameIcon({ lit }) {
  const size = 22

  if (lit) {
    // Заполненный — оранжевый с градиентом
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 4px rgba(255, 140, 66, 0.6))' }}>
        <defs>
          <linearGradient id="flameGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="50%" stopColor="#FF8C42" />
            <stop offset="100%" stopColor="#E84545" />
          </linearGradient>
        </defs>
        <path
          d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z"
          fill="url(#flameGrad)"
        />
      </svg>
    )
  }

  // Пустой — только контур серым
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z"
        fill="none"
        stroke="rgba(255, 255, 255, 0.25)"
        strokeWidth="1.5"
      />
    </svg>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 16px 4px',
    position: 'relative'
  },
  avatarWrap: {
    position: 'relative',
    width: '140px',
    height: '140px',
    marginBottom: '12px'
  },
  ring: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%'
  },
  avatarInner: {
    // Теперь больше: 124x124 (было 108x108)
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '124px',
    height: '124px',
    borderRadius: '50%',
    overflow: 'hidden',
    background: 'var(--color-card)'
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '52px',
    color: 'var(--color-primary)',
    background: 'var(--color-card)'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginTop: '4px'
  },
  username: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginTop: '-2px',
    marginBottom: '12px'
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    letterSpacing: '1.5px',
    marginBottom: '12px'
  },
  xpBlock: {
    width: '100%',
    maxWidth: '320px',
    position: 'relative'
  },
  xpBarButton: {
    width: '100%',
    padding: 0,
    background: 'transparent'
  },
  popup: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    right: 0,
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    padding: '14px 16px',
    zIndex: 50,
    animation: 'pageFadeIn 0.2s ease-out'
  },
  popupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    padding: '4px 0'
  },
  popupValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  },
  streakRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'transparent',
    marginTop: '12px'
  },
  streakPopup: {
    position: 'absolute',
    bottom: '-44px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '14px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    whiteSpace: 'nowrap',
    animation: 'pageFadeIn 0.2s ease-out',
    zIndex: 50
  },
  streakPopupText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text)',
    display: 'flex',
    alignItems: 'baseline',
    gap: '2px'
  },
  streakPopupNumber: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: '#FF8C42', // оранжевый под цвет огня
    letterSpacing: '1px',
    margin: '0 2px'
  },
  streakPopupSub: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)'
  }
}
