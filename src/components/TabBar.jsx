import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'
import MuscleIcon from './MuscleIcon'
import { getMyFriendsPlace } from '../lib/leaderboard'
import { EVENTS, on } from '../lib/events'

/**
 * Таб-бар — 3 вкладки: Рейтинг / Тренировки / Профиль.
 *
 * Цвета:
 *  - Тренировки: иконка бицепса бежевая при активе, лейбл зелёный
 *  - Рейтинг: иконка кубка золотая при активе; #N серый при неактиве,
 *    зелёный при активе (наследует цвет лейбла — как «Тренировки»/«Профиль»)
 *  - Профиль: иконка БЕЛАЯ при активе, лейбл зелёный
 *
 * Не показывается на экранах тренировки (/workout/...), замены (/swap/...)
 * и инфо упражнения (/exercise/...).
 */
export default function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  const [muscleFlexTick, setMuscleFlexTick] = useState(0)
  const [profilePopTick, setProfilePopTick] = useState(0)
  const [ratingPopTick, setRatingPopTick] = useState(0)
  const [friendsPlace, setFriendsPlace] = useState(1)

  useEffect(() => {
    const load = () => { getMyFriendsPlace().then(setFriendsPlace) }
    load()
    const offReady = on(EVENTS.USER_READY, load)
    const offChanged = on(EVENTS.USER_CHANGED, load)
    return () => { offReady(); offChanged() }
  }, [])

  const isHiddenOnPath =
    location.pathname.startsWith('/workout') ||
    location.pathname.startsWith('/swap') ||
    location.pathname.startsWith('/exercise')

  if (isHiddenOnPath) return null

  const isWorkoutSection = location.pathname === '/' ||
                           location.pathname.startsWith('/category')

  const isExactHome = location.pathname === '/'

  const tabs = [
    {
      id: 'rating',
      path: '/leaderboard?tab=friends',
      label: 'Рейтинг',
      iconName: 'leaderboard',
      isActive: location.pathname === '/leaderboard',
      canTap: location.pathname !== '/leaderboard'
    },
    {
      id: 'workouts',
      path: '/',
      label: 'Тренировки',
      iconName: 'muscles',
      isActive: isWorkoutSection,
      canTap: !isExactHome
    },
    {
      id: 'profile',
      path: '/profile',
      label: 'Профиль',
      iconName: 'profile',
      isActive: location.pathname === '/profile',
      canTap: location.pathname !== '/profile'
    }
  ]

  const handleTap = (tab) => {
    haptic.light()
    if (tab.id === 'workouts') setMuscleFlexTick(t => t + 1)
    if (tab.id === 'profile') setProfilePopTick(t => t + 1)
    if (tab.id === 'rating') setRatingPopTick(t => t + 1)
    if (!tab.canTap) return
    navigate(tab.path)
  }

  return (
    <nav style={styles.tabbar}>
      <style>{`
        @keyframes tabIconPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.28); }
          100% { transform: scale(1); }
        }
      `}</style>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => handleTap(tab)}
          style={{
            ...styles.tab,
            background: tab.isActive
              ? 'rgba(158, 209, 83, 0.10)'
              : 'transparent',
            boxShadow: 'none',
            cursor: tab.canTap ? 'pointer' : 'default'
          }}
        >
          <span style={{
            ...styles.icon,
            opacity: tab.isActive ? 1 : 0.45
          }}>
            {tab.id === 'workouts' ? (
              <MuscleIcon
                size={32}
                color={tab.isActive ? '#FADFBE' : 'rgba(255,255,255,0.5)'}
                flexTrigger={tab.isActive ? muscleFlexTick : 0}
              />
            ) : tab.id === 'profile' ? (
              <span
                key={`profilepop-${profilePopTick}`}
                style={{
                  display: 'inline-flex',
                  transformOrigin: 'center center',
                  animation: (profilePopTick && tab.isActive) ? 'tabIconPop 0.4s ease-out' : 'none'
                }}
              >
                <UiIcon
                  name="profile"
                  size={32}
                  color={tab.isActive ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
                />
              </span>
            ) : tab.id === 'rating' ? (
              <span
                key={`ratingpop-${ratingPopTick}`}
                style={{
                  display: 'inline-flex',
                  transformOrigin: 'center center',
                  animation: (ratingPopTick && tab.isActive) ? 'tabIconPop 0.4s ease-out' : 'none'
                }}
              >
                <UiIcon
                  name="leaderboard"
                  size={32}
                  color={tab.isActive ? '#FFD700' : 'rgba(255,255,255,0.5)'}
                />
              </span>
            ) : tab.iconName ? (
              <UiIcon
                name={tab.iconName}
                size={32}
                color={tab.isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.5)'}
              />
            ) : (
              tab.icon
            )}
          </span>
          {tab.id === 'rating' ? (
            // #N — отдельный span БЕЗ styles.label. Серый (#888) при неактиве,
            // зелёный при активе. rgba(255,255,255,0.5) читался почти белым,
            // поэтому используем настоящий серый --color-text-secondary.
            <span style={{
              fontFamily: 'var(--font-tiny5)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap',
              transition: 'color 0.25s ease',
              color: tab.isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)'
            }}>
              #{friendsPlace}
            </span>
          ) : (
            <span style={{
              ...styles.label,
              color: tab.isActive ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.5)'
            }}>
              {tab.label}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

const styles = {
  tabbar: {
    position: 'fixed',
    bottom: 'var(--tabbar-bottom)',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px',
    height: 'var(--tabbar-height)',
    // iOS-стекло как в Telegram: сильный блюр + насыщенность, фон
    // полупрозрачный чтобы контент под баром размывался и просвечивал.
    background: 'rgba(28, 28, 30, 0.72)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    borderRadius: 'var(--radius-card)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    zIndex: 100
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '0 12px',
    minWidth: '78px',
    height: 'calc(var(--tabbar-height) - 12px)',
    borderRadius: 'var(--radius-card)',
    transition: 'background 0.25s ease, box-shadow 0.25s ease',
    border: 'none'
  },
  icon: {
    width: '32px',
    height: '32px',
    lineHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.25s ease'
  },
  label: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    transition: 'color 0.25s ease',
    whiteSpace: 'nowrap'
  }
}