import { useEffect, useRef, useState } from 'react'
import RocketIcon from './RocketIcon'
import { haptic } from '../lib/telegram'

/**
 * Тумблер «Быстрая тренировка» в шапке дня.
 *
 * НАЖАТИЕ — то же «растущее» с отменой, что у крестика (`CloseCross`): палец
 * вниз → кружок светлеет и чуть растёт, увёл палец в сторону → вернулся и
 * действие НЕ сработало, отпустил на кнопке → переключение. Удержание 500мс
 * открывает настройку набора.
 *
 * СОСТОЯНИЯ ракеты: выкл — серая; вкл — акцентная; вкл + идёт тренировка
 * (`active`) — с оранжевым хвостом.
 *
 * ВЗЛЁТ ИГРАЕТ ТОЛЬКО НА ЯВНЫЙ ТАП. Раньше анимация висела на `key={on}` и
 * срабатывала на каждый ремаунт: пролистал день или вернул шапку скроллом —
 * ракета «взлетала» сама собой. Теперь ход запускает счётчик, который растёт
 * ИСКЛЮЧИТЕЛЬНО в обработчике нажатия.
 *
 * Нажимается ВЕЗДЕ: и в раскрытой шапке, и в пилюле, и во время тренировки —
 * ускориться человек решает как раз посреди неё.
 */
export default function RocketToggle({ on, onToggle, onLongPress, active = false, size = 22 }) {
  const ref = useRef(null)
  const armed = useRef(false)
  const longFired = useRef(false)
  const timer = useRef(null)
  const [press, setPress] = useState(false)
  const [launch, setLaunch] = useState(0)   // 0 = ещё не трогали → без анимации

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  useEffect(() => clearTimer, [])

  const down = (e) => {
    e.stopPropagation()          // не будить жест пилюли под кнопкой
    armed.current = true
    longFired.current = false
    setPress(true)
    if (!onLongPress) return
    clearTimer()
    timer.current = setTimeout(() => {
      if (!armed.current) return
      longFired.current = true
      armed.current = false
      setPress(false)
      haptic.medium()
      onLongPress()
    }, 500)
  }

  const move = (e) => {
    if (!armed.current) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) { armed.current = false; setPress(false); clearTimer() }
  }

  const up = (e) => {
    e.stopPropagation()
    clearTimer()
    const wasArmed = armed.current
    armed.current = false
    setPress(false)
    if (!wasArmed || longFired.current) return
    haptic.medium()
    setLaunch(n => n + 1)
    onToggle?.(!on)
  }

  const cancel = () => { armed.current = false; setPress(false); clearTimer() }

  return (
    <button
      ref={ref}
      type="button"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClick={(e) => e.stopPropagation()}
      aria-pressed={on}
      aria-label={on ? 'Выключить быструю тренировку' : 'Включить быструю тренировку'}
      style={styles.btn}
    >
      <span
        style={{
          ...styles.bubble,
          background: press ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
          transform: press ? 'scale(1.12)' : 'scale(1)'
        }}
      >
        <span
          key={launch}
          style={{
            display: 'inline-flex',
            lineHeight: 0,
            // Только после реального тапа (launch > 0). Появление шапки и
            // листание дней анимацию НЕ запускают.
            animation: launch === 0 ? 'none' : `${on ? 'rocketLaunch' : 'rocketLand'} 0.42s var(--ease-ios)`
          }}
        >
          <RocketIcon size={size} lit={on} flame={on && active} />
        </span>
      </span>
    </button>
  )
}

const styles = {
  // Хит-зона 44px вокруг ракеты — правило проекта для икон-кнопок.
  btn: {
    width: '44px', height: '44px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'none'
  },
  bubble: {
    width: '34px', height: '34px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.18s var(--ease-ios), background 0.18s ease'
  }
}
