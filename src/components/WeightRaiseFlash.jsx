import { useEffect, useRef, useState } from 'react'
import { getTodayKey } from '../utils/dates'

/**
 * Индикатор «повысил вес» — общая механика для карточки упражнения (ExerciseCard)
 * и модалки долгого нажатия (ExerciseActionMenu).
 *
 * Правило: цветом кодируем ТОЛЬКО факт «поднял вес и ещё не отработал его».
 * Число веса по умолчанию нейтральное (WEIGHT_NEUTRAL_COLOR — мягкий белый,
 * как название упражнения). Паттерн:
 *  - Повышение (новое > старого, после blur/Enter) → стрелка ↑ (разовая вспышка
 *    ~2.5с) + число зеленеет и ДЕРЖИТСЯ зелёным (localStorage, ключ по exercise_id
 *    с днём повышения getTodayKey).
 *  - Отметка «выполнено» в ТОТ ЖЕ день (день повышения) зелёный НЕ сбрасывает,
 *    сколько бы раз ни тапали.
 *  - Первая отметка «выполнено» в ЛЮБОЙ СЛЕДУЮЩИЙ день → зелёный гаснет
 *    (clearWeightRaisedOnDone зовёт WorkoutDay при отжатии галочки) — вес
 *    отработан и становится обычной рабочей базой.
 *  - Новое повышение — цикл заново (дата перезаписывается на сегодня).
 *  - Понижение / стирание в 0 → сброс сразу, без индикации (красного нет).
 */

export const WEIGHT_NEUTRAL_COLOR = '#F0F0F0'
// Транзишен цвета цифры — мягкое загорание/затухание зелёного.
export const WEIGHT_COLOR_TRANSITION = 'color 0.45s ease'

const ARROW_TOTAL_MS = 2500 // стрелка: разовая вспышка (fade-out на 82→100% в keyframes)
const LS_PREFIX = 'weight-raised:' // localStorage: weight-raised:<exercise_id> = todayKey повышения

// ---- localStorage + подписка (карточка и модалка видят сбросы друг друга) ----

const listeners = new Set()
const notify = (exerciseId) => listeners.forEach(fn => fn(exerciseId))

function getRaisedDay(exerciseId) {
  if (!exerciseId) return null
  try { return localStorage.getItem(LS_PREFIX + exerciseId) } catch { return null }
}

function markRaised(exerciseId) {
  if (!exerciseId) return
  try { localStorage.setItem(LS_PREFIX + exerciseId, getTodayKey()) } catch { /* ignore */ }
  notify(exerciseId)
}

function clearRaised(exerciseId) {
  if (!exerciseId) return
  try { localStorage.removeItem(LS_PREFIX + exerciseId) } catch { /* ignore */ }
  notify(exerciseId)
}

/**
 * Отжатие галочки «выполнено» (WorkoutDay.handleCardTap): если повышение было
 * в ДРУГОЙ день — зелёный гаснет (вес отработан). В день повышения — остаётся.
 */
export function clearWeightRaisedOnDone(exerciseId) {
  const day = getRaisedDay(exerciseId)
  if (day && day !== getTodayKey()) clearRaised(exerciseId)
}

// ---- хук для компонентов с числом веса ----

export function useWeightRaiseFlash(exerciseId) {
  const [green, setGreen] = useState(() => !!getRaisedDay(exerciseId))
  const [arrowNonce, setArrowNonce] = useState(0) // >0 = стрелка в DOM; ремаунт по значению
  const arrowTimer = useRef(null)
  useEffect(() => () => { if (arrowTimer.current) clearTimeout(arrowTimer.current) }, [])

  // Ресинк при смене упражнения (свап) и при сбросе из другого места
  // (галочка в WorkoutDay, второй экземпляр в модалке).
  useEffect(() => {
    setGreen(!!getRaisedDay(exerciseId))
    const fn = (id) => { if (id === exerciseId) setGreen(!!getRaisedDay(exerciseId)) }
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [exerciseId])

  // Повышение веса: зафиксировать (localStorage, сегодняшний день) + вспышка стрелки.
  const trigger = () => {
    markRaised(exerciseId)
    setArrowNonce(n => n + 1) // новый key → анимация перезапускается при повторном повышении
    if (arrowTimer.current) clearTimeout(arrowTimer.current)
    arrowTimer.current = setTimeout(() => setArrowNonce(0), ARROW_TOTAL_MS)
  }

  // Понижение/обнуление веса: снять индикатор сразу.
  const reset = () => clearRaised(exerciseId)

  return {
    trigger,
    reset,
    color: green ? 'var(--color-primary)' : WEIGHT_NEUTRAL_COLOR,
    arrow: arrowNonce > 0 ? <RaiseArrow key={arrowNonce} /> : null
  }
}

/** Зелёная стрелка ↑ слева от числа веса (по высоте цифры). Анимация в index.css. */
function RaiseArrow() {
  return (
    <span style={arrowStyles.wrap} aria-hidden="true">
      <svg width="12" height="15" viewBox="0 0 12 15" fill="none">
        <path
          d="M6 13 V2.5 M2.2 6 L6 2.2 L9.8 6"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

const arrowStyles = {
  wrap: {
    position: 'absolute',
    right: '100%',
    top: '50%',
    marginRight: '3px',
    display: 'flex',
    lineHeight: 0,
    color: 'var(--color-primary)',
    pointerEvents: 'none',
    animation: 'weightRaiseArrow 2.5s ease forwards'
  }
}
