import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/telegram'
import { formatRelative, workoutCategoryMeta } from '../utils/history'
import StreakFlame from './StreakFlame'
import UiIcon from './UiIcon'

/**
 * Карточка-шапка профиля (соц-концепция без статусов — см. память проекта).
 * Переиспользуется на странице Профиль и в модалке профиля друга.
 *
 * Состав (компактно):
 *   [ АВАТАР ]  Имя                          🔥 x2
 *               вчера · [значок вида]
 *   [ bottomAction? ]
 *
 * Огонёк 🔥 справа — серия за неделю: при 0 просто серый огонёк без цифры
 * (место под цифру зарезервировано), при ≥1 — огонёк + xN, размер/анимация
 * растут с сериями. Тап по огоньку → поп-ап с пояснением.
 *
 * Пропсы: user, streak, lastWorkout, statsLoading, bottomAction.
 */
export default function ProfileHeader({
  user,
  streak = null,
  lastWorkout = null,
  statsLoading = false,
  showLastWorkout = true,
  bottomAction = null
}) {
  const [showStreakInfo, setShowStreakInfo] = useState(false)
  const fireRef = useRef(null)

  const displayName = user?.first_name || 'ATHLETE'
  const s = streak || 0

  const lastWhen = lastWorkout ? formatRelative(lastWorkout.finished_at) : null
  const lastMeta = lastWorkout ? workoutCategoryMeta(lastWorkout) : null

  // Поп-ап серии: автозакрытие 6с + тап вне.
  useEffect(() => {
    if (!showStreakInfo) return
    const t = setTimeout(() => setShowStreakInfo(false), 6000)
    const onOutside = (e) => {
      if (fireRef.current?.contains(e.target)) return
      setShowStreakInfo(false)
    }
    document.addEventListener('pointerdown', onOutside)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', onOutside) }
  }, [showStreakInfo])

  const toggleStreak = () => { haptic.light(); setShowStreakInfo(v => !v) }

  return (
    <div style={styles.card}>
      <div style={styles.topPanel}>
        <div style={styles.avatar}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={styles.avatarImg} draggable={false} />
          ) : (
            <div style={styles.avatarPlaceholder}>{displayName.charAt(0).toUpperCase()}</div>
          )}
        </div>

        <div style={styles.infoColumn}>
          <span style={styles.name}>{displayName}</span>
          {showLastWorkout && (
            <div style={styles.lastRow}>
              {statsLoading ? (
                <span style={styles.skeletonLine} />
              ) : lastWhen ? (
                <>
                  <span style={styles.lastWhen}>{lastWhen}</span>
                  {lastMeta && (
                    <span style={styles.lastBadge}>
                      <UiIcon name={lastMeta.iconName} size={13} color={lastMeta.color} />
                    </span>
                  )}
                </>
              ) : (
                <span style={styles.lastWhen}>Ещё не тренировался</span>
              )}
            </div>
          )}
        </div>

        {/* Огонёк серии — справа, по центру строки. */}
        <div style={styles.fireWrap} ref={fireRef}>
          <button style={styles.fireBtn} onClick={toggleStreak} aria-label="Серия за неделю">
            {statsLoading ? (
              <span style={styles.skeletonStat} />
            ) : (
              <>
                <StreakFlame streak={s} />
                <span style={styles.fireCount}>{s >= 1 ? `x${s}` : ''}</span>
              </>
            )}
          </button>

          {showStreakInfo && (
            <div style={styles.popup} onClick={(e) => e.stopPropagation()}>
              <div style={styles.popupTitle}>СЕРИЯ ЗА НЕДЕЛЮ</div>
              <div style={styles.popupBody}>
                {s >= 1
                  ? `${s} ${plur(s)} на этой неделе. Тренируйся, чтобы серия росла — она сбрасывается каждую неделю.`
                  : 'На этой неделе ещё нет тренировок. Заверши тренировку — загорится огонёк серии.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {bottomAction && <div style={styles.bottomAction}>{bottomAction}</div>}

      <style>{`
        @keyframes headerSkeletonPulse { 0%,100%{opacity:0.4} 50%{opacity:0.9} }
      `}</style>
    </div>
  )
}

function plur(n) {
  const d = n % 10, dd = n % 100
  if (d === 1 && dd !== 11) return 'тренировка'
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return 'тренировки'
  return 'тренировок'
}

const AVATAR_SIZE = 104

const styles = {
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '16px',
    padding: '16px', background: 'var(--surface)',
    border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)', width: '100%'
  },
  bottomAction: {
    marginTop: '-6px', marginLeft: '-16px', marginRight: '-16px', marginBottom: '-16px',
    borderTop: '1px solid var(--border-hairline)'
  },
  topPanel: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' },
  avatar: {
    width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px`, borderRadius: '29px',
    overflow: 'hidden', flexShrink: 0, background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '40px', color: 'var(--color-primary)'
  },
  infoColumn: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  name: {
    fontFamily: 'var(--font-manrope)', fontSize: '22px', fontWeight: 700, color: 'var(--color-text)',
    lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0
  },
  lastRow: { display: 'flex', alignItems: 'center', gap: '7px', minHeight: '18px' },
  lastWhen: {
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', textTransform: 'capitalize'
  },
  lastBadge: { display: 'inline-flex', alignItems: 'center' },
  // Огонёк серии — справа, вертикально по центру строки.
  fireWrap: { position: 'relative', flexShrink: 0 },
  fireBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '3px',
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
    WebkitTapHighlightColor: 'transparent'
  },
  fireCount: {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', letterSpacing: '0.5px',
    lineHeight: 1, minWidth: '20px', textAlign: 'left', color: '#FF8C42',
    textShadow: '0 0 6px rgba(255, 140, 66, 0.5)'
  },
  popup: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '230px',
    background: 'rgba(34, 34, 34, 0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 140, 66, 0.35)', borderRadius: 'var(--radius-medium)',
    padding: '12px 14px', zIndex: 50, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
  },
  popupTitle: {
    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '11px',
    color: 'var(--color-text-secondary)', letterSpacing: '2px', marginBottom: '6px'
  },
  popupBody: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text)', lineHeight: 1.5 },
  skeletonStat: {
    width: '48px', height: '24px', borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.10)', animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  },
  skeletonLine: {
    display: 'inline-block', width: '110px', height: '10px', borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.08)', animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  }
}
