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

/**
 * Главный блок персонажа на Главной.
 *
 * Макет:
 *   [АВАТАР 100x100 квадрат]   Имя @ник
 *                              Ранг (цветной)
 *                              [💪 XP-бар  🔥 x2]
 *
 * Аватарка теперь квадратная (border-radius 33px как у карточек),
 * рамка красится в цвет текущего ранга — визуально подчёркивает уровень.
 *
 * Серия переехала в один ряд с XP-баром: огонёк + пиксельная цифра x{N}.
 * Размер огонька растёт со стриком — x0 серый, дальше всё ярче и больше.
 * Никаких "СЕРИЯ:" и пояснений снаружи — компактно и читаемо.
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

  // Стартуем сразу из текущего юзера (он уже авторизован к моменту главной),
  // чтобы рамка ранга не моргала дефолтным зелёным Новичком пока грузится XP.
  const [user, setUser] = useState(() => getUser())
  const [xp, setXP] = useState(() => getCurrentUser()?.total_muscles || 0)
  const [weeklyStreak, setWeeklyStreak] = useState(0)
  const [recentHistory, setRecentHistory] = useState([])
  const [showXPDetails, setShowXPDetails] = useState(false)
  const [showRanks, setShowRanks] = useState(false)
  const [friendsPlace, setFriendsPlace] = useState(1)

  // Состояние попапа над огоньком стрика. Логика повторных тапов:
  //  - первый тап на огонёк → показываем попап (showStreakPopup=true)
  //  - последующие тапы пока попап виден → не трогаем его, играем только
  //    искорки/пульс. Юзер видит "ага, тап засчитан, но попап тот же".
  //  - попап сам исчезает после streakAutoCloseTimer (CSS-анимация 6с)
  //  - после исчезновения следующий тап снова покажет
  // Без этого попап моргал бы при частых тапах: появился-исчез-появился.
  const [showStreakPopup, setShowStreakPopup] = useState(false)

  // Счётчик для триггера "сжатия" бицепса в XP-баре при тапе на прогресс-бар.
  const [muscleFlexTick, setMuscleFlexTick] = useState(0)

  // Тик для "pop"-анимации иконки ранга при тапе по рангу.
  const [rankPopTick, setRankPopTick] = useState(0)

  const xpButtonRef = useRef(null)
  const xpPopupRef = useRef(null)
  const rankButtonRef = useRef(null)
  const streakButtonRef = useRef(null)
  const streakPopupRef = useRef(null)
  const xpAutoCloseTimer = useRef(null)
  const streakAutoCloseTimer = useRef(null)

  useEffect(() => {
    setUser(getUser())

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

  // Автозакрытие попапа стрика через 6 секунд. Тайминг такой же как у XP-попапа
  // — для визуальной консистентности интерфейса.
  useEffect(() => {
    if (showStreakPopup) {
      streakAutoCloseTimer.current = setTimeout(() => setShowStreakPopup(false), 6000)
    }
    return () => { if (streakAutoCloseTimer.current) clearTimeout(streakAutoCloseTimer.current) }
  }, [showStreakPopup])

  // Закрытие попапа стрика при клике вне. Слушатель ставим только когда попап
  // открыт — чтобы не висеть подписанным постоянно.
  // Клик по самому огоньку (streakButtonRef) пропускаем — он сам решит
  // что делать в handleStreakTap (играть только искорки, попап не трогать).
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
    setMuscleFlexTick(t => t + 1) // бицепс "сжимается" на тап
    setShowXPDetails(prev => !prev)
    setShowRanks(false)
  }

  const handleRankTap = () => {
    haptic.light()
    setRankPopTick(t => t + 1) // лёгкий "pop" иконки ранга
    setShowRanks(prev => !prev)
    setShowXPDetails(false)
  }

  // Тап по месту 🏆 #N — открыть страницу рейтинга на табе "Друзья"
  const handlePlaceTap = () => {
    haptic.light()
    navigate('/leaderboard?tab=friends')
  }

  // Тап по огоньку: haptic + искорки если стрик 3+ + попап.
  // Попап показываем ТОЛЬКО если он сейчас не отображается. Если уже виден —
  // юзер видит свои тапы через искорки/пульс, но попап не перезапускается
  // (иначе моргал бы при частых тапах). Когда дослужит свои 6 секунд и
  // исчезнет — следующий тап его снова покажет.
  const handleStreakTap = (e) => {
    haptic.light()
    if (weeklyStreak >= 3) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      spawnFireSparks(x, y)
    }
    // Открываем попап только если он сейчас не открыт.
    // Закрываем другие попапы чтобы не накладывались.
    if (!showStreakPopup) {
      setShowStreakPopup(true)
      setShowXPDetails(false)
      setShowRanks(false)
    }
  }

  return (
    <div style={styles.container}>

      {/* Верхняя плашка: аватар + имя/ранг/рейтинг, полупрозрачный фон,
          скругления, без обводки. Контент по центру относительно аватара. */}
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

      {/* Нижний ряд: XP-бар на всю ширину + огонёк-стрик справа */}
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

            {/* Попап со сводкой по стрику. Появляется при тапе на огонёк,
                автоматически закрывается через ~6с (CSS-анимация popupShowHide).
                Позиционирован абсолютно от bottomRow — снизу под огоньком. */}
            {showStreakPopup && (
              <div ref={streakPopupRef} style={styles.streakPopup}>
                <div style={styles.streakPopupTitle}>СЕРИЯ ТРЕНИРОВОК В НЕДЕЛЮ</div>
                <div style={styles.streakPopupRow}>
                  <StreakFlame streak={weeklyStreak} />
                  <span style={styles.streakPopupCount}>x{weeklyStreak}</span>
                </div>
                <div style={styles.streakPopupHint}>
                  {weeklyStreak === 0
                    ? 'Заверши тренировку чтобы зажечь огонёк'
                    : weeklyStreak < 4
                      ? `${4 - weeklyStreak} до максимума недели`
                      : 'Максимум этой недели'}
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
        @keyframes flameIdleFlicker {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
        @keyframes rankIconPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.22); }
          100% { transform: scale(1); }
        }
        @keyframes flameSparkRise {
          0%   { opacity: 0; transform: translate(-50%, 0) scale(0.6); }
          20%  { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--sx, 0px)), var(--sy, -14px)) scale(0.4); }
        }
      `}</style>
    </div>
  )
}

/**
 * Огонёк серии с динамическим размером и поведением:
 *  - x0: серый контур, маленький, без анимаций
 *  - x1: загорается (полноцветный), маленький
 *  - x2: средний
 *  - x3: больше + лёгкое мерцание + редкие искорки
 *  - x4+: максимальный размер + постоянные искорки
 *
 * Размеры подобраны так, чтобы даже на x4 огонёк не ломал высоту строки
 * с XP-баром (XPBar внутри ~28px высотой).
 */
function StreakFlame({ streak }) {
  // Размер svg иконки по стрику. На x0 минимум, дальше растёт ступенями.
  const size = streak >= 4 ? 32
             : streak >= 3 ? 28
             : streak >= 2 ? 24
             : streak >= 1 ? 22
             : 20

  const lit = streak >= 1
  const animated = streak >= 3       // мерцание
  const showSparks = streak >= 3     // искорки (одна на x3, две на x4+)

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
      {lit ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            filter: 'drop-shadow(0 0 4px rgba(255, 140, 66, 0.6))',
            animation: animated ? 'flameIdleFlicker 1.4s ease-in-out infinite' : 'none',
            transformOrigin: 'center bottom'
          }}
        >
          <defs>
            <linearGradient id="flameGradHeader" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="50%" stopColor="#FF8C42" />
              <stop offset="100%" stopColor="#E84545" />
            </linearGradient>
          </defs>
          <path
            d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z"
            fill="url(#flameGradHeader)"
          />
        </svg>
      ) : (
        // x0: серый контур, никаких анимаций
        <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z"
            fill="none"
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth="1.5"
          />
        </svg>
      )}

      {/* Постоянные искорки над огоньком. Используем CSS-переменные --sx/--sy
          чтобы каждая искра летела по своей траектории. */}
      {showSparks && (
        <>
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: 3,
              height: 3,
              background: '#FFD700',
              boxShadow: '0 0 4px #FFD700',
              borderRadius: 1,
              pointerEvents: 'none',
              '--sx': '-3px',
              '--sy': '-16px',
              animation: 'flameSparkRise 1.6s ease-out infinite'
            }}
          />
          {streak >= 4 && (
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                width: 2,
                height: 2,
                background: '#FF8C42',
                boxShadow: '0 0 3px #FF8C42',
                borderRadius: 1,
                pointerEvents: 'none',
                '--sx': '4px',
                '--sy': '-14px',
                animation: 'flameSparkRise 1.4s ease-out 0.6s infinite'
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 4px 4px',
    position: 'relative',
    gap: '12px'
  },
  // Верхняя плашка: полупрозрачный фон, скругления, без обводки.
  // Чуть прозрачнее чем карточка дейли-квеста.
  topPanel: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.015)',
    borderRadius: 'var(--radius-card)'
  },
  // Плашка нижнего ряда (XP + стрик) — как верхняя плашка, фон чуть светлее
  // (ближе к карточке дейли-буста), скругления, без обводки.
  bottomRowWrap: {
    position: 'relative',
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 'var(--radius-card)'
  },
  // Аватар-обёртка (кнопка)
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
  // Внутренний контейнер аватара: КВАДРАТ с радиусом 33px (как карточки).
  // Рамка крашется в цвет ранга — стиль borderColor приходит из JSX.
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: '33px',
    overflow: 'hidden',
    background: 'var(--color-card)',
    border: '2px solid',  // цвет задаётся динамически из JSX через rank.color
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
  // Место среди друзей — отдельная кнопка справа от ранга,
  // тап ведёт на /leaderboard. Не на отдельной строке, а в одну
  // с рангом — чтобы занять минимум места и быть рядом с рангом-родителем.
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
  // Ряд: XP-бар занимает всё, огонёк + цифра справа. На всю ширину.
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
  // Кнопка-обёртка огонька со счётчиком. Без фона, без рамки.
  // Высота примерно соответствует XP-бару (~28px) — на x0/x1/x2 огонёк
  // помещается ровно; на x3/x4 чуть выступает вверх, но overflow visible
  // оставляем — огонёк и должен "торчать", это часть характера.
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
  // Пиксельный счётчик стрика — стиль "x0", "x1", ...
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
  // Попап стрика. Позиционирован абсолютно справа под огоньком — там же где
  // живёт кнопка-стрик внутри bottomRow. Использует ту же CSS-анимацию
  // popupShowHide что и XP-попап (6.4с: появление 4% времени → пауза → угасание),
  // чтобы внешний и внутренний таймаут совпадали и юзер не успевал тапать в
  // "невидимый" попап.
  streakPopup: {
    position: 'absolute',
    // Правый край — там же где сам огонёк. Сдвигаемся под него.
    right: 0,
    // Выравниваем с XP-попапом. bottomRow выше xpBlock (из-за крупного
    // огонька), поэтому считаем top не от 100% ряда, а от центра + половина
    // высоты XP-бара (20px) + 8px зазор = центр ряда + 18px.
    top: 'calc(50% + 18px)',
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
  // Ряд с огоньком и крупной цифрой "x3". Огонёк рендерим заново через
  // <StreakFlame /> чтобы получить ту же графику с искорками — у юзера
  // не должно быть ощущения что это что-то отдельное от его огонька наверху.
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