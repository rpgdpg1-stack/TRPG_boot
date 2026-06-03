import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, getUser } from '../lib/telegram'
import { getTotalXP, getWeeklyStreak, getTotalWorkouts, getRecentMuscleHistory, getRecentWorkouts } from '../lib/storage'
import { getLevelFromXP, getRankByLevel, getXPInCurrentLevel } from '../lib/levels'
import { getMyFriendsPlace } from '../lib/leaderboard'
import { getProgramByDbId } from '../features/programs/registry'
import { getCurrentUser } from '../lib/auth'
import RankIcon from '../components/RankIcon'
import RanksPopup from '../components/RanksPopup'
import StreakFlame from '../components/StreakFlame'
import { shareReferralLink } from '../lib/friends'
import { EVENTS, on } from '../lib/events'
import UiIcon from '../components/UiIcon'
import MuscleIcon from '../components/MuscleIcon'

/**
 * Экран "Профиль".
 *
 * Шапка повторяет главную «один в один»: тот же sticky-приём, аватар начинается
 * на той же высоте. Вместо XP-бара — три пилюли (Мускулы / Серия / Тренировок)
 * в плашке того же цвета что и бар на главной. По тапу каждая открывает попап:
 *  - Мускулы → последние начисления + сколько до следующего ранга
 *  - Серия   → огонёк + подсказка (как на главной)
 *  - Тренировок → даты последних 3 тренировок + всего
 *
 * Ниже — сгруппированные по смыслу разделы (заголовок + единая карточка,
 * разделители, серая подсветка .tg-row).
 */

const SOURCE_LABELS = {
  workout: 'Тренировка',
  quest:   'Дневной буст',
  streak:  'Бонус за серию',
  manual:  'Начисление'
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmtWorkoutDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
}

function programTitle(dbId) {
  const p = getProgramByDbId(dbId)
  if (!p) return 'Тренировка'
  return p.title.charAt(0).toUpperCase() + p.title.slice(1).toLowerCase()
}

