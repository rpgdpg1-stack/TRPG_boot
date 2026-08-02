import { useRef, useState } from 'react'

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
 * в кислотный и на тёмном фоне читается как пересвет, а не как отклик. Разница
 * была бы заметна лишь рядом с ненажатым состоянием, которого в этот момент на
 * экране нет. Масштаб же читается мгновенно и на любом цвете.
 *
 * Палец ушёл за пределы кнопки — жест снимается (как у CloseCross), запуск не
 * происходит: случайный запуск тренировки дороже пропущенного тапа.
 */
export default function PlayButton({ onStart, size = 44, iconSize = 21, ariaLabel = 'Начать тренировку', style }) {
  const ref = useRef(null)
  const armedRef = useRef(false)
  const [press, setPress] = useState(false)

  const down = (e) => { e.stopPropagation(); armedRef.current = true; setPress(true) }
  const move = (e) => {
    if (!armedRef.current) return
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
      style={{
        ...style,
        flexShrink: 0,
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: 'none',
        background: 'var(--color-primary)',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        transform: press ? 'scale(1.12)' : 'scale(1)',
        transition: 'transform 0.18s var(--ease-ios)'
      }}
    >
      {/* Оптический центр: треугольник тяжелее слева, сдвигаем на 2px вправо. */}
      <span style={{ display: 'inline-flex', color: 'var(--accent-on)', marginLeft: '2px' }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  )
}
