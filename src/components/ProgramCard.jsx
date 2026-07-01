import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, confirm } from '../lib/telegram'
import { getActiveDay, getActiveDaySync } from '../lib/storage'
import { getActiveWorkout, onActiveWorkoutChange, elapsedSecFrom, formatWorkoutMin, workoutTimerColor } from '../lib/active-workout'
import { loadWorkoutProgress } from '../utils/workout-progress'
import { getProgramDaySlots } from '../features/programs/registry'
import { localGet } from '../utils/storage'
import { CATEGORY_META } from '../features/programs/categories'
import { deleteMyProgram, shareProgramLink } from '../features/programs/customProgram'
import { formatRelative } from '../utils/history'
import FavCardBody from './FavCardBody'
import AnchorMenu from './AnchorMenu'
import UiIcon from './UiIcon'
import PixelHeart from './PixelHeart'

/**
 * Единая карточка программы — Главная / Избранное / Раздел.
 * Различия пропсами:
 *  - glow        — обводка раздела со свечением (только Главная). Иначе — та же
 *                  обводка-«нитка» без свечения.
 *  - dots        — «⋯» в правом верхнем углу → компактное меню программы
 *                  (избранное / редактировать / поделиться / удалить).
 *  - lastTrained — серая надпись «последняя тренировка N дней назад» (Главная).
 *  - isFav/onToggleFav — состояние и переключение избранного (только из меню).
 *  - onOpen      — тап по карточке (переход на тренировку), задаёт вызывающий.
 *  - onDeleted   — после удаления своей программы (обновить список).
 *
 * Сердечка на самой карточке нет — избранное только через «⋯».
 */
