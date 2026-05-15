import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser, haptic } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak, getRecentMuscleHistory } from '../lib/storage'
import {
  getLevelFromXP,
  getRankByLevel,
  getLevelProgress,
  getXPInCurrentLevel,
  getTotalXPProgress
} from '../lib/levels'
import { pluralizeWorkouts } from '../utils/plural'
import { EVENTS, on } from '../lib/events'
import { spawnFireSparks } from './ParticlesBg'
import { refreshCurrentUser } from '../lib/auth'
import XPBar from './XPBar'
import RanksPopup from './RanksPopup'

/**
 * Главный блок персонажа на Главной.
 *
 * ОБНОВЛЕНИЕ XP-popup:
 *  Раньше показывалась таблица "за что сколько мускулов" — это статичная
 *  справка, мало кому нужная. Теперь показываем:
 *   - Последние 3 начисления (что свежее — выше)
 *   - Разделитель
 *   - "До следующего ранга «Новобранец 2» X 💪" — мотивация
 *
 *  Источник данных — таблица muscle_history через getRecentMuscleHistory.
 */

// Человекочитаемые названия источников начисления для попапа
const SOURCE_LABELS = {
  workout: 'Тренировка',
  quest:   'Дневной буст',
  streak:  'Бонус за серию',
  manual:  'Начисление'
}

function formatSourceLabel(source) {
  return SOURCE_LABELS[source] || 'Начисление'
}

