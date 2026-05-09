import { useEffect, useState, useRef } from 'react'
import { getUser, haptic } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak } from '../lib/storage'
import { getLevelFromXP, getRankByLevel, getLevelProgress, getXPInCurrentLevel, pluralizeWorkouts, XP_REWARDS } from '../lib/levels'
import { spawnFireSparks } from './ParticlesBg'
import XPBar from './XPBar'

/**
 * Главный блок персонажа на Главной.
 *
 * НОВОЕ в Г8:
 * - Попапы XP и серии закрываются по клику вне их (через document listener)
 * - Анимация появления снизу мягко (popupSlideDown), без "выезда" сбоку
 */
export default function PlayerCard() {
  const [user, setUser] = useState(null)
  const [xp, setXP] = useState(0)
  const [weeklyStreak, setWeeklyStreak] = useState(0)
  const [showXPDetails, setShowXPDetails] = useState(false)
  const [showStreakHint, setShowStreakHint] = useState(false)

  // Рефы на триггеры — чтобы при клике "вне" не закрывать если кликнули на сам триггер
  const xpButtonRef = useRef(null)
  const xpPopupRef = useRef(null)
  const streakButtonRef = useRef(null)
  const streakPopupRef = useRef(null)

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

  // Закрытие попапов по клику вне их
  useEffect(() => {
    if (!showXPDetails && !showStreakHint) return

    const handleOutsideClick = (e) => {
      // XP попап: не закрываем если кликнули по триггеру или по самому попапу
      if (showXPDetails) {
        if (xpButtonRef.current?.contains(e.target)) return
        if (xpPopupRef.current?.contains(e.target)) return
        setShowXPDetails(false)
      }
      // Streak попап: то же самое
      if (showStreakHint) {
        if (streakButtonRef.current?.contains(e.target)) return
        if (streakPopupRef.current?.contains(e.target)) return
        setShowStreakHint(false)
      }
    }

    // Используем pointerdown вместо click — срабатывает раньше и надёжнее
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [showXPDetails, showStreakHint])

  const level = getLevelFromXP(xp)
  const rank = getRankByLevel(level)
  const progress = getLevelProgress(xp)
  const { current, needed } = getXPInCurrentLevel(xp)

  const displayName = user?.first_name || 'ATHLETE'
  const username = user?.username ? `@${user.username}` : ''

  const handleXPTap = () => {
    haptic.light()
    setShowXPDetails(prev => !prev)
    setShowStreakHint(false) // закрываем другой попап если открыт
  }

  const handleStreakTap = (e) => {
    haptic.light()
    setShowStreakHint(prev => !prev)
    setShowXPDetails(false)

    if (weeklyStreak >= 3) {
      const rect = e.currentTarget.getBoundingClientRect()
      const flameCount = weeklyStreak >= 4 ? 4 : 3
      for (let i = 0; i < flameCount; i++) {
        const x = rect.left + (rect.width / (flameCount + 1)) * (i + 1)
        const y = rect.top + rect.height / 2
        spawnFireSparks(x, y)
      }
    }
  }

  const totalFlames = weeklyStreak >= 4 ? 4 : 3
  const filledFlames = Math.min(weeklyStreak, totalFlames)

  return (
    <div style={styles.container}>

      {/* АВАТАР с круглым кольцом XP */}
      <div style={styles.avatarWrap}>
        <svg
          style={styles.ring}
          viewBox="0 0 140 140"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="70" cy="70" r="66" fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth="3" />
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

      <div style={styles.name}>{displayName}</div>
      {username && <div style={styles.username}>{username}</div>}

      <div style={{ ...styles.rank, color: rank.color }}>
        {rank.emoji} {rank.name} {rank.subLevel}
      </div>

      {/* XP-БАР */}
      <div style={styles.xpBlock}>
        <button
          ref={xpButtonRef}
          onClick={handleXPTap}
          style={styles.xpBarButton}
        >
          <XPBar progress={progress} color={rank.color} current={current} needed={needed} />
        </button>

        {showXPDetails && (
          <div ref={xpPopupRef} style={styles.popup}>
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

      {/* РЯД ОГОНЬКОВ */}
      <div style={styles.streakWrap}>
        <button
          ref={streakButtonRef}
          onClick={handleStreakTap}
          style={styles.streakRow}
          aria-label="Серия тренировок"
        >
          {Array.from({ length: totalFlames }).map((_, i) => (
            <FlameIcon key={i} lit={i < filledFlames} />
          ))}
        </button>

        {showStreakHint && (
          <div ref={streakPopupRef} style={styles.streakPopup}>
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

      {/* Локальные кейфреймы для попапов */}
      <style>{`
        @keyframes popupSlideDown {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes popupSlideDownNoX {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function FlameIcon({ lit }) {
  const size = 22

  if (lit) {
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
    // Появляется снизу от XP-бара, выровнен по бару
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
    animation: 'popupSlideDownNoX 0.25s ease-out'
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
  // Обёртка над огоньками — нужна для позиционирования попапа относительно ряда
  streakWrap: {
    position: 'relative',
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  streakRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'transparent'
  },
  streakPopup: {
    // Появляется снизу от ряда огоньков
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    whiteSpace: 'nowrap',
    animation: 'popupSlideDown 0.25s ease-out',
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
    color: '#FF8C42',
    letterSpacing: '1px',
    margin: '0 2px'
  },
  streakPopupSub: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)'
  }
}
