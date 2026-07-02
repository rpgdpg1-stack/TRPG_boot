import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/telegram'
import { getLevelFromXP, getRankByLevel, getXPInCurrentLevel, getLevelProgress, getTotalXPProgress } from '../lib/levels'
import { getLeagueByRankIndex, formatLeaguePlace } from '../lib/leagues'
import { getProgramByDbId } from '../features/programs/registry'
import { formatRelative } from '../utils/history'
import RankIcon from './RankIcon'
import RanksPopup from './RanksPopup'
import XPBar from './XPBar'
import StreakFlame from './StreakFlame'
import MuscleIcon from './MuscleIcon'
import { spawnFireSparks } from './ParticlesBg'
import { rankIndexFromMuscles } from '../lib/frames'
import RankFrame from './RankFrame'

/**
 * Карточка-шапка профиля. Переиспользуется в двух местах:
 *  - на странице Профиль (interactive=true): капсулы тапаются → попапы,
 *    ранг тапается → список рангов, место ведёт в рейтинг
 *  - в модалке из Рейтинга/Лиги (interactive=false): только визуал, без попапов
 *
 * Макет:
 *   [ КРУПНЫЙ АВАТАР ]   ← по центру, рамка в цвет ранга (актив. рамка)
 *   Имя
 *   🏅 Атлет 2          🏆 #1
 *   Последняя тренировка — 12 мая
 *   [Мускулы] [Серия] [Тренировок]   ← капсулы радиусом 33
 *
 * Данные капсул:
 *   xp / streak / totalWorkouts. Если streak/totalWorkouts === null
 *   (нет данных о чужом юзере в рейтинге) — показываем «—».
 */

const SOURCE_LABELS = {
  workout:      'Тренировка',
  quest:        'Дневной буст',
  streak:       'Бонус за серию',
  backup:       'Подстраховка',
  backup_bonus: 'Поддержка друга',
  manual:       'Начисление'
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
}

function programTitle(dbId) {
  const p = getProgramByDbId(dbId)
  if (!p) return 'Тренировка'
  return p.title.charAt(0).toUpperCase() + p.title.slice(1).toLowerCase()
}

