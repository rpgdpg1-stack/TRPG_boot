import { useRef, useState } from 'react'
import { haptic } from '../lib/telegram'
import { formatRelative } from '../utils/history'
import WeeklyMuscle from './WeeklyMuscle'
import StreakInfoPopup from './StreakInfoPopup'

/**
 * Карточка-шапка профиля (соц-концепция без статусов — см. память проекта).
 * Переиспользуется на странице Профиль и в модалке профиля друга.
 *
 * Состав (компактно):
 *   [ АВАТАР ]  Имя                          💪 2
 *               вчера · [значок вида]
 *   [ bottomAction? ]
 *
 * Бицепс справа — тренировки за неделю: при 0 просто серый значок без цифры
 * (место под цифру зарезервировано), при ≥1 — значок + число, размер/обводка
 * растут с числом тренировок. Тап по значку → поп-ап с пояснением.
 *
 * Пропсы: user, streak, lastWorkout, statsLoading, bottomAction.
 */
export default function ProfileHeader({
  user,
  streak = null,
  lastWorkout = null,
  // Тренируется прямо сейчас — заменяет строку «когда тренировался».
  isTraining = false,
  statsLoading = false,
  showLastWorkout = true,
  interactiveStreak = false,   // поп-ап серии по тапу — только в СВОЁМ профиле
  sections = [],               // доп. секции внутри карточки (статистика, любимые) с разделителем
  bottomAction = null
}) {
  const [showStreakInfo, setShowStreakInfo] = useState(false)
  const fireRef = useRef(null)

  const displayName = user?.first_name || 'ATHLETE'
  const s = streak || 0

  const lastWhen = lastWorkout ? formatRelative(lastWorkout.finished_at) : null

  const toggleStreak = () => {
    if (!interactiveStreak) return   // в профиле друга значок не тапается
    haptic.light()
    setShowStreakInfo(v => !v)
  }

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
              ) : (
                <span style={isTraining ? styles.trainingNow : styles.lastWhen}>
                  {isTraining ? 'Тренируется сейчас' : (lastWhen || 'Ещё не тренировался')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Огонёк серии — справа, по центру строки. Тапабелен только в своём профиле. */}
        <div style={styles.fireWrap} ref={fireRef}>
          <button
            style={{ ...styles.fireBtn, cursor: interactiveStreak ? 'pointer' : 'default' }}
            onClick={toggleStreak}
            aria-label="Тренировки на этой неделе"
          >
            {statsLoading ? (
              <span style={styles.skeletonStat} />
            ) : (
              <>
                <WeeklyMuscle count={s} size={22} />
                <span style={styles.fireCount}>{s >= 1 ? `${s}` : ''}</span>
              </>
            )}
          </button>

          {interactiveStreak && (
            <StreakInfoPopup
              streak={s}
              open={showStreakInfo}
              onClose={() => setShowStreakInfo(false)}
              anchorRef={fireRef}
            />
          )}
        </div>
      </div>

      {/* Доп. секции внутри карточки (статистика, любимые) — каждая с разделителем. */}
      {sections.map((node, i) => (
        <div key={i} style={styles.section}>{node}</div>
      ))}

      {bottomAction && <div style={styles.bottomAction}>{bottomAction}</div>}

      <style>{`
        @keyframes headerSkeletonPulse { 0%,100%{opacity:0.4} 50%{opacity:0.9} }
      `}</style>
    </div>
  )
}

const AVATAR_SIZE = 104

const styles = {
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0',
    padding: 'var(--space-4)', background: 'var(--surface)',
    borderRadius: 'var(--radius-card)', width: '100%'
  },
  // Доп. секция внутри карточки: разделитель НЕ до краёв (inset по паддингу карточки,
  // как принято для разграничителей), симметричные отступы сверху/снизу (16/16 —
  // paddingTop секции и paddingBottom карточки). Без negative-margin → линия не
  // упирается в края карточки.
  section: {
    marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--border-hairline)'
  },
  bottomAction: {
    marginLeft: '-16px', marginRight: '-16px', marginBottom: '-16px',
    borderTop: '1px solid var(--border-hairline)'
  },
  topPanel: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)' },
  avatar: {
    width: `${AVATAR_SIZE}px`, height: `${AVATAR_SIZE}px`, borderRadius: 'var(--radius-card)',
    overflow: 'hidden', flexShrink: 0, background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)'
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: {
    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-hero-size)', color: 'var(--color-primary)'
  },
  infoColumn: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-15)' },
  // lineHeight 1.3, а не 1.1: `overflow: hidden` нужен многоточию, но он режет
  // всё, что вышло за строку, — при 1.1 хвосты «p», «g», «у», «д» упирались
  // в край и обрезались («Rpgdpg» терял низ обеих g). Высота строки должна
  // вмещать выносные элементы, иначе многоточие оплачивается обрезкой букв.
  name: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-heading-size)', fontWeight: 700, color: 'var(--color-text)',
    lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0
  },
  lastRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: '18px' },
  lastWhen: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap'
  },
  // Тот же кегль и место, что у «3 дня назад», но акцентным цветом: карточка
  // друга не должна противоречить списку, из которого её открыли.
  trainingNow: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    color: 'var(--color-primary)'
  },
  // Огонёк серии: пространство справа от аватара делим пополам — имя в левой
  // половине, бицепс по ЦЕНТРУ правой (не прижат к краю карточки).
  fireWrap: { position: 'relative', flex: 1, display: 'flex', justifyContent: 'center' },
  fireBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
    background: 'transparent', border: 'none', cursor: 'pointer', padding: 'var(--space-1)',
    WebkitTapHighlightColor: 'transparent'
  },
  // 1:1 со строкой недели на главной: БЕЗ крестика, только цифра, display 800/17,
  // вплотную к значку. Ширину НЕ резервируем — с ростом недели значок крепнет,
  // цифра едет правее, и это нормально: пара всегда читается как одно целое.
  fireCount: {
    fontFamily: 'var(--font-manrope)', fontWeight: 800, fontSize: 'var(--text-title-size)', letterSpacing: '0.5px',
    lineHeight: 1, textAlign: 'left', color: 'var(--color-primary)'
  },
  skeletonStat: {
    width: '48px', height: '24px', borderRadius: 'var(--radius-small)',
    background: 'var(--layer-2)', animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  },
  skeletonLine: {
    display: 'inline-block', width: '110px', height: '10px', borderRadius: 'var(--radius-small)',
    background: 'var(--layer-2)', animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  }
}
