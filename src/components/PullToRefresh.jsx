import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'

/**
 * Pull-to-refresh: хук жеста + индикатор-кольцо.
 *
 * Живёт там, где данные приходят ИЗВНЕ и могли измениться без участия
 * пользователя — то есть на «Друзьях» (друзья тренируются сами по себе).
 * На главной жест не нужен: свои тренировки меняет только сам пользователь
 * внутри этого же приложения, и кеш там инвалидируется по событию.
 *
 * Слушатели все passive — жест не перехватываем, нативный отскок работает
 * штатно. Горизонтальное листание (карусель, свайп по строке) отбрасывается
 * по PTR_AXIS, чтобы два жеста не боролись за одну зону.
 */

// PTR_REVEAL — «мёртвая зона»: сперва тянется невидимый верх, кольцо появляется только
// после неё, иначе индикатор мигает от любого касания. PTR_THRESH — порог срабатывания,
// PTR_MAX — предел оттяга. PTR_AXIS — если жест горизонтальный, pull вообще не начинаем.
const PTR_REVEAL = 34
const PTR_THRESH = 100
const PTR_MAX = 160
const PTR_AXIS = 8

export function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const startX = useRef(0)
  const armed = useRef(false)

  useEffect(() => {
    const scrollTop = () => window.scrollY || document.scrollingElement?.scrollTop || 0
    const onStart = (e) => {
      if (refreshing) return
      startY.current = scrollTop() <= 0 ? e.touches[0].clientY : null
      startX.current = e.touches[0].clientX
      armed.current = false
    }
    const onMove = (e) => {
      if (startY.current == null || refreshing) return
      if (scrollTop() > 0) { startY.current = null; setPull(0); return }
      const dy = e.touches[0].clientY - startY.current
      const dx = e.touches[0].clientX - startX.current
      // Горизонтальный жест — не pull: бросаем до конца касания.
      if (Math.abs(dx) > PTR_AXIS && Math.abs(dx) > Math.abs(dy)) {
        startY.current = null
        setPull(0)
        return
      }
      if (dy <= 0) { setPull(0); return }
      const damped = Math.min(PTR_MAX, dy * 0.5)
      setPull(damped)
      const nowArmed = damped >= PTR_THRESH
      if (nowArmed && !armed.current) { armed.current = true; haptic.rigid() }
      else if (!nowArmed && armed.current) armed.current = false
    }
    const onEnd = () => {
      if (startY.current == null) return
      startY.current = null
      if (armed.current && !refreshing) {
        setRefreshing(true)
        setPull(PTR_THRESH)
        haptic.success()
        // Дать увидеть заполнение + вибро, затем обновить данные (без reload) и
        // сбросить индикатор, когда обновление завершилось.
        setTimeout(() => {
          Promise.resolve(onRefresh()).finally(() => { setRefreshing(false); setPull(0) })
        }, 500)
      } else {
        setPull(0)
      }
      armed.current = false
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshing, onRefresh])

  return { pull, refreshing }
}

/** Кольцо-индикатор: заполняется по ходу оттяга, крутится во время обновления. */
function PullRing({ progress, refreshing, color }) {
  const R = 11
  const C = 2 * Math.PI * R
  const p = Math.min(1, Math.max(0, progress))
  const arc = refreshing ? 0.28 : Math.max(0.05, p) // минимум — «точка»
  return (
    <div className={refreshing ? 'ptr-spin' : undefined} style={styles.pullRing}>
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle
          cx="13" cy="13" r={R} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - arc)}
          transform="rotate(-90 13 13)"
        />
      </svg>
    </div>
  )
}

/**
 * Индикатор в портале body — поверх нативного отскока.
 * Цвет всегда акцентный зелёный: жест системный, от раздела не зависит.
 */
export function PullIndicator({ pull, refreshing, color = 'var(--color-primary)' }) {
  const shown = pull > PTR_REVEAL || refreshing
  const eff = refreshing ? PTR_THRESH : pull
  // Прогресс кольца считаем ОТ мёртвой зоны до порога (0 при PTR_REVEAL, 1 при THRESH).
  const progress = (pull - PTR_REVEAL) / (PTR_THRESH - PTR_REVEAL)
  return createPortal(
    <div aria-hidden="true" style={{
      ...styles.pullIndicator,
      opacity: shown ? 1 : 0,
      // Появляется у верхней кромки и тянется вниз по ходу оттяга.
      transform: `translateY(${eff - 36}px)`,
      transition: 'opacity 0.2s ease'
    }}>
      <PullRing progress={progress} refreshing={refreshing} color={color} />
    </div>,
    document.body
  )
}

const styles = {
  pullIndicator: {
    position: 'fixed',
    top: 'var(--tg-safe-top)',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 60
  },
  pullRing: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
}
