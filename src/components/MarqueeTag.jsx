import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/telegram'

/**
 * Тег упражнения («Ноги — Квадрицепс»), который не лезет за отведённую ширину.
 *
 * Раньше тег был `white-space: nowrap` без ограничения и на длинных подписях
 * заезжал под цифру веса — а цифра тут главное, её ничем перекрывать нельзя.
 * Переносить тег на вторую строку тоже неправильно: пилюля в две строки
 * перестаёт читаться как один ярлык и ломает высоту карточки.
 *
 * Поэтому: не влез — обрезается многоточием, а по ТАПУ по самому тегу текст
 * прокатывается влево до конца, показывает хвост и возвращается. Тап — потому
 * что это единственный жест, который здесь свободен: карточка занята открытием,
 * долгое нажатие — меню, свайп — панелью действий.
 *
 * Прокатка бежит только когда есть что показывать. Влез целиком — тап ничего
 * не делает и вибрации нет: отклик на пустое действие врёт.
 *
 * ПО УМОЛЧАНИЮ ТЕГ НЕ ИНТЕРАКТИВЕН — только многоточие. Прокатку включает
 * `interactive` и ровно в одном месте: в модалке долгого нажатия по упражнению.
 *
 * Почему так. В списках (день тренировки, любимые) карточка ловит долгое
 * нажатие, и «живой» тег посреди неё эту зону съедал: человек метил в упражнение,
 * попадал в тег, меню не открывалось. Читать длинную подпись целиком нужно
 * не на бегу по списку, а когда упражнение уже открыто, — там прокатка
 * ничему не мешает и находится ровно под рукой.
 */
export default function MarqueeTag({ label, background, color = 'var(--color-text)', interactive = false, style }) {
  const trackRef = useRef(null)
  const [shift, setShift] = useState(0)
  const [dur, setDur] = useState(0)
  const [running, setRunning] = useState(false)
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Хвост, который не поместился. Обе величины берём У ТРЕКА: clientWidth — это
  // видимая ширина без паддингов пилюли, scrollWidth — полная ширина текста.
  // Раньше вычиталась ширина ПИЛЮЛИ (box.clientWidth), а она включает
  // горизонтальные паддинги — и текст недокатывался ровно на них, хвост
  // оставался за кадром.
  const hiddenPx = () => {
    const track = trackRef.current
    if (!track) return 0
    return Math.ceil(track.scrollWidth - track.clientWidth)
  }
  // Влез целиком — тег ведёт себя как обычная подпись и тапы пропускает
  // карточке. Перехватывать их «на всякий случай» значило бы сделать часть
  // карточки мёртвой зоной.
  const overflowing = () => interactive && hiddenPx() > 1

  const onTap = (e) => {
    if (!interactive || running) return
    const hidden = hiddenPx()
    if (hidden <= 1) return

    e.stopPropagation()
    haptic.selection()

    // Скорость постоянная (~55px/с), а не фиксированная длительность: иначе
    // короткий хвост уползал бы медленно, а длинный — мельтешил.
    const ms = Math.min(2400, Math.max(420, Math.round(hidden * 18)))
    setRunning(true)
    setDur(ms)
    setShift(-hidden)

    timers.current.push(setTimeout(() => setShift(0), ms + 600))
    timers.current.push(setTimeout(() => { setRunning(false); setDur(0) }, ms + 600 + ms + 60))
  }

  // Карточка под тегом слушает не только click, но и pointer-события (долгое
  // нажатие → меню, горизонтальный свайп → панель действий). Гасим их на самом
  // теге, иначе прокатка шла бы вместе с открытием меню.
  const swallow = (e) => { if (overflowing()) e.stopPropagation() }

  return (
    <span
      onClick={onTap}
      onPointerDown={swallow}
      onPointerUp={swallow}
      style={{ ...styles.box, background, color, ...(interactive ? null : styles.static), ...style }}
    >
      <span
        ref={trackRef}
        style={{
          ...styles.track,
          // На покое многоточие; на прокатке его снимаем, иначе точки ехали бы
          // вместе с текстом и хвост так и остался бы за ними.
          ...(running ? styles.trackRunning : styles.trackIdle),
          transform: `translateX(${shift}px)`,
          transition: dur ? `transform ${dur}ms linear` : 'none'
        }}
      >
        {label}
      </span>
    </span>
  )
}

const styles = {
  box: {
    display: 'inline-block',
    maxWidth: '100%',
    // Обязательно: как flex-item тег иначе получает min-width: auto (= ширина
    // текста целиком) и max-width его не удержит — min-width в CSS сильнее.
    // Именно из-за этого тег и заезжал под цифру веса.
    minWidth: 0,
    overflow: 'hidden',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    fontWeight: 700,
    letterSpacing: '0.3px',
    lineHeight: '15px',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    WebkitTapHighlightColor: 'transparent'
  },
  // Без прокатки тег — обычная подпись: тапы сквозь него идут карточке.
  static: { pointerEvents: 'none' },
  track: { display: 'block', whiteSpace: 'nowrap' },
  trackIdle: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' },
  trackRunning: { maxWidth: 'none', overflow: 'visible', textOverflow: 'clip' }
}
