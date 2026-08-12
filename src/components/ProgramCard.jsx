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
import PinIcon from './PinIcon'
import PencilIcon from './PencilIcon'
import PlayButton from './PlayButton'

// Долгое нажатие по карточке программы — те же пороги, что у карточки упражнения.
const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 8

/**
 * Единая карточка программы — Главная / Избранное / Раздел.
 * Различия пропсами:
 *  - menu        — долгое нажатие по карточке → меню программы по центру под ней
 *                  (закрепить / редактировать / поделиться / удалить).
 *  - lastTrained — серая надпись «последняя тренировка N дней назад» (Главная).
 *  - isFav/onToggleFav — состояние и переключение избранного (только из меню).
 *  - onOpen      — тап по карточке (переход на тренировку), задаёт вызывающий.
 *  - onDeleted   — после удаления своей программы (обновить список).
 *
 * Ни сердечка, ни «⋯» на карточке нет — все действия живут в меню долгого нажатия.
 */
export default function ProgramCard({
  prog,
  isFav = false,
  onToggleFav,
  onOpen,
  onDeleted,
  menu = false,
  press = true,
  lastTrained = false,
  bordered = true,
  cta = false,
  footer = null,
  background = 'var(--color-card)'
}) {
  const navigate = useNavigate()
  // Старт из localStorage (мгновенно, без мигания серый→зелёный);
  // getActiveDay ниже догонит из Cloud, если на другом устройстве сменилось.
  const [activeDay, setActiveDay] = useState(() => getActiveDaySync(prog.slug))
  const [anchorRect, setAnchorRect] = useState(null) // null = меню закрыто
  const cardRef = useRef(null)

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

  // Тап по кружку Play — «открыть И сразу начать»: день откроется уже запущенным,
  // второй раз жать «Начать» внизу не нужно. Признак autoStart читает сам экран дня
  // (WorkoutDay/SwimWorkout) и играет там штатную анимацию старта.
  // Если тренировка уже идёт — просто уводим в активный день, повторный старт
  // не нужен (и был бы сбросом прогресса).
  const handlePlay = () => {
    if (anchorRect || !available) return
    haptic.medium()
    const fromHome = !!onOpen
    if (prog.kind === 'swim') {
      navigate(`/swim/${prog.slug}`, { state: { autoStart: !isActive, fromHome } })
      return
    }
    const firstDay = prog.data?.days ? Object.keys(prog.data.days)[0] : 'A'
    const targetDay = isActive ? active.day : (activeDay || firstDay)
    navigate(`/workout/${prog.slug}/${targetDay}`, { state: { fromHome, autoStart: !isActive } })
  }

  const handleTap = () => {
    if (anchorRect || !available) return
    // Только что сработало долгое нажатие — это не тап, никуда не идём.
    if (longFired.current) { longFired.current = false; return }
    // Идёт активная тренировка по этой программе — сразу в активный день.
    // У заплыва свой маршрут (/swim/:slug): дня A/B/C у него нет, и «/workout/swim/main»
    // роняло экран — WorkoutDay не находил такой день.
    if (isActive) {
      haptic.light()
      // fromHome — только если вход с главной (она передаёт onOpen). Иначе «Назад»
      // ушла бы в раздел (силовую), даже когда зашли с главной по активной карточке.
      const state = onOpen ? { fromHome: true } : null
      const path = prog.kind === 'swim' ? `/swim/${prog.slug}` : `/workout/${prog.slug}/${active.day}`
      setTimeout(() => navigate(path, { state }), 80)
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

  // Долгое нажатие по карточке → меню (как long-press по упражнению в дне):
  // подержал 500мс не двигая палец — открылось; повёл (скролл) — отменилось.
  const longTimer = useRef(null)
  const longFired = useRef(false)
  const pressStart = useRef({ x: 0, y: 0 })

  const clearLong = () => {
    if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null }
  }

  const handlePointerDown = (e) => {
    if (!menu || !available || anchorRect) return
    longFired.current = false
    pressStart.current = { x: e.clientX, y: e.clientY }
    clearLong()
    longTimer.current = setTimeout(() => {
      longFired.current = true
      haptic.medium()
      setAnchorRect(cardRef.current?.getBoundingClientRect() || null)
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e) => {
    if (!longTimer.current) return
    if (Math.abs(e.clientX - pressStart.current.x) > MOVE_TOLERANCE_PX ||
        Math.abs(e.clientY - pressStart.current.y) > MOVE_TOLERANCE_PX) clearLong()
  }

  useEffect(() => clearLong, [])

  // Закрытие сбрасывает флаг long-press: клик от отпускания пальца гасится проверкой
  // anchorRect, поэтому сам флаг снимаем здесь — иначе следующий тап был бы съеден.
  const closeMenu = () => { longFired.current = false; setAnchorRect(null) }

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

  // Правый блок (по центру по высоте, справа): активна → зелёный тег «▶ Продолжить»;
  // иначе на главной → «Последняя · N». Время/N/M — в строке с буквой (FavCardBody).
  const lastDate = lastTrained && available ? localGet(`program:${prog.slug}:last_day_date`) : null
  // cta — залитая пилюля «Начать [день] ▶» / «Продолжить ▶» справа (карточка главной).
  const showCta = cta && available
  const showRight = available && (showCta || isActive || (lastTrained && lastDate))
  // Не начата — круглая кнопка с плеем (слово «Начать» лишнее, треугольник и так
  // читается); идёт тренировка — пилюля с текстом «Продолжить».
  const padRight = showCta ? (isActive ? 128 : 72) : showRight ? 96 : 16

  // Прогресс активной тренировки — заливкой ВСЕЙ карточки (как в шапке дня).
  const fillPct = isActive && activeTotal > 0 ? Math.min(100, (activeDone / activeTotal) * 100) : 0

  // При активной тренировке footer («Сегодня») скрываем — рядом с живым таймером
  // и прогрессом он не несёт информации.
  const showFooter = !!footer && available && !isActive

  const cardStyle = {
    ...styles.card,
    background,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
    minHeight: showFooter ? '124px' : styles.card.minHeight,
    opacity: available ? 1 : 0.55,
    cursor: available ? 'pointer' : 'default',
    // overflow hidden — клип заливки-прогресса по скруглению.
    overflow: 'hidden',
    // Цветная обводка-нитка в цвет раздела — на главной и в избранном; в разделах
    // (Category) выключаем через bordered={false}. Насыщенность приглушена (45%→24%→20%),
    // чтобы рамка не перетягивала внимание с названия программы.
    border: bordered ? `1px solid color-mix(in srgb, ${accent} 20%, transparent)` : 'none'
  }

  return (
    <div
      ref={cardRef}
      onClick={handleTap}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearLong}
      onPointerLeave={clearLong}
      onPointerCancel={clearLong}
      className={available && press ? 'press-dim' : ''}
      style={cardStyle}
    >
      {/* Заливка-прогресс: светло-серый фон растёт по мере отжатых упражнений. */}
      {isActive && available && (
        <div style={{ ...styles.cardFill, width: `${fillPct}%` }} aria-hidden="true" />
      )}

      {/* Верхний ряд карточки: эмблема + контент + CTA/правый блок (позиционируются
          относительно этого ряда, чтобы footer не сдвигал их по вертикали). */}
      <div style={{ ...styles.cardRow, paddingRight: `${padRight}px`, flex: 1 }}>
        <FavCardBody
          entry={{ prog, activeDay: isActive ? active.day : activeDay }}
          activeMin={activeMin}
          activeTimeColor={activeTimeColor}
          activeDone={activeDone}
          activeTotal={activeTotal}
          footer={showFooter ? footer : null}
        />

        {/* Пилюля-действие «Начать ▶» / «Продолжить ▶» — фирменная зелёная заливка +
            белый текст/плей, единая во всех разделах (цвет раздела — на иконке/данных). */}
        {showCta && (
          // Обёртка позиционирует (translateY), кнопка внутри масштабируется —
          // два transform на одном узле затирали бы друг друга. Активна → пилюля
          // «Продолжить ▶» (тот же жест/scale), иначе — круглый плей «Начать».
          <span style={styles.ctaCircle}>
            <PlayButton onStart={handlePlay} label={isActive ? 'Продолжить' : null} height={36} />
          </span>
        )}

        {/* Правый блок — по центру по высоте ряда, справа. */}
        {!showCta && showRight && (
          <div style={{ ...styles.rightBlock, right: 0 }}>
            {isActive ? (
              <span style={styles.continuePlay}><PlayIcon size={28} /></span>
            ) : (
              <>
                <span style={styles.ltLabel}>Последняя</span>
                <span style={styles.ltValue}>{formatRelative(lastDate)}</span>
              </>
            )}
          </div>
        )}
      </div>

      {anchorRect && (
        <AnchorMenu
          anchorRect={anchorRect}
          onClose={closeMenu}
          align="left"
          gap={3}
          motion="drop"
          items={[
            {
              key: 'fav',
              icon: <PinIcon filled={isFav} size={20} />,
              label: isFav ? 'Открепить' : 'Закрепить',
              haptic: 'medium',
              onClick: () => onToggleFav?.()
            },
            ...(prog.editable ? [
              { divider: true },
              { key: 'edit', icon: <PencilIcon size={20} color="var(--cat-cardio)" />, label: 'Редактировать', onClick: handleEdit },
              { key: 'share', icon: <UiIcon name="invite-friend" size={20} color="var(--color-primary)" />, label: 'Поделиться', onClick: handleShare },
              { key: 'delete', icon: <TrashIcon />, label: 'Удалить', labelColor: 'var(--color-error)', onClick: handleDelete }
            ] : [])
          ]}
        />
      )}
    </div>
  )
}

// Плей-треугольник со скруглёнными углами (fill + round join), currentColor.
function PlayIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M8 5.6 L18 12 L8 18.4 Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke="var(--color-error)" strokeWidth="1.6" strokeLinecap="round" fill="none">
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
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    // Ниже прежних 130 — убрали строку тега места/бассейна, карточка компактнее.
    minHeight: '106px',
    textAlign: 'left'
  },
  // Верхний ряд карточки (эмблема + контент + CTA). Позиционный контекст для CTA.
  cardRow: { position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', width: '100%' },
  // Заливка-прогресс активной тренировки — за контентом (zIndex 0), клип overflow.
  cardFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    background: 'var(--layer-2)',
    transition: 'width 0.55s cubic-bezier(0.32, 0.72, 0, 1)',
    pointerEvents: 'none',
    zIndex: 0
  },
  // Тёмная пилюля-подсказка (iOS): фон на уровень светлее карточки (surface-raised),
  // белый текст+плей, без градиента/тени/свечения/обводки.
  ctaPill: {
    position: 'absolute',
    top: '50%',
    // Отступ до правого края = горизонтальному паддингу карточки (18px), чтобы
    // справа было столько же воздуха, сколько слева от эмблемы до края.
    right: '16px',
    transform: 'translateY(-50%)',
    zIndex: 2,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-15)',
    padding: 'var(--space-2) var(--space-3)',
    // Отделяется заливкой (на ~7% светлее карточки), без рамки.
    background: 'var(--surface-pinned)',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-body-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none'
  },
  // «Начать» — круглая акцентная кнопка с плеем (без слова). Плей чуть правее
  // центра: у треугольника оптический центр смещён влево.
  // Только позиционирование кружка Play по вертикальному центру ряда; размер,
  // заливка и нажатое состояние — внутри PlayButton (свой жест, отдельный от
  // тапа по карточке).
  ctaCircle: {
    position: 'absolute',
    // right:0 внутри cardRow (padding карточки 16) = 16 от края, как эмблема слева.
    top: '50%', right: 0,
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    zIndex: 2
  },
  // Правый блок — по центру по высоте карточки, справа, две строки, выравнивание по правому краю.
  rightBlock: {
    position: 'absolute',
    top: '50%',
    right: 0,
    transform: 'translateY(-50%)',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 'var(--space-1)',
    textAlign: 'right',
    maxWidth: '84px',
    pointerEvents: 'none'
  },
  // «Продолжить» — просто зелёный плей-треугольник (что тренировка запущена).
  continuePlay: {
    display: 'inline-flex',
    color: 'var(--color-primary)',
    filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--color-primary) 35%, transparent))'
  },
  ltLabel: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-caption-size)', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.32)' },
  ltValue: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-label-size)', lineHeight: 1.25, color: 'var(--color-text-secondary)' }
}