export default function ProgramCard({
  prog,
  isFav = false,
  onToggleFav,
  onOpen,
  onDeleted,
  glow = false,
  dots = false,
  lastTrained = false,
  bordered = true
}) {
  const navigate = useNavigate()
  // Старт из localStorage (мгновенно, без мигания серый→зелёный);
  // getActiveDay ниже догонит из Cloud, если на другом устройстве сменилось.
  const [activeDay, setActiveDay] = useState(() => getActiveDaySync(prog.slug))
  const [anchorRect, setAnchorRect] = useState(null) // null = меню закрыто
  const dotsRef = useRef(null)

  const available = prog.available !== false
  const accent = CATEGORY_META[prog.category]?.color || 'var(--color-primary)'

  useEffect(() => {
    if (!available) return
    let cancelled = false
    getActiveDay(prog.slug).then(d => { if (!cancelled) setActiveDay(d) })
    return () => { cancelled = true }
  }, [prog.slug, available])

  // Активная тренировка по этой программе → на карточке «Продолжить · N мин»,
  // тап ведёт сразу в активный день. Тикаем раз в 15с (минуты живые).
  const [active, setActive] = useState(getActiveWorkout)
  useEffect(() => onActiveWorkoutChange(() => setActive(getActiveWorkout())), [])
  const isActive = !!active && active.programId === prog.slug
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => forceTick(t => t + 1), 15000)
    return () => clearInterval(id)
  }, [isActive])
  // Прошедшее время + цвет по тем же порогам, что таймер дня (зелёный <1ч →
  // оранжевый 1–1:30 → красный ≥1:30). Красим только цифры; «Продолжить» — зелёный.
  const activeSec = isActive ? elapsedSecFrom(active.startedAt) : 0
  const activeMin = isActive ? formatWorkoutMin(activeSec) : null
  const activeTimeColor = isActive ? workoutTimerColor(activeSec) : null
  // Сколько упражнений уже отжато / всего в активном дне — для «Продолжить: 2/10».
  // Читаем из localStorage по месту сессии (свой набор у каждого места).
  const activeDone = isActive ? loadWorkoutProgress(active.programId, active.day, active.place).length : 0
  const activeTotal = isActive ? getProgramDaySlots(active.programId, active.day, active.place).length : 0

  const handleTap = () => {
    if (anchorRect || !available) return
    // Идёт активная тренировка по этой программе — сразу в активный день.
    if (isActive) {
      haptic.light()
      setTimeout(() => navigate(`/workout/${prog.slug}/${active.day}`, { state: lastTrained ? { fromHome: true } : null }), 80)
      return
    }
    // Главная передаёт свой onOpen (свайп-гард + state fromHome). Остальные —
    // дефолтная навигация на тренировку/заплыв.
    if (onOpen) { onOpen(); return }
    haptic.light()
    if (prog.kind === 'swim') {
      setTimeout(() => navigate(`/swim/${prog.slug}`), 80)
      return
    }
    const firstDay = prog.data?.days ? Object.keys(prog.data.days)[0] : 'A'
    setTimeout(() => navigate(`/workout/${prog.slug}/${activeDay || firstDay}`), 80)
  }

  const handleDotsTap = (e) => {
    e.stopPropagation()
    haptic.light()
    setAnchorRect(dotsRef.current?.getBoundingClientRect() || null)
  }
  const closeMenu = () => setAnchorRect(null)

  // Конструктор открывается push'ем; назад он делает navigate(-1) и сам вернёт
  // на эту же страницу (главная / избранное / раздел).
  const handleEdit = () => { haptic.light(); navigate('/constructor') }
  const handleShare = async () => { haptic.light(); await shareProgramLink(prog.dbId) }
  const handleDelete = async () => {
    const ok = await confirm('Удалить эту программу?')
    if (!ok) return
    haptic.medium()
    const success = await deleteMyProgram(prog.dbId)
    if (success && onDeleted) onDeleted()
  }

  const lastDate = lastTrained && available ? localGet(`program:${prog.slug}:last_day_date`) : null
  // Во время активной тренировки блока «последняя» нет — не резервируем под него
  // 96px справа, иначе строка «Продолжить N/M … время» не влезает и переносится.
  const padRight = (lastTrained && !isActive) ? 96 : dots ? 48 : 18

  const cardStyle = {
    ...styles.card,
    paddingRight: `${padRight}px`,
    opacity: available ? 1 : 0.55,
    cursor: available ? 'pointer' : 'default',
    // Цветная обводка-нитка — на главной и в избранном; в разделах (Category)
    // выключаем через bordered={false}.
    border: bordered ? `1px solid color-mix(in srgb, ${accent} 45%, transparent)` : 'none',
    ...(glow ? {
      boxShadow: `0 0 20px color-mix(in srgb, ${accent} 20%, transparent), inset 0 0 30px color-mix(in srgb, ${accent} 6%, transparent)`
    } : {})
  }

  return (
    <div
      onClick={handleTap}
      className={available ? 'press-tile' : ''}
      style={cardStyle}
    >
      <FavCardBody entry={{ prog, activeDay: isActive ? active.day : activeDay }} accent={accent} activeMin={activeMin} activeTimeColor={activeTimeColor} activeDone={activeDone} activeTotal={activeTotal} />

      {/* Бейдж «Продолжить» — когда по этой программе идёт тренировка. В левом
          верхнем углу (правый занят «⋯»), «прикреплён» к верхнему краю карточки. */}
      {isActive && available && (
        <span style={styles.continueBadge}>▶ Продолжить</span>
      )}

      {lastTrained && available && !isActive && (
        <div style={styles.lastTrained}>
          {lastDate ? (
            <>
              <span style={styles.ltLabel}>ПОСЛЕДНЯЯ</span>
              <span style={styles.ltValue}>{formatRelative(lastDate)}</span>
            </>
          ) : (
            <span style={styles.ltValue}>Ещё не начинали</span>
          )}
        </div>
      )}

      {dots && available && (
        <button ref={dotsRef} onClick={handleDotsTap} style={styles.dotsBtn} aria-label="Меню программы">⋯</button>
      )}

      {anchorRect && (
        <AnchorMenu
          anchorRect={anchorRect}
          onClose={closeMenu}
          items={[
            {
              key: 'fav',
              icon: <PixelHeart filled={isFav} size={20} />,
              label: isFav ? 'Убрать из избранного' : 'Добавить в избранное',
              haptic: 'medium',
              onClick: () => onToggleFav?.()
            },
            ...(prog.editable ? [
              { divider: true },
              { key: 'edit', icon: <UiIcon name="change" size={20} color="#3FA2F7" />, label: 'Редактировать', onClick: handleEdit },
              { key: 'share', icon: <UiIcon name="invite-friend" size={20} color="#9ED153" />, label: 'Поделиться', onClick: handleShare },
              { key: 'delete', icon: <TrashIcon />, label: 'Удалить', labelColor: '#E84545', onClick: handleDelete }
            ] : [])
          ]}
        />
      )}
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke="#E84545" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M4 5.5 H16" />
        <path d="M8 5.5 V4 H12 V5.5" />
        <path d="M5.5 5.5 L6.2 16 H13.8 L14.5 5.5" />
        <path d="M8.5 8.5 V13" />
        <path d="M11.5 8.5 V13" />
      </g>
    </svg>
  )
}

const styles = {
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 18px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '130px',
    textAlign: 'left'
  },
  continueBadge: {
    position: 'absolute',
    top: '-8px',
    left: '16px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    background: 'var(--color-primary)',
    color: '#0D0C0C',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '10px',
    letterSpacing: '0.5px',
    lineHeight: 1,
    borderRadius: 'var(--radius-pill)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    zIndex: 4
  },
  lastTrained: {
    position: 'absolute',
    top: '50%',
    right: '14px',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '3px',
    textAlign: 'right',
    maxWidth: '90px'
  },
  ltLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '9px',
    letterSpacing: '1.5px',
    color: 'rgba(255,255,255,0.32)'
  },
  ltValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    lineHeight: 1.25,
    color: 'var(--color-text-secondary)'
  },
  dotsBtn: {
    position: 'absolute',
    top: '8px',
    right: '12px',
    width: '34px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: '#9A9A9A',
    fontSize: '22px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '1px',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    zIndex: 2
  }
}
