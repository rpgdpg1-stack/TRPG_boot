import RocketIcon from './RocketIcon'
import { haptic } from '../lib/telegram'

/**
 * Тумблер «Быстрая тренировка» в шапке дня.
 *
 * Выключен — тёмно-серая ракета «на земле». Тап: короткий взлёт вправо-вверх
 * (0.42с) со шлейфом, ракета загорается акцентом + `haptic.medium()`.
 * Выключение — тот же ход назад, без вспышки.
 *
 * `interactive={false}` — ракета показана, но не нажимается: так она выглядит
 * в свёрнутой пилюле и на прокрученной шапке (там это индикатор «режим включён»,
 * а не кнопка; переключать можно только в раскрытой шапке).
 */
export default function RocketToggle({ on, onToggle, interactive = true, size = 22 }) {
  const handle = () => {
    if (!interactive) return
    haptic.medium()
    onToggle?.(!on)
  }

  return (
    <button
      type="button"
      onClick={handle}
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
        <RocketIcon size={size} lit={on} />
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
