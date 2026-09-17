import UiIcon from './UiIcon'
import { usePress } from '../lib/use-press'

// Вниз быстро, вверх мягко — общий ритм нажатия (токены --press-in/--press-out).
const PRESS_IN = 'transform var(--press-in) var(--ease-ios), filter var(--press-in) ease'
const PRESS_OUT = 'transform var(--press-out) var(--ease-ios), filter var(--press-out) ease'

/**
 * Круглая кнопка запуска на карточке программы — ГЛАВНОЕ действие экрана.
 *
 * Отдельная кнопка, а не часть карточки: тап по ней открывает программу и
 * сразу начинает тренировку, тап мимо (по телу карточки) — просто открывает.
 * Поэтому у неё свой жест и своё нажатое состояние, а всплытие в карточку
 * заглушено.
 *
 * ЭФФЕКТ — общий паттерн «наверх»: кнопка растёт (--press-scale-up) и её
 * ЗАЛИВКА светлеет на 8% (--press-brightness). Белым поверх зелёного мазать
 * нельзя — выходит грязь, а вот сам зелёный светлеет чисто.
 *
 * ВАЖНО: scale живёт на САМОЙ кнопке, а позиционирование (translateY(-50%) и
 * т.п.) — на внешней обёртке. Держать оба transform на одном узле нельзя:
 * scale затирает смещение, и кнопка съезжает с вертикального центра.
 *
 * Палец ушёл за пределы кнопки — жест снимается (как у CloseCross), запуск не
 * происходит: случайный запуск тренировки дороже пропущенного тапа.
 */
export default function PlayButton({ onStart, size = 52, iconSize = 24, ariaLabel = 'Начать тренировку', label = null, height = 36 }) {
  // Жест общий (usePress): палец уехал больше чем на 8px — запуск снимается.
  // Случайный старт тренировки дороже пропущенного тапа.
  const { pressed: press, handlers } = usePress(() => onStart?.(), { stopPropagation: true })

  return (
    <button
      {...handlers}
      // Клик глушим: действие уже отработано на pointerUp, а всплытие открыло бы
      // программу вторым обработчиком (карточки).
      onClick={(e) => { e.stopPropagation(); e.preventDefault() }}
      aria-label={ariaLabel}
      style={label ? {
        // Пилюля с текстом («Продолжить ▶») — тот же жест/эффект, что у круглой.
        flexShrink: 0,
        height: `${height}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-1)',
        padding: '0 var(--space-3)',
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        background: 'var(--color-primary)',
        color: 'var(--accent-on)',
        fontFamily: 'var(--font-manrope)',
        fontSize: 'var(--text-button-size)',
        fontWeight: 'var(--text-button-weight)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        transform: press ? 'scale(var(--press-scale-up-lg))' : 'scale(1)',
        filter: press ? 'brightness(var(--press-brightness))' : 'none',
        transition: press ? PRESS_IN : PRESS_OUT
      } : {
        flexShrink: 0,
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: 'none',
        padding: 0,
        background: 'var(--color-primary)',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        transform: press ? 'scale(var(--press-scale-up))' : 'scale(1)',
        filter: press ? 'brightness(var(--press-brightness))' : 'none',
        transition: press ? PRESS_IN : PRESS_OUT
      }}
    >
      {label ? (
        <>
          {label}
          <span style={{ display: 'inline-flex', color: 'var(--accent-on)' }}><PlayGlyph size={18} /></span>
        </>
      ) : (
        // Оптический центр: треугольник тяжелее слева, сдвигаем на 2px вправо.
        <span style={{ display: 'inline-flex', color: 'var(--accent-on)', marginLeft: 'var(--space-05)' }}>
          <PlayGlyph size={iconSize} />
        </span>
      )}
    </button>
  )
}

/**
 * Треугольник со скруглёнными углами. Скругление даёт не радиус в path, а
 * обводка тем же цветом с round-стыками поверх заливки — так угол мягкий при
 * любом размере, без пересчёта кривых.
 */
export function PlayGlyph({ size = 21 }) {
  return <UiIcon name="play" size={size} />
}
