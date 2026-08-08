import { useRef, useState } from 'react'

// Порог «это уже свайп, а не тап» — тот же, что у долгого нажатия по карточкам.
const MOVE_TOLERANCE_PX = 8

/**
 * Круглая кнопка запуска на карточке программы — ГЛАВНОЕ действие экрана.
 *
 * Отдельная кнопка, а не часть карточки: тап по ней открывает программу и
 * сразу начинает тренировку, тап мимо (по телу карточки) — просто открывает.
 * Поэтому у неё свой жест и своё нажатое состояние, а всплытие в карточку
 * заглушено.
 *
 * ЭФФЕКТ — только увеличение (scale), БЕЗ подсветки цветом. У CloseCross пузырь
 * тёмно-серый, и высветление до rgba(255,255,255,0.18) — единственный способ
 * показать нажатие. Здесь наоборот: кнопка уже залита --color-primary и есть
 * самый яркий объект карточки, осветлять её некуда — следующая ступень уходит
 * в кислотный и на тёмном фоне читается как пересвет, а не как отклик.
 *
 * ВАЖНО: scale живёт на САМОЙ кнопке, а позиционирование (translateY(-50%) и
 * т.п.) — на внешней обёртке. Держать оба transform на одном узле нельзя:
 * scale затирает смещение, и кнопка съезжает с вертикального центра.
 *
 * Палец ушёл за пределы кнопки — жест снимается (как у CloseCross), запуск не
 * происходит: случайный запуск тренировки дороже пропущенного тапа.
 */
export default function PlayButton({ onStart, size = 52, iconSize = 24, ariaLabel = 'Начать тренировку', label = null, height = 36 }) {
  const ref = useRef(null)
  const armedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const [press, setPress] = useState(false)

  const down = (e) => {
    e.stopPropagation()
    armedRef.current = true
    startRef.current = { x: e.clientX, y: e.clientY }
    setPress(true)
  }
  const move = (e) => {
    if (!armedRef.current) return
    // Сместился больше порога — это уже листание карусели, а не тап. Снимаем
    // жест сразу, не дожидаясь выхода за границы: кнопка 48px, и при свайпе
    // палец успевает увести ленту, ни разу не покинув её пределов.
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (Math.abs(dx) > MOVE_TOLERANCE_PX || Math.abs(dy) > MOVE_TOLERANCE_PX) {
      armedRef.current = false
      setPress(false)
      return
    }
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) { armedRef.current = false; setPress(false) }
  }
  const up = (e) => {
    e.stopPropagation()
    const armed = armedRef.current
    armedRef.current = false
    setPress(false)
    if (armed) onStart?.()
  }
  const cancel = () => { armedRef.current = false; setPress(false) }

  return (
    <button
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
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
        transform: press ? 'scale(1.04)' : 'scale(1)',
        transition: 'transform 0.18s var(--ease-ios)'
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
        transform: press ? 'scale(1.12)' : 'scale(1)',
        transition: 'transform 0.18s var(--ease-ios)'
      }}
    >
      {label ? (
        <>
          {label}
          <span style={{ display: 'inline-flex', color: 'var(--accent-on)' }}><PlayGlyph size={24} /></span>
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