export default function PlayerCard() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [xp, setXP] = useState(0)
  const [weeklyStreak, setWeeklyStreak] = useState(0)
  const [recentHistory, setRecentHistory] = useState([])
  const [showXPDetails, setShowXPDetails] = useState(false)
  const [showStreakHint, setShowStreakHint] = useState(false)
  const [showRanks, setShowRanks] = useState(false)

  const xpButtonRef = useRef(null)
  const xpPopupRef = useRef(null)
  const streakButtonRef = useRef(null)
  const streakPopupRef = useRef(null)
  const rankButtonRef = useRef(null)
  const xpAutoCloseTimer = useRef(null)
  const streakAutoCloseTimer = useRef(null)

  useEffect(() => {
    setUser(getUser())

    const loadData = () => {
      Promise.all([
        getTotalXP(),
        getWeeklyStreak(),
        getRecentMuscleHistory(3)
      ]).then(([xpVal, streak, history]) => {
        setXP(xpVal)
        setWeeklyStreak(streak)
        setRecentHistory(history)
      })
    }

    loadData()
    refreshCurrentUser().then(loadData).catch(() => {})

    const offReady = on(EVENTS.USER_READY, loadData)
    const offChanged = on(EVENTS.USER_CHANGED, loadData)
    return () => {
      offReady()
      offChanged()
    }
  }, [])

  // Обновляем историю каждый раз когда юзер открывает попап
  // (на случай если что-то начислилось пока попап был закрыт)
  useEffect(() => {
    if (showXPDetails) {
      getRecentMuscleHistory(3).then(setRecentHistory)
    }
  }, [showXPDetails])

  useEffect(() => {
    if (!showXPDetails && !showStreakHint) return
    const handleOutsideClick = (e) => {
      if (showXPDetails) {
        if (xpButtonRef.current?.contains(e.target)) return
        if (xpPopupRef.current?.contains(e.target)) return
        setShowXPDetails(false)
      }
      if (showStreakHint) {
        if (streakButtonRef.current?.contains(e.target)) return
        if (streakPopupRef.current?.contains(e.target)) return
        setShowStreakHint(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [showXPDetails, showStreakHint])

  useEffect(() => {
    if (showXPDetails) {
      xpAutoCloseTimer.current = setTimeout(() => setShowXPDetails(false), 6000)
    }
    return () => { if (xpAutoCloseTimer.current) clearTimeout(xpAutoCloseTimer.current) }
  }, [showXPDetails])

  useEffect(() => {
    if (showStreakHint) {
      streakAutoCloseTimer.current = setTimeout(() => setShowStreakHint(false), 4000)
    }
    return () => { if (streakAutoCloseTimer.current) clearTimeout(streakAutoCloseTimer.current) }
  }, [showStreakHint])

  const level = getLevelFromXP(xp)
  const rank = getRankByLevel(level)
  const progress = getLevelProgress(xp)

  const { current: totalCurrent, needed: totalNeeded } = getTotalXPProgress(xp)
  const { current: inLevelCurrent, needed: inLevelNeeded } = getXPInCurrentLevel(xp)

  // Имя СЛЕДУЮЩЕГО ранга — "До «Новобранец 2» X 💪"
  const nextRank = getRankByLevel(level + 1)
  const remainingToNext = Math.max(0, inLevelNeeded - inLevelCurrent)

  const displayName = user?.first_name || 'ATHLETE'
  const username = user?.username ? `@${user.username}` : ''

  const handleAvatarTap = () => {
    haptic.light()
    navigate('/settings')
  }

  const handleXPTap = () => {
    haptic.light()
    setShowXPDetails(prev => !prev)
    setShowStreakHint(false)
    setShowRanks(false)
  }

  const handleRankTap = () => {
    haptic.light()
    setShowRanks(prev => !prev)
    setShowXPDetails(false)
    setShowStreakHint(false)
  }

  const handleStreakTap = (e) => {
    haptic.light()
    setShowStreakHint(prev => !prev)
    setShowXPDetails(false)
    setShowRanks(false)

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

  const avatarSize = 140
  const avatarInnerSize = 124
  const ringR = 66
  const ringCircumference = 2 * Math.PI * ringR

  return (
    <div style={styles.container}>

      <button
        onClick={handleAvatarTap}
        style={{ ...styles.avatarWrap, width: avatarSize, height: avatarSize }}
        aria-label="Открыть настройки"
      >
        <svg style={styles.ring} viewBox={`0 0 ${avatarSize} ${avatarSize}`} xmlns="http://www.w3.org/2000/svg">
          <circle cx={avatarSize/2} cy={avatarSize/2} r={ringR} fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth="3" />
          <circle
            cx={avatarSize/2} cy={avatarSize/2} r={ringR}
            fill="none"
            stroke={rank.color}
            strokeWidth="3"
            strokeLinecap="butt"
            strokeDasharray={`${(progress / 100) * ringCircumference} ${ringCircumference}`}
            transform={`rotate(-90 ${avatarSize/2} ${avatarSize/2})`}
            style={{
              filter: `drop-shadow(0 0 4px ${rank.color})`,
              transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease'
            }}
          />
        </svg>

        <div style={{ ...styles.avatarInner, width: avatarInnerSize, height: avatarInnerSize }}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={styles.avatarImg} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </button>

      <div style={styles.name}>{displayName}</div>
      {username && <div style={styles.username}>{username}</div>}

      <div style={styles.rankWrap} data-rank-button-wrap>
        <button
          ref={rankButtonRef}
          onClick={handleRankTap}
          style={{ ...styles.rank, color: rank.color }}
        >
          {rank.emoji} {rank.name} {rank.subLevel}
        </button>

        {showRanks && (
          <RanksPopup
            currentLevel={level}
            onClose={() => setShowRanks(false)}
          />
        )}
      </div>

      <div style={styles.xpBlock}>
        <button ref={xpButtonRef} onClick={handleXPTap} style={styles.xpBarButton}>
          <XPBar
            progress={progress}
            color={rank.color}
            current={totalCurrent}
            needed={totalNeeded}
          />
        </button>

        {showXPDetails && (
          <div ref={xpPopupRef} style={styles.popup}>

            {/* Заголовок последних начислений */}
            <div style={styles.popupSectionTitle}>ПОСЛЕДНИЕ НАЧИСЛЕНИЯ</div>

            {recentHistory.length === 0 ? (
              <div style={styles.popupEmpty}>
                Пока пусто.<br />
                Выполни буст или тренировку, чтобы заработать первые мускулы.
              </div>
            ) : (
              <div style={styles.popupHistoryList}>
                {recentHistory.map((row, idx) => (
                  <div key={idx} style={styles.popupHistoryRow}>
                    <span style={styles.popupHistoryAmount}>+{row.amount} 💪</span>
                    <span style={styles.popupHistoryLabel}>{formatSourceLabel(row.source)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Разделитель */}
            <div style={styles.popupDivider} />

            {/* Прогресс до следующего ранга */}
            <div style={styles.popupRow}>
              <span style={styles.popupNextLabel}>
                До «{nextRank.name} {nextRank.subLevel}»
              </span>
              <span style={{ ...styles.popupValue, color: rank.color }}>
                {remainingToNext} 💪
              </span>
            </div>
          </div>
        )}
      </div>

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

      <style>{`
        @keyframes popupShowHide {
          0%   { opacity: 0; transform: translateY(-6px); }
          4%   { opacity: 1; transform: translateY(0); }
          96%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        @keyframes popupShowHideCentered {
          0%   { opacity: 0; transform: translate(-50%, -6px); }
          6%   { opacity: 1; transform: translate(-50%, 0); }
          94%  { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -4px); }
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
        <path d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z" fill="url(#flameGrad)" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z" fill="none" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1.5" />
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
    marginBottom: '12px',
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  ring: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  avatarInner: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    overflow: 'hidden',
    background: 'var(--color-card)'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
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
    lineHeight: 1.1
  },
  username: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '12px'
  },
  rankWrap: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center'
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    letterSpacing: '1.5px',
    padding: '4px 10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer'
  },
  xpBlock: {
    width: '100%',
    maxWidth: '320px',
    position: 'relative',
    marginTop: '12px'
  },
  xpBarButton: { width: '100%', padding: 0, background: 'transparent' },
  popup: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0, right: 0,
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    padding: '14px 16px 12px',
    zIndex: 50,
    animation: 'popupShowHide 6.4s ease-out forwards'
  },
  // Заголовок секции "ПОСЛЕДНИЕ НАЧИСЛЕНИЯ"
  popupSectionTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '8px',
    paddingLeft: '2px'
  },
  // Список последних начислений
  popupHistoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '4px'
  },
  popupHistoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px 2px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px'
  },
  popupHistoryAmount: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    minWidth: '58px',
    flexShrink: 0
  },
  popupHistoryLabel: {
    color: 'var(--color-text)',
    flex: 1
  },
  popupEmpty: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    padding: '8px 4px',
    lineHeight: 1.5
  },
  // Тонкая разделительная черта между историей и "до следующего ранга"
  popupDivider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.08)',
    margin: '8px 0'
  },
  popupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    padding: '2px 0'
  },
  popupNextLabel: {
    color: 'var(--color-text)',
    fontWeight: 600
  },
  popupValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1px'
  },
  streakWrap: { position: 'relative', marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  streakRow: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'transparent' },
  streakPopup: {
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
    animation: 'popupShowHideCentered 4.4s ease-out forwards',
    zIndex: 50
  },
  streakPopupText: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text)', display: 'flex', alignItems: 'baseline', gap: '2px' },
  streakPopupNumber: { fontFamily: 'var(--font-tiny5)', fontSize: '14px', color: '#FF8C42', letterSpacing: '1px', margin: '0 2px' },
  streakPopupSub: { fontFamily: 'var(--font-manrope)', fontSize: '10px', color: 'var(--color-text-secondary)' }
}