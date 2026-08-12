import { useEffect, useRef } from 'react'
import RocketIcon from './RocketIcon'
import { haptic } from '../lib/telegram'

/**
 * Тумблер «Быстрая тренировка» в шапке дня.
 *
 * Выключен — тёмно-серая ракета «на земле». Тап: короткий взлёт вправо-вверх
 * (0.42с), ракета загорается акцентом + `haptic.medium()`. Выключение — тот же
 * ход назад. `active` (тренировка ИДЁТ) зажигает оранжевый хвост: «летит» должно
 * значить движение, а не просто выбранный режим.
 *
 * `interactive={false}` — ракета показана, но не нажимается: так она выглядит
 * в свёрнутой пилюле и на прокрученной шапке (там это индикатор «режим включён»,
 * а не кнопка; переключать можно только в раскрытой шапке).
 */
export default function RocketToggle({ on, onToggle, onLongPress, active = false, interactive = true, size = 22 }) {
  // Долгий тап — настройка набора. Порог и отмена по сдвигу — как у карточек
  // упражнений, чтобы жест ощущался одинаково во всём приложении.
  const timer = useRef(null)
  const fired = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  useEffect(() => clear, [])

  const down = (e) => {
    if (!interactive || !onLongPress) return
    fired.current = false
    start.current = { x: e.clientX, y: e.clientY }
    clear()
    timer.current = setTimeout(() => {
      fired.current = true
      haptic.medium()
      onLongPress()
    }, 500)
  }
  const move = (e) => {
    if (!timer.current) return
    if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clear()
  }

  const handle = () => {
    clear()
    if (!interactive) return
    if (fired.current) { fired.current = false; return } // долгий тап уже отработал
    haptic.medium()
    onToggle?.(!on)
  }

  return (
    <button
      type="button"
      onClick={handle}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      className={interactive ? 'press-tile' : ''}
      style={{ ...styles.btn, cursor: interactive ? 'pointer' : 'default' }}
      aria-pressed={on}
      aria-label={on ? 'Выключить быструю тренировку' : 'Включить быструю тренировку'}
      disabled={!interactive}
    >
      <span
        key={on ? 'on' : 'off'}
        style={{ ...styles.glyph, animation: `${on ? 'rocketLaunch' : 'rocketLand'} 0.42s var(--ease-ios)` }}
      >
        <RocketIcon size={size} lit={on} flame={on && active} />
      </span>
    </button>
  )
}

const styles = {
  // Хит-зона 44px вокруг ракеты — правило проекта для икон-кнопок.
  btn: {
    width: '44px', height: '44px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', padding: 0,
    WebkitTapHighlightColor: 'transparent'
  },
  glyph: { display: 'inline-flex', lineHeight: 0 }
}
