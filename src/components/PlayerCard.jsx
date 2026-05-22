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
 * Макет (горизонтальный):
 *   [АВАТАР 100px]   Дмитрий @rpgdpg
 *                    Новобранец III
 *                    [XP-БАР]
 *
 *   Ниже отдельной строкой по центру под всем блоком: 🔥🔥🔥 (серия)
 *
 * Аватар 100px без кольца прогресса (раньше было 140px с кольцом — место
 * сейчас занимает горизонтальный XP-бар, кольцо дублировало бы инфу).
 *
 * Попап под XP-баром:
 *  - Последние 3 начисления (что свежее — выше)
 *  - Разделитель
 *  - Прогресс до следующего ранга
 */

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

  return (
    <div style={styles.container}>

      {/* Горизонтальный блок: аватар слева, инфо справа */}
      <div style={styles.mainRow}>

        <button
          onClick={handleAvatarTap}
          style={styles.avatarWrap}
          aria-label="Открыть настройки"
        >
          <div style={styles.avatarInner}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarPlaceholder}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </button>

        <div style={styles.infoColumn}>

          {/* Имя + ник в одной строке */}
          <div style={styles.nameRow}>
            <span style={styles.name}>{displayName}</span>
            {username && <span style={styles.username}>{username}</span>}
          </div>

          {/* Ранг — кликабельный, открывает список рангов */}
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

          {/* XP-бар */}
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

                <div style={styles.popupSectionTitle}>ПОСЛЕДНИЕ НАЧИСЛЕНИЯ</div>

                {recentHistory.length === 0 ? (
                  <div style={styles.popupEmpty}>
                    Пока пусто.<br />
                    Выполни буст или тренировку, чтобы заработать первые мускулы.
                  </div>
                ) : (
                  <div style={styles.popupHistoryList}>
                    {recentHistory.map((row, idx) => (
                      <div key={idx} style={styles.popupRow}>
                        <span style={styles.popupLabel}>
                          {formatSourceLabel(row.source)}
                        </span>
                        <span style={styles.popupAmount}>
                          +{row.amount} 💪
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={styles.popupDivider} />

                <div style={styles.popupRow}>
                  <span style={styles.popupLabel}>
                    До «{nextRank.name} {nextRank.subLevel}»
                  </span>
                  <span style={{ ...styles.popupAmount, color: rank.color }}>
                    {remainingToNext} 💪
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Серия — отдельно ниже всего блока, по центру.
          Слева пиксельная подпись "СЕРИЯ:", справа огоньки. */}
      <div style={styles.streakWrap}>
        <button
          ref={streakButtonRef}
          onClick={handleStreakTap}
          style={styles.streakRow}
          aria-label="Серия тренировок"
        >
          <span style={styles.streakLabel}>СЕРИЯ:</span>
          <div style={styles.flamesRow}>
            {Array.from({ length: totalFlames }).map((_, i) => (
              <FlameIcon key={i} lit={i < filledFlames} />
            ))}
          </div>
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
    padding: '8px 4px 4px',
    position: 'relative',
    gap: '16px'
  },
  // Горизонтальный ряд: аватар + инфо
  mainRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px'
  },
  // Аватар — 100x100, без кольца прогресса
  avatarWrap: {
    width: '100px',
    height: '100px',
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    position: 'relative'
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    overflow: 'hidden',
    background: 'var(--color-card)',
    border: '2px solid rgba(255, 255, 255, 0.08)'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '38px',
    color: 'var(--color-primary)',
    background: 'var(--color-card)'
  },
  // Правая колонка с инфо — имя/ник, ранг, XP-бар
  infoColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    justifyContent: 'center'
  },
  nameRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    flexWrap: 'wrap'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1.1
  },
  username: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)'
  },
  rankWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start'
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    letterSpacing: '1.5px',
    padding: '2px 0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer'
  },
  xpBlock: {
    width: '100%',
    position: 'relative',
    marginTop: '2px'
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
  popupSectionTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '8px',
    paddingLeft: '2px'
  },
  popupHistoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  popupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 2px',
    gap: '10px'
  },
  popupLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text)',
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  popupAmount: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    flexShrink: 0,
    whiteSpace: 'nowrap'
  },
  popupEmpty: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    padding: '8px 4px',
    lineHeight: 1.5
  },
  popupDivider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.08)',
    margin: '8px 0'
  },
  // Серия — отдельный блок ниже всего, по центру
  streakWrap: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  streakRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 12px',
    background: 'transparent'
  },
  streakLabel: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  },
  flamesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
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