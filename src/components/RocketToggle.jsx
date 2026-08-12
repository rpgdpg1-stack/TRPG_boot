import { useEffect, useRef, useState } from 'react'
import RocketIcon from './RocketIcon'
import { haptic } from '../lib/telegram'

/**
 * Тумблер «Быстрая тренировка» в шапке дня.
 *
 * НАЖАТИЕ — то же «растущее» с отменой, что у крестика (`CloseCross`), но без
 * кружка-подложки: под пальцем растёт и светлеет САМА иконка. Увёл палец
 * в сторону → вернулась и действие НЕ сработало, отпустил на кнопке →
 * переключение. Удержание 500мс открывает настройку набора.
 *
 * СОСТОЯНИЯ ракеты: выкл — серая; вкл — акцентная; вкл + идёт тренировка
 * (`active`) — с оранжевым хвостом.
 *
 * ВЗЛЁТ ИГРАЕТ ТОЛЬКО НА ЯВНЫЙ ТАП. Две итерации до этого промахнулись:
 *   1) анимация на `key={on}` — играла на каждый ремаунт;
 *   2) счётчик тапов, но имя анимации всё ещё зависело от `on`
 *      (`on ? 'rocketLaunch' : 'rocketLand'`). Смена имени анимации САМА ПО СЕБЕ
 *      перезапускает её в CSS — поэтому при листании дней (в одном включено,
 *      в другом нет) ракета продолжала прыгать, и «лечил» только уход с экрана,
 *      сбрасывавший счётчик.
 * Теперь имя анимации — состояние, которое ставит ТОЛЬКО обработчик нажатия
 * и снимает `onAnimationEnd`. Смена `on` со стороны (листание, приход данных
 * из облака) на него не влияет вообще.
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
  const [anim, setAnim] = useState(null)   // null = анимации нет

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
    // Имя фиксируем ЗДЕСЬ, по направлению переключения — дальше оно ни от чего
    // не зависит и снимется само по окончании.
    setAnim(!on ? 'rocketLaunch' : 'rocketLand')
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
      {/* Кружка-подложки НЕТ: под пальцем растёт и светлеет сама иконка.
          brightness работает и на сером, и на зелёном — отдельные цвета
          для каждого состояния заводить не нужно. */}
      <span
        onAnimationEnd={() => setAnim(null)}
        style={{
          display: 'inline-flex',
          lineHeight: 0,
          transform: press ? 'scale(1.18)' : 'scale(1)',
          filter: press ? 'brightness(1.4)' : 'none',
          transition: 'transform 0.18s var(--ease-ios), filter 0.18s ease',
          animation: anim ? `${anim} 0.42s var(--ease-ios)` : 'none'
        }}
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
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'none'
  }
}