export default function ProfileHeader({
  user,
  xp = 0,
  streak = null,
  totalWorkouts = null,
  friendsPlace = 1,
  rankIndex = null,          // индекс лиги для бейджа места (если placeInLeague)
  placeInLeague = false,     // true → кубок + место/процент в цвет лиги
  totalInLeague = null,      // размер лиги для расчёта процента
  lastWorkout = null,        // { finished_at, program_id, day } | null
  recentHistory = [],
  recentWorkouts = [],
  interactive = false,
  statsLoading = false,      // true → показать скелетон вместо стрика/тренировок/посл. тренировки
  onPlaceTap = null
}) {
  const [showRanks, setShowRanks] = useState(false)
  const [rankPopTick, setRankPopTick] = useState(0)
  const [activePopup, setActivePopup] = useState(null) // 'muscles' | 'streak' | 'workouts' | null
  const [muscleFlexTick, setMuscleFlexTick] = useState(0)
  const pillsRef = useRef(null)

  const level = getLevelFromXP(xp)
  const rank = getRankByLevel(level)
  const displayName = user?.first_name || 'ATHLETE'

  // Бейдж места рядом с кубком. В режиме лиги — место/процент в цвет лиги,
  // иначе старое поведение (#место).
  const effRankIndex = rankIndex != null ? rankIndex : (level >= 31 ? 10 : Math.floor((level - 1) / 3))
  const placeColor = placeInLeague ? getLeagueByRankIndex(effRankIndex).color : 'var(--color-text)'
  const placeText = placeInLeague
    ? formatLeaguePlace(friendsPlace, totalInLeague)
    : `#${friendsPlace}`

  const { current, needed } = getXPInCurrentLevel(xp)
  const nextRank = getRankByLevel(level + 1)
  const remainingToNext = Math.max(0, needed - current)

  // Прогресс-бар (мускул + полоса) для попапа МУСКУЛЫ — как было у игрока на
  // главной: заполнение по уровню, цифры — общий прогресс.
  const xpBarProgress = getLevelProgress(xp)
  const { current: totalCurrent, needed: totalNeeded } = getTotalXPProgress(xp)

  // Индекс ранга для рамки аватара (8/9/10 — анимированные, 0–7 — полоска цвета).
  const avatarRankIndex = rankIndexFromMuscles(xp)

  // Попапы — только в интерактивном режиме. Автозакрытие 6с + тап вне плашки.
  useEffect(() => {
    if (!interactive || !activePopup) return
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
  }, [interactive, activePopup])

  const handleRankTap = () => {
    if (!interactive) return
    haptic.light()
    setRankPopTick(t => t + 1)
    setShowRanks(prev => !prev)
    setActivePopup(null)
  }

  const togglePopup = (which, e) => {
    if (!interactive) return
    haptic.light()
    if (which === 'muscles') setMuscleFlexTick(t => t + 1)
    if (which === 'streak' && (streak || 0) >= 3 && e?.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect()
      spawnFireSparks(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
    setShowRanks(false)
    setActivePopup(prev => (prev === which ? null : which))
  }

  const handlePlace = () => {
    if (onPlaceTap) onPlaceTap()
  }

  // Везде — только относительный формат ("Сегодня" / "2 дня назад" / "Очень давно").
  // Точную дату не показываем: она есть в Истории, тут лишняя.
  const lastWorkoutWhen = lastWorkout
    ? formatRelative(lastWorkout.finished_at)
    : null
  const lastWorkoutText = lastWorkoutWhen
    ? `Последняя тренировка — ${lastWorkoutWhen}`
    : null

  return (
    <div style={styles.card}>

      {/* Верх — компактно: аватар слева, инфо-колонка справа (имя, ранг+место,
          последняя тренировка). */}
      <div style={styles.topPanel}>

        {/* Аватар. Рамка по текущему рангу: 8/9/10 анимированные, 0–7 — полоска
            цвета ранга. Фото статично — пульсирует только свечение снаружи. */}
        <RankFrame
          rankIndex={avatarRankIndex}
          size={AVATAR_SIZE}
          radius={29}
          borderWidth={2.5}
          background="var(--color-bg)"
          glow
        >
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={styles.avatarImg} draggable={false} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </RankFrame>

        <div style={styles.infoColumn}>
          {/* Имя */}
          <span style={styles.name}>{displayName}</span>

          {/* Ранг слева, место справа */}
          <div style={styles.rankRow} data-rank-button-wrap>
            <button
              onClick={handleRankTap}
              style={{
                ...styles.rank,
                color: rank.color,
                cursor: interactive ? 'pointer' : 'default'
              }}
            >
              <span
                key={`rankpop-${rankPopTick}`}
                style={{ display: 'inline-flex', animation: rankPopTick ? 'rankIconPopHeader 0.4s ease-out' : 'none' }}
              >
                <RankIcon level={level} size={18} />
              </span>
              {rank.name} {rank.subLevel}
            </button>

            {onPlaceTap ? (
              <button onClick={handlePlace} style={styles.placeButton} aria-label="Открыть рейтинг">
                🏆 <span style={{ color: placeColor }}>{placeText}</span>
              </button>
            ) : (
              <span style={styles.placeStatic}>🏆 <span style={{ color: placeColor }}>{placeText}</span></span>
            )}

            {interactive && showRanks && (
              <RanksPopup currentLevel={level} onClose={() => setShowRanks(false)} />
            )}
          </div>

          {/* Последняя тренировка — серым. Контейнер всегда занимает место
              (минимальная высота), чтобы появление текста не сдвигало низ.
              При загрузке (statsLoading) — короткая пульсирующая полоска. */}
          <div style={styles.lastWorkout}>
            {statsLoading
              ? <span style={styles.skeletonLine} />
              : (lastWorkoutText || '')}
          </div>
        </div>
      </div>

      {/* Единый блок статистики: 3 ячейки с вертикальными разделителями,
          сверху отделён горизонтальной линией. Без отдельных пилюль. */}
      <div ref={pillsRef} style={styles.pills}>
        <button
          onClick={() => togglePopup('muscles')}
          style={{ ...styles.statCell, cursor: interactive ? 'pointer' : 'default' }}
        >
          <div style={{ ...styles.statValue, color: rank.color, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <MuscleIcon size={26} earned={true} flex={true} flexTrigger={muscleFlexTick} /> {xp}
          </div>
          <div style={styles.pillLabel}>МУСКУЛЫ</div>

          {/* Попап МУСКУЛЫ */}
          {interactive && activePopup === 'muscles' && (
            <div style={{ ...styles.popup, ...styles.popupAlignLeft, width: '290px', border: `1px solid ${rank.color}66` }} onClick={(e) => e.stopPropagation()}>
              {/* Полоса прогресса (мускул + бар) — в верхней части попапа */}
              <XPBar progress={xpBarProgress} color={rank.color} current={totalCurrent} needed={totalNeeded} animateIcon={false} />
              <div style={styles.popupDivider} />
              <div style={styles.popupTitle}>ПОСЛЕДНИЕ НАЧИСЛЕНИЯ</div>
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
        </button>

        <button
          onClick={() => togglePopup('workouts')}
          style={{ ...styles.statCell, cursor: interactive ? 'pointer' : 'default' }}
        >
          <div style={{ ...styles.statValue, color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            {statsLoading ? (
              <span style={styles.skeletonStat} />
            ) : (
              <>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>🏋️</span> {totalWorkouts ?? '—'}
              </>
            )}
          </div>
          <div style={styles.pillLabel}>ТРЕНИРОВОК</div>

          {/* Попап ТРЕНИРОВКИ — теперь средняя ячейка, попап по центру. */}
          {interactive && activePopup === 'workouts' && (
            <div style={{ ...styles.popup }} onClick={(e) => e.stopPropagation()}>
              <div style={styles.popupTitle}>ПОСЛЕДНИЕ ТРЕНИРОВКИ</div>
              {recentWorkouts.length === 0 ? (
                <div style={styles.popupEmpty}>
                  Пока нет завершённых тренировок.<br />Заверши первую — она появится здесь.
                </div>
              ) : (
                <div style={styles.popupList}>
                  {recentWorkouts.map((w, idx) => (
                    <div key={idx} style={styles.popupRow}>
                      <span style={styles.popupLabel}>{programTitle(w.program_id)} · День {w.day}</span>
                      <span style={styles.popupDate}>{fmtDate(w.finished_at)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={styles.popupDivider} />
              <div style={styles.popupRow}>
                <span style={styles.popupLabel}>Всего тренировок</span>
                <span style={{ ...styles.popupAmount, color: rank.color, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  {totalWorkouts ?? 0} <span style={{ fontSize: '16px', lineHeight: 1 }}>🏋️</span>
                </span>
              </div>
            </div>
          )}
        </button>

        <button
          onClick={(e) => togglePopup('streak', e)}
          style={{ ...styles.statCell, cursor: interactive ? 'pointer' : 'default' }}
        >
          <div style={styles.statFlameRow}>
            {statsLoading ? (
              <span style={styles.skeletonStat} />
            ) : (
              <>
                <StreakFlame streak={streak || 0} />
                <span style={{ ...styles.statCount, color: (streak || 0) >= 1 ? '#FF8C42' : 'rgba(255, 255, 255, 0.4)' }}>x{streak ?? 0}</span>
              </>
            )}
          </div>
          <div style={styles.pillLabel}>СЕРИЯ</div>

          {/* Попап СЕРИЯ — теперь крайняя правая ячейка, попап к правому краю. */}
          {interactive && activePopup === 'streak' && (
            <div
              style={{ ...styles.popup, ...styles.popupAlignRight, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', border: '1px solid rgba(255, 140, 66, 0.35)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={styles.popupTitle}>СЕРИЯ ТРЕНИРОВОК В НЕДЕЛЮ</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }}>
                <StreakFlame streak={streak || 0} />
                <span style={{ ...styles.streakCount, color: (streak || 0) >= 1 ? '#FF8C42' : 'rgba(255, 255, 255, 0.4)' }}>x{streak || 0}</span>
              </div>
              <div style={styles.popupHint}>Сброс серии каждую неделю</div>
            </div>
          )}
        </button>

      </div>

      <style>{`
        @keyframes rankIconPopHeader {
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
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 'var(--radius-card)',
    width: '100%'
  },
  // Верхняя панель: аватар слева, инфо-колонка справа.
  topPanel: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px'
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
  // Инфо-колонка справа от аватара.
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
  rankRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px'
  },
  rank: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '12px',
    letterSpacing: '1.5px',
    padding: '2px 0',
    background: 'transparent',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0
  },
  placeButton: {
    flexShrink: 0,
    padding: '3px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '1px',
    color: 'var(--color-text)',
    cursor: 'pointer',
    transition: 'background 0.2s ease, border-color 0.2s ease'
  },
  placeStatic: {
    flexShrink: 0,
    padding: '3px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '1px',
    color: 'var(--color-text)'
  },
  lastWorkout: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    minHeight: '14px'  // резерв под строку — текст не сдвигает низ при появлении
  },
  // Блок статистики: 3 ячейки в ряд, сверху линия-разделитель. Отступ от аватара
  // до линии — 16px (card gap), под линией — 14px.
  pills: {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    paddingTop: '14px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)'
  },
  // Ячейка статистики — без фона и обводки, прозрачная кнопка
  statCell: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '4px 6px',
    background: 'transparent',
    border: 'none',
    WebkitTapHighlightColor: 'transparent'
  },
  
  pillValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '15px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    lineHeight: 1,
    whiteSpace: 'nowrap'
  },
  // Крупная цифра в блоке статистики (мускулы/тренировки) — размер как у
  // счётчика стрика, чтобы все три ячейки были визуально на одной высоте.
  statValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '16px',
    letterSpacing: '0.5px',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    minHeight: '32px',
    display: 'inline-flex',
    alignItems: 'center'
  },
  // Ряд "огонёк + xN" в ячейке серии — как на главной
  statFlameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minHeight: '32px'
  },
  // Скелетон для одной цифры статистики (серия/тренировки) — пульсирующий
  // прямоугольник той же высоты что и statValue (32px), чтобы не было прыжка.
  skeletonStat: {
    width: '38px',
    height: '20px',
    borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.10)',
    animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  },
  // Скелетон для строки последней тренировки — узкая полоска.
  skeletonLine: {
    display: 'inline-block',
    width: '120px',
    height: '10px',
    borderRadius: 'var(--radius-small)',
    background: 'rgba(255, 255, 255, 0.08)',
    animation: 'headerSkeletonPulse 1.2s ease-in-out infinite'
  },
  statCount: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '16px',
    color: '#FFFFFF',
    letterSpacing: '1px',
    lineHeight: 1,
    textShadow: '0 0 4px rgba(0, 0, 0, 0.8)'
  },
  pillLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px',
    fontWeight: 600
  },
  // Попап под капсулами — узкий формат как на главной (огонь).
  // Ширину ограничиваем и центрируем относительно блока статистики,
  // чтобы все три (мускулы/серия/тренировки) выглядели одинаково.
  popup: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '50%',
    width: '230px',
    marginLeft: '-115px',
    maxWidth: 'calc(100vw - 48px)',
    background: 'rgba(34, 34, 34, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-medium)',
    padding: '12px 16px',
    zIndex: 50,
    animation: 'popupShowHide 6.4s ease-out forwards',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
  },
  // Прижать попап к левому краю своей ячейки (для крайней левой — мускулы),
  // чтобы он не уезжал за левый край карточки.
  popupAlignLeft: {
    left: 0,
    marginLeft: '-6px',
    transform: 'none'
  },
  // Прижать к правому краю своей ячейки (для крайней правой — тренировки).
  popupAlignRight: {
    left: 'auto',
    right: 0,
    marginLeft: 0,
    marginRight: '-6px',
    transform: 'none'
  },
  popupTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '8px',
    paddingLeft: '2px'
  },
  popupList: { display: 'flex', flexDirection: 'column', gap: '4px' },
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
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '1px',
    flexShrink: 0,
    whiteSpace: 'nowrap'
  },
  popupDate: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
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
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '22px',
    color: '#FFFFFF',
    letterSpacing: '1px',
    lineHeight: 1,
    textShadow: '0 0 6px rgba(255, 140, 66, 0.6)'
  },
  popupHint: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    fontWeight: 500
  }
}