export default function Profile() {
  const navigate = useNavigate()

  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  const [stats, setStats] = useState({ xp: 0, streak: 0, totalWorkouts: 0 })
  const [friendsPlace, setFriendsPlace] = useState(1)
  const [recentHistory, setRecentHistory] = useState([])
  const [recentWorkouts, setRecentWorkouts] = useState([])

  const [showRanks, setShowRanks] = useState(false)
  const [rankPopTick, setRankPopTick] = useState(0)
  // Какой попап над пилюлями открыт: null | 'muscles' | 'streak' | 'workouts'
  const [activePopup, setActivePopup] = useState(null)

  const rankButtonRef = useRef(null)
  const pillsRef = useRef(null)

  useEffect(() => {
    backButton.hide()
    lockVerticalSwipes()
  }, [])

  useEffect(() => {
    const tgUser = getUser()
    if (tgUser) setUser(prev => ({ ...prev, ...tgUser }))

    const loadStats = () => {
      Promise.all([
        getTotalXP(),
        getWeeklyStreak(),
        getTotalWorkouts(),
        getMyFriendsPlace(),
        getRecentMuscleHistory(3),
        getRecentWorkouts(3)
      ]).then(([xp, streak, totalWorkouts, place, history, workouts]) => {
        setStats({ xp, streak, totalWorkouts })
        setFriendsPlace(place)
        setRecentHistory(history)
        setRecentWorkouts(workouts)
      })
    }
    loadStats()

    const offReady = on(EVENTS.USER_READY, loadStats)
    const offChanged = on(EVENTS.USER_CHANGED, loadStats)
    return () => {
      offReady()
      offChanged()
    }
  }, [])

  // Автозакрытие попапа через 6с + закрытие по тапу вне плашки пилюль.
  useEffect(() => {
    if (!activePopup) return
    const t = setTimeout(() => setActivePopup(null), 6000)
    const onOutside = (e) => {
      if (pillsRef.current?.contains(e.target)) return
      setActivePopup(null)
    }
    document.addEventListener('pointerdown', onOutside)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', onOutside)
    }
  }, [activePopup])

  const level = getLevelFromXP(stats.xp)
  const rank = getRankByLevel(level)
  const displayName = user?.first_name || 'ATHLETE'
  const username = user?.username ? `@${user.username}` : ''

  const { current: inLevelCurrent, needed: inLevelNeeded } = getXPInCurrentLevel(stats.xp)
  const nextRank = getRankByLevel(level + 1)
  const remainingToNext = Math.max(0, inLevelNeeded - inLevelCurrent)

  const handleRankTap = () => {
    haptic.light()
    setRankPopTick(t => t + 1)
    setShowRanks(prev => !prev)
    setActivePopup(null)
  }

  const handlePlaceTap = () => {
    haptic.light()
    navigate('/leaderboard?tab=friends')
  }

  const togglePopup = (which) => {
    haptic.light()
    setShowRanks(false)
    setActivePopup(prev => (prev === which ? null : which))
  }

  const sectionGroups = [
    {
      title: 'ДОСТИЖЕНИЯ',
      items: [
        { id: 'leaderboard', icon: 'ui:leaderboard', title: 'Рейтинг', subtitle: 'Друзья · Лига · Сезон',       path: '/leaderboard' },
        { id: 'rewards',     icon: 'ui:rewards',     title: 'Награды', subtitle: 'Значки лиг · Сезонные рамки', path: '/rewards' }
      ]
    },
    {
      title: 'ТЕЛО',
      items: [
        { id: 'personal',     icon: '👤', title: 'Личные данные', subtitle: 'Пол · Рост · Возраст' },
        { id: 'measurements', icon: '📏', title: 'Замеры тела',   subtitle: 'Вес · Объёмы · Фото' },
        { id: 'goal',         icon: '🎯', title: 'Цель',          subtitle: 'Что хочешь достичь' }
      ]
    },
    {
      title: 'ЕЩЁ',
      items: [
        { id: 'recovery', icon: '🛌',          title: 'Восстановление', subtitle: 'Сон · Питание · Здоровье',      path: '/recovery' },
        { id: 'settings', icon: 'ui:settings', title: 'Настройки',      subtitle: 'Уведомления · Сброс прогресса', path: '/settings' }
      ]
    }
  ]

  const handleSectionTap = (item) => {
    haptic.light()
    if (item.path) navigate(item.path)
  }

  const handleInviteTap = async () => {
    haptic.medium()
    await shareReferralLink()
  }

  const streakHint = stats.streak === 0
    ? 'Заверши тренировку чтобы зажечь огонёк'
    : stats.streak < 4
      ? `${4 - stats.streak} до максимума недели`
      : 'Максимум этой недели'

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Закреплённая шапка — тот же приём что playerSticky на главной */}
      <div style={styles.playerSticky}>
        <div style={styles.playerInner}>

          {/* Плашка аватар + имя/ник + ранг + место */}
          <div style={styles.topPanel}>
            <div style={styles.avatarWrap}>
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
            </div>

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
                    style={{ display: 'inline-flex', animation: rankPopTick ? 'rankIconPopProfile 0.4s ease-out' : 'none' }}
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
                  <RanksPopup currentLevel={level} onClose={() => setShowRanks(false)} />
                )}
              </div>
            </div>
          </div>

          {/* Плашка с тремя пилюлями — на месте XP-бара главной */}
          <div ref={pillsRef} style={styles.pillsPanel}>
            <button onClick={() => togglePopup('muscles')} style={styles.pill}>
              <div style={{ ...styles.pillValue, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                {stats.xp} <MuscleIcon size={15} earned={true} />
              </div>
              <div style={styles.pillLabel}>МУСКУЛЫ</div>
            </button>

            <button onClick={() => togglePopup('streak')} style={styles.pill}>
              <div style={styles.pillValue}>🔥 {stats.streak}</div>
              <div style={styles.pillLabel}>СЕРИЯ</div>
            </button>

            <button onClick={() => togglePopup('workouts')} style={styles.pill}>
              <div style={styles.pillValue}>{stats.totalWorkouts}</div>
              <div style={styles.pillLabel}>ТРЕНИРОВОК</div>
            </button>

            {/* Попап над пилюлями */}
            {activePopup === 'muscles' && (
              <div style={styles.popup}>
                <div style={styles.popupSectionTitle}>ПОСЛЕДНИЕ НАЧИСЛЕНИЯ</div>
                {recentHistory.length === 0 ? (
                  <div style={styles.popupEmpty}>
                    Пока пусто.<br />Выполни буст или тренировку, чтобы заработать первые мускулы.
                  </div>
                ) : (
                  <div style={styles.popupList}>
                    {recentHistory.map((row, idx) => (
                      <div key={idx} style={styles.popupRow}>
                        <span style={styles.popupLabel}>{SOURCE_LABELS[row.source] || 'Начисление'}</span>
                        <span style={{ ...styles.popupAmount, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          +{row.amount} <MuscleIcon size={16} earned={true} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={styles.popupDivider} />
                <div style={styles.popupRow}>
                  <span style={styles.popupLabel}>До «{nextRank.name} {nextRank.subLevel}»</span>
                  <span style={{ ...styles.popupAmount, color: rank.color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {remainingToNext} <MuscleIcon size={16} earned={true} />
                  </span>
                </div>
              </div>
            )}

            {activePopup === 'streak' && (
              <div style={{ ...styles.popup, alignItems: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={styles.popupSectionTitle}>СЕРИЯ ТРЕНИРОВОК В НЕДЕЛЮ</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }}>
                  <StreakFlame streak={stats.streak} />
                  <span style={styles.streakCount}>x{stats.streak}</span>
                </div>
                <div style={styles.streakHint}>{streakHint}</div>
              </div>
            )}

            {activePopup === 'workouts' && (
              <div style={styles.popup}>
                <div style={styles.popupSectionTitle}>ПОСЛЕДНИЕ ТРЕНИРОВКИ</div>
                {recentWorkouts.length === 0 ? (
                  <div style={styles.popupEmpty}>
                    Пока нет завершённых тренировок.<br />Заверши первую — она появится здесь.
                  </div>
                ) : (
                  <div style={styles.popupList}>
                    {recentWorkouts.map((w, idx) => (
                      <div key={idx} style={styles.popupRow}>
                        <span style={styles.popupLabel}>{programTitle(w.program_id)} · День {w.day}</span>
                        <span style={styles.popupDate}>{fmtWorkoutDate(w.finished_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={styles.popupDivider} />
                <div style={styles.popupRow}>
                  <span style={styles.popupLabel}>Всего тренировок</span>
                  <span style={{ ...styles.popupAmount, color: rank.color }}>{stats.totalWorkouts}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <style>{`
          @keyframes rankIconPopProfile {
            0%   { transform: scale(1); }
            40%  { transform: scale(1.22); }
            100% { transform: scale(1); }
          }
          @keyframes popupShowHide {
            0%   { opacity: 0; transform: translateY(-6px); }
            4%   { opacity: 1; transform: translateY(0); }
            96%  { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-4px); }
          }
        `}</style>
      </div>

      {/* Кнопка "Пригласить друга" */}
      <button
        onClick={handleInviteTap}
        style={styles.inviteButton}
        className="press-tile"
      >
        <UiIcon name="invite-friend" size={22} color="var(--color-primary)" style={styles.inviteIcon} />
        <div style={styles.inviteContent}>
          <div style={styles.inviteTitle}>Пригласить друга</div>
          <div style={styles.inviteSubtitle}>Качайтесь и соревнуйтесь вместе</div>
        </div>
        <span style={styles.inviteArrow}>›</span>
      </button>

      {/* Разделы — сгруппированы по смыслу, единая карточка на группу */}
      {sectionGroups.map((group, gIdx) => (
        <section key={group.title}>
          <div style={{ ...styles.groupTitle, marginTop: gIdx === 0 ? '0' : '20px' }}>
            {group.title}
          </div>

          <div style={styles.groupCard}>
            {group.items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                className="tg-row"
                style={{
                  ...styles.row,
                  borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)'
                }}
              >
                {item.icon.startsWith('ui:') ? (
                  <UiIcon
                    name={item.icon.slice(3)}
                    size={22}
                    color="var(--color-text)"
                    style={{ width: '32px', height: '22px' }}
                  />
                ) : (
                  <span style={styles.rowIcon}>{item.icon}</span>
                )}

                <div style={styles.rowContent}>
                  <div style={styles.rowTitle}>{item.title}</div>
                  <div style={styles.rowSubtitle}>{item.subtitle}</div>
                </div>

                <span style={styles.rowArrow}>›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const styles = {
  // paddingTop 0 — нейтрализуем верхний отступ .page, его даёт playerSticky
  // (как на главной). Лево/право/низ (16/16/24) остаются из класса .page.
  page: {
    paddingTop: 0
  },
  // Закреплённая шапка — копия playerSticky главной (Home.jsx)
  playerSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: 'var(--color-bg)',
    paddingTop: 'calc(var(--tg-safe-top) - 24px)',
    paddingBottom: '12px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '16px'
  },
  // Внутренний контейнер — аналог container в PlayerCard (gap между плашками)
  playerInner: {
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 0 4px',
    gap: '12px'
  },
  topPanel: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.015)',
    borderRadius: 'var(--radius-card)',
    position: 'relative'
  },
  avatarWrap: {
    width: '100px',
    height: '100px',
    flexShrink: 0,
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
    color: 'var(--color-primary)'
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

  // === Плашка с пилюлями (вместо XP-бара) ===
  pillsPanel: {
    position: 'relative',
    display: 'flex',
    gap: '8px',
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 'var(--radius-card)'
  },
  pill: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '8px 6px',
    // Тот же тёмный фон + обводка что у дорожки XP-бара на главной
    background: 'rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  pillValue: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '15px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    lineHeight: 1,
    whiteSpace: 'nowrap'
  },
  pillLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    fontWeight: 600
  },

  // === Попап над пилюлями (как у главной) ===
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
  popupList: {
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
  popupDate: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px',
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
  streakCount: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '22px',
    color: '#FFFFFF',
    letterSpacing: '1px',
    lineHeight: 1,
    textShadow: '0 0 6px rgba(255, 140, 66, 0.6)'
  },
  streakHint: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    fontWeight: 500
  },

  // Кнопка "Пригласить друга". marginTop 4 — отступ от sticky-шапки,
  // marginBottom 20 — нормальный отступ до первого заголовка раздела.
  inviteButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 20px',
    background: 'rgba(158, 209, 83, 0.08)',
    border: '1px solid rgba(158, 209, 83, 0.25)',
    borderRadius: 'var(--radius-small)',
    marginTop: '4px',
    marginBottom: '20px',
    minHeight: '64px',
    textAlign: 'left'
  },
  inviteIcon: {
    fontSize: '22px',
    width: '32px',
    textAlign: 'center',
    flexShrink: 0
  },
  inviteContent: {
    flex: 1,
    minWidth: 0
  },
  inviteTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--color-primary)',
    marginBottom: '2px'
  },
  inviteSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  inviteArrow: {
    fontSize: '18px',
    color: 'var(--color-primary)',
    flexShrink: 0,
    opacity: 0.7
  },

  // === Группы разделов (как РАЗДЕЛЫ на главной) ===
  groupTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '3px',
    marginBottom: '12px',
    paddingLeft: '4px'
  },
  groupCard: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 18px',
    width: '100%',
    minHeight: '64px',
    textAlign: 'left',
    background: 'transparent',
    border: 'none'
  },
  rowIcon: {
    fontSize: '22px',
    width: '32px',
    textAlign: 'center',
    flexShrink: 0
  },
  rowContent: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  rowSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  rowArrow: {
    fontSize: '18px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}