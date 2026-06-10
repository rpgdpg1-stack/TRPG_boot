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
import { getMyFriendsPlace } from '../lib/leaderboard'
import { getCurrentUser } from '../lib/auth'
import { EVENTS, on } from '../lib/events'
import { spawnFireSparks } from './ParticlesBg'
import XPBar from './XPBar'
import RanksPopup from './RanksPopup'
import RankIcon from './RankIcon'
import MuscleIcon from './MuscleIcon'
import StreakFlame from './StreakFlame'

/**
 * Главный блок персонажа на Главной.
 *
 * Макет:
 *   [АВАТАР 100x100 квадрат]   Имя @ник
 *                              Ранг (цветной)
 *                              [💪 XP-бар  🔥 x2]
 *
 * StreakFlame вынесен в отдельный компонент (src/components/StreakFlame.jsx) —
 * используется и тут, и в попапе серии на странице профиля.
 */

const SOURCE_LABELS = {
  workout:      'Тренировка',
  quest:        'Дневной буст',
  streak:       'Бонус за серию',
  backup:       'Подстраховка',
  backup_bonus: 'Поддержка друга',
  manual:       'Начисление'
}

function formatSourceLabel(source) {
  return SOURCE_LABELS[source] || 'Начисление'
}

export default function PlayerCard() {
  const navigate = useNavigate()

  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  const [xp, setXP] = useState(() => getCurrentUser()?.total_muscles || 0)
  const [weeklyStreak, setWeeklyStreak] = useState(() => {
    const u = getCurrentUser()
    return u?.weekly_streak || 0
  })
  const [recentHistory, setRecentHistory] = useState([])
  const [showXPDetails, setShowXPDetails] = useState(false)
  const [showRanks, setShowRanks] = useState(false)
  const [friendsPlace, setFriendsPlace] = useState(1)

  const [showStreakPopup, setShowStreakPopup] = useState(false)
  const [muscleFlexTick, setMuscleFlexTick] = useState(0)
  const [rankPopTick, setRankPopTick] = useState(0)

  const xpButtonRef = useRef(null)
  const xpPopupRef = useRef(null)
  const rankButtonRef = useRef(null)
  const streakButtonRef = useRef(null)
  const streakPopupRef = useRef(null)
  const xpAutoCloseTimer = useRef(null)
  const streakAutoCloseTimer = useRef(null)

  useEffect(() => {
    const tgUser = getUser()
    if (tgUser) setUser(prev => ({ ...prev, ...tgUser }))

    const loadData = () => {
      Promise.all([
        getTotalXP(),
        getWeeklyStreak(),
        getRecentMuscleHistory(3),
        getMyFriendsPlace()
      ]).then(([xpVal, streak, history, place]) => {
        setXP(xpVal)
        setWeeklyStreak(streak)
        setRecentHistory(history)
        setFriendsPlace(place)
      })
    }

    loadData()

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
    if (!showXPDetails) return
    const handleOutsideClick = (e) => {
      if (xpButtonRef.current?.contains(e.target)) return
      if (xpPopupRef.current?.contains(e.target)) return
      setShowXPDetails(false)
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [showXPDetails])

  useEffect(() => {
    if (showXPDetails) {
      xpAutoCloseTimer.current = setTimeout(() => setShowXPDetails(false), 6000)
    }
    return () => { if (xpAutoCloseTimer.current) clearTimeout(xpAutoCloseTimer.current) }
  }, [showXPDetails])

  useEffect(() => {
    if (showStreakPopup) {
      streakAutoCloseTimer.current = setTimeout(() => setShowStreakPopup(false), 6000)
    }
    return () => { if (streakAutoCloseTimer.current) clearTimeout(streakAutoCloseTimer.current) }
  }, [showStreakPopup])

  useEffect(() => {
    if (!showStreakPopup) return
    const handleOutside = (e) => {
      if (streakButtonRef.current?.contains(e.target)) return
      if (streakPopupRef.current?.contains(e.target)) return
      setShowStreakPopup(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [showStreakPopup])

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
    navigate('/profile')
  }

  const handleXPTap = () => {
    haptic.light()
    setMuscleFlexTick(t => t + 1)
    setShowXPDetails(prev => !prev)
    setShowRanks(false)
  }

  const handleRankTap = () => {
    haptic.light()
    setRankPopTick(t => t + 1)
    setShowRanks(prev => !prev)
    setShowXPDetails(false)
  }

  const handlePlaceTap = () => {
    haptic.light()
    navigate('/leaderboard?tab=friends')
  }

  const handleStreakTap = (e) => {
    haptic.light()
    if (weeklyStreak >= 3) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      spawnFireSparks(x, y)
    }
    if (!showStreakPopup) {
      setShowStreakPopup(true)
      setShowXPDetails(false)
      setShowRanks(false)
    }
  }

  return (
    <div style={styles.container}>

      <div style={styles.topPanel}>

        <button
          onClick={handleAvatarTap}
          style={styles.avatarWrap}
          aria-label="Открыть профиль"
        >
          <div style={{
            ...styles.avatarInner,
            borderColor: rank.color,
            boxShadow: `0 0 12px ${rank.color}33`
          }}>
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

          <div style={styles.nameRow}>
            <span style={styles.name}>{displayName}</span>
            {username && <span style={styles.username}>{username}</span>}
          </div>

          <div style={styles.rankWrap} data-rank-button-wrap>
            <button
              ref={rankButtonRef}
              onClick={handleRankTap}
              style={{ ...styles.rank, color: rank.color, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <span
                key={`rankpop-${rankPopTick}`}
                style={{
                  display: 'inline-flex',
                  animation: rankPopTick ? 'rankIconPop 0.4s ease-out' : 'none'
                }}
              >
                <RankIcon level={level} size={26} />
              </span>
              {rank.name} {rank.subLevel}
            </button>

            <button
              onClick={handlePlaceTap}
              style={styles.friendsPlaceButton}
              aria-label="Открыть рейтинг друзей"
            >
              🏆 #{friendsPlace}
            </button>

            {showRanks && (
              <RanksPopup
                currentLevel={level}
                onClose={() => setShowRanks(false)}
              />
            )}
          </div>
        </div>
      </div>

      <div style={styles.bottomRowWrap}>
          <div style={styles.bottomRow}>
            <div style={styles.xpBlock}>
              <button ref={xpButtonRef} onClick={handleXPTap} style={styles.xpBarButton}>
                <XPBar
                  progress={progress}
                  color={rank.color}
                  current={totalCurrent}
                  needed={totalNeeded}
                  flexTrigger={muscleFlexTick}
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
                          <span style={{ ...styles.popupAmount, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            +{row.amount} <MuscleIcon size={18} earned={true} />
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
                    <span style={{ ...styles.popupAmount, color: rank.color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {remainingToNext} <MuscleIcon size={18} earned={true} />
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              ref={streakButtonRef}
              onClick={handleStreakTap}
              style={styles.streakButton}
              aria-label={`Серия: ${weeklyStreak}`}
            >
              <StreakFlame streak={weeklyStreak} />
              <span style={styles.streakCount}>x{weeklyStreak}</span>
            </button>

            {showStreakPopup && (
              <div ref={streakPopupRef} style={styles.streakPopup}>
                <div style={styles.streakPopupTitle}>СЕРИЯ ТРЕНИРОВОК В НЕДЕЛЮ</div>
                <div style={styles.streakPopupRow}>
                  <StreakFlame streak={weeklyStreak} />
                  <span style={styles.streakPopupCount}>x{weeklyStreak}</span>
                </div>
                <div style={styles.streakPopupHint}>
                  Сброс серии происходит каждую неделю
                </div>
              </div>
            )}
          </div>
      </div>

      <style>{`
        @keyframes popupShowHide {
          0%   { opacity: 0; transform: translateY(-6px); }
          4%   { opacity: 1; transform: translateY(0); }
          96%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        @keyframes rankIconPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.22); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: '8px 0 4px',
    padding: '12px 14px',
    position: 'relative',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)'
  },
  topPanel: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
    padding: 0
  },
  bottomRowWrap: {
    position: 'relative',
    padding: 0
  },
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
    borderRadius: '33px',
    overflow: 'hidden',
    background: 'var(--color-card)',
    border: '2px solid',
    transition: 'border-color 0.4s ease, box-shadow 0.4s ease'
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
  infoColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    justifyContent: 'center',
    alignSelf: 'center'
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
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '2px'
  },
  rank: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '15px',
    letterSpacing: '1.5px',
    padding: '2px 0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer'
  },
  friendsPlaceButton: {
    marginLeft: '10px',
    padding: '2px 8px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    letterSpacing: '1px',
    color: 'var(--color-text)',
    cursor: 'pointer',
    transition: 'background 0.2s ease, border-color 0.2s ease'
  },
  bottomRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  xpBlock: {
    flex: 1,
    minWidth: 0,
    position: 'relative'
  },
  xpBarButton: { width: '100%', padding: 0, background: 'transparent' },
  streakButton: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    minWidth: '52px',
    justifyContent: 'flex-start'
  },
  streakCount: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '14px',
    color: '#FFFFFF',
    letterSpacing: '1px',
    lineHeight: 1,
    textShadow: '0 0 4px rgba(0, 0, 0, 0.8)'
  },
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
  streakPopup: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 8px)',
    minWidth: '200px',
    maxWidth: 'calc(100vw - 32px)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 140, 66, 0.20)',
    borderRadius: '20px',
    padding: '12px 14px 10px',
    zIndex: 50,
    animation: 'popupShowHide 6.4s ease-out forwards',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 12px rgba(255, 140, 66, 0.1)'
  },
  streakPopupTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1.5px',
    textAlign: 'center',
    whiteSpace: 'nowrap'
  },
  streakPopupRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '2px 0'
  },
  streakPopupCount: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '22px',
    color: '#FFFFFF',
    letterSpacing: '1px',
    lineHeight: 1,
    textShadow: '0 0 6px rgba(255, 140, 66, 0.6)'
  },
  streakPopupHint: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    fontWeight: 500,
    marginTop: '2px'
  }
}