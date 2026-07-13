import { formatRelative } from '../utils/history'
import StreakFlame from './StreakFlame'

/**
 * Карточка-шапка профиля (соц-концепция без статусов — см. память проекта).
 * Переиспользуется на странице Профиль и в модалке профиля друга.
 *
 * Больше НЕ показывает ранг / лигу / место / XP / рамку-ранг / мускулы.
 * Состав:
 *   [ АВАТАР ]  Имя
 *               Последняя тренировка — сегодня
 *   ─────────────────────────────
 *          ЭТА НЕДЕЛЯ
 *           🔥 x3
 *   [ bottomAction ]   ← напр. «Подстраховать» в модалке друга
 *
 * Пропсы: user, streak, lastWorkout, statsLoading, bottomAction.
 * (Лишние пропсы от старых вызовов безопасно игнорируются.)
 */
export default function ProfileHeader({
  user,
  streak = null,
  lastWorkout = null,
  statsLoading = false,
  bottomAction = null
}) {
  const displayName = user?.first_name || 'ATHLETE'

  // Всегда относительный формат ("Сегодня" / "2 дня назад" / "Очень давно").
  const lastWorkoutWhen = lastWorkout ? formatRelative(lastWorkout.finished_at) : null
  const lastWorkoutText = lastWorkoutWhen ? `Последняя тренировка — ${lastWorkoutWhen}` : null

  const s = streak || 0

  return (
    <div style={styles.card}>

      {/* Верх: аватар + имя + последняя тренировка. */}
      <div style={styles.topPanel}>
        <div style={styles.avatar}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={styles.avatarImg} draggable={false} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div style={styles.infoColumn}>
          <span style={styles.name}>{displayName}</span>
          <div style={styles.lastWorkout}>
            {statsLoading
              ? <span style={styles.skeletonLine} />
              : (lastWorkoutText || '')}
          </div>
        </div>
      </div>

      {/* Серия за эту неделю (тот же огонёк, что был в статистике). */}
      <div style={styles.weekPanel}>
        <span style={styles.weekLabel}>ЭТА НЕДЕЛЯ</span>
        <span style={styles.weekValue}>
          {statsLoading ? (
            <span style={styles.skeletonStat} />
          ) : (
            <>
              <StreakFlame streak={s} />
              <span style={{ ...styles.weekCount, color: s >= 1 ? '#FF8C42' : 'rgba(255, 255, 255, 0.4)' }}>x{s}</span>
            </>
          )}
        </span>
      </div>

      {/* Строка действия ВНУТРИ карточки (напр. «Подстраховать» в модалке друга). */}
      {bottomAction && (
        <div style={styles.bottomAction}>{bottomAction}</div>
      )}

      <style>{`
        @keyframes headerSkeletonPulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.9; }
        }
      `}</style>
    </div>
  )
}

const AVATAR_SIZE = 104

const styles = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '16px',
    padding: '14px 16px 16px',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    width: '100%'
  },
  bottomAction: {
    marginTop: '-6px',
    marginLeft: '-16px',
    marginRight: '-16px',
    marginBottom: '-16px',
    borderTop: '1px solid var(--border-hairline)'
  },
  topPanel: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px'
  },
  // Аватар — просто фото в скруглённом квадрате (без рамки ранга).
  avatar: {
    width: `${AVATAR_SIZE}px`,
    height: `${AVATAR_SIZE}px`,
    borderRadius: '29px',
    overflow: 'hidden',
    flexShrink: 0,
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '40px',
    color: 'var(--color-primary)'
  },
  infoColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--color-text)',
    lineHeight: 1.1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  lastWorkout: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    minHeight: '14px'
  },
  // Блок «эта неделя»: сверху линия-разделитель, по центру лейбл + огонёк.
  weekPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    paddingTop: '14px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)'
  },
  weekLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    fontWeight: 600
  },
  weekValue: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    minHeight: '32px'
  },
  weekCount: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '22px',
    letterSpacing: '1px',
    lineHeight: 1,
    textShadow: '0 0 6px rgba(255, 140, 66, 0.6)'
  },
  skeletonStat: {
    width: '48px',
    height: '24px',
    borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.10)',
    animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  },
  skeletonLine: {
    display: 'inline-block',
    width: '120px',
    height: '10px',
    borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.08)',
    animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  }
}
