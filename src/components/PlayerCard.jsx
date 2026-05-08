import { useEffect, useState } from 'react'
import { getUser, haptic } from '../lib/telegram'
import { getTotalXP, getStreak } from '../lib/storage'
import { getLevelFromXP, getRankByLevel, getLevelProgress, getXPInCurrentLevel, pluralizeDays, XP_REWARDS } from '../lib/levels'
import XPBar from './XPBar'

/**
 * Главный блок персонажа — на Главной странице.
 * Аватар круглый с пиксельной рамкой + кольцо XP по периметру.
 * Имя, ник, ранг, XP-бар, серия.
 */
export default function PlayerCard() {
  const [user, setUser] = useState(null)
  const [xp, setXP] = useState(0)
  const [streak, setStreak] = useState(0)
  const [showXPDetails, setShowXPDetails] = useState(false)
  const [showStreakHint, setShowStreakHint] = useState(false)

  useEffect(() => {
    setUser(getUser())
    Promise.all([getTotalXP(), getStreak()]).then(([xp, s]) => {
      setXP(xp)
      setStreak(s)
    })
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

  const handleStreakTap = () => {
    haptic.light()
    setShowStreakHint(prev => !prev)
    setTimeout(() => setShowStreakHint(false), 3000)
  }

  return (
    <div style={styles.container}>

      {/* АВАТАР с круглой пиксельной рамкой и кольцом XP */}
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

          {/* Пиксельная рамка вокруг аватара */}
          <PixelFrame radius={58} cx={70} cy={70} color={rank.color} />
        </svg>

        {/* Сама фотка */}
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

      {/* РАНГ */}
      <div style={{ ...styles.rank, color: rank.color }}>
        {rank.emoji} {rank.name} · УРОВЕНЬ {level}
      </div>

      {/* XP-БАР (кликабельный) */}
      <div style={styles.xpBlock}>
        <button onClick={handleXPTap} style={styles.xpBarButton}>
          <XPBar progress={progress} color={rank.color} segments={20} />
        </button>
        <div style={styles.xpNumbers}>
          <span style={styles.xpCurrent}>{current}</span>
          <span style={styles.xpSlash}>/</span>
          <span style={styles.xpNeeded}>{needed}</span>
        </div>

        {/* Попап с разбором XP */}
        {showXPDetails && (
          <div style={styles.popup}>
            <div style={styles.popupRow}>
              <span>За тренировку</span>
              <span style={styles.popupValue}>+{XP_REWARDS.WORKOUT_COMPLETE} XP</span>
            </div>
            <div style={styles.popupRow}>
              <span>За серию (3 дня)</span>
              <span style={styles.popupValue}>+{XP_REWARDS.STREAK_BONUS_3DAYS} XP</span>
            </div>
            <div style={styles.popupRow}>
              <span>За серию (7 дней)</span>
              <span style={styles.popupValue}>+{XP_REWARDS.STREAK_BONUS_7DAYS} XP</span>
            </div>
            <div style={{ ...styles.popupRow, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, marginTop: 4 }}>
              <span>До следующего уровня</span>
              <span style={{ ...styles.popupValue, color: rank.color }}>{needed - current} XP</span>
            </div>
          </div>
        )}
      </div>

      {/* БЕЙДЖ СЕРИИ */}
      <button onClick={handleStreakTap} style={styles.streakBadge}>
        <span style={styles.streakIcon}>🔥</span>
        <span style={styles.streakLabel}>СЕРИЯ:</span>
        <span style={styles.streakValue}>{streak} {pluralizeDays(streak)}</span>
      </button>

      {showStreakHint && (
        <div style={styles.streakHint}>
          Чем длиннее серия — тем больше бонусов к опыту
        </div>
      )}
    </div>
  )
}

/**
 * Пиксельная рамка вокруг аватара — крупные квадраты 4x4 по окружности
 */
function PixelFrame({ radius, cx, cy, color }) {
  const count = 24
  const pixels = []

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    pixels.push(
      <rect
        key={i}
        x={x - 2}
        y={y - 2}
        width="4"
        height="4"
        fill={color}
        opacity="0.85"
      />
    )
  }

  return <g>{pixels}</g>
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
    width: '108px',
    height: '108px',
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
    fontSize: '44px',
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
  xpNumbers: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: '4px',
    marginTop: '6px',
    fontFamily: 'var(--font-tiny5)'
  },
  xpCurrent: {
    fontSize: '13px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  },
  xpSlash: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  xpNeeded: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
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
  streakBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '20px',
    marginTop: '12px'
  },
  streakIcon: {
    fontSize: '16px'
  },
  streakLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  streakValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-primary)',
    letterSpacing: '1px'
  },
  streakHint: {
    position: 'absolute',
    bottom: '-30px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '8px 12px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
    animation: 'pageFadeIn 0.2s ease-out',
    zIndex: 50
  }
}
