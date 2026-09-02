import { useEffect, useState } from 'react'
import { elapsedSecFrom, TIMER_ORANGE_SEC, TIMER_RED_SEC } from './active-workout'

/**
 * Часы идущей тренировки: сколько прошло и в каком «тире» это время (ARCH-001).
 *
 * Первый вынос из `WorkoutDay` — экрана на две тысячи строк с двумя десятками
 * эффектов, где пять штук висели на одних и тех же зависимостях. Разбирать его
 * надо по одному куску, и часы — самый обособленный: у них нет ничего общего
 * с остальным экраном, кроме активной сессии.
 *
 * Время считается НЕ накоплением, а разницей `now − startedAt`. Поэтому оно
 * переживает уход из приложения, сворачивание и возврат: секунды не «встают
 * на паузу» вместе с интервалом, а пересчитываются от настоящего старта.
 * Интервал нужен только чтобы перерисовать цифру раз в секунду.
 *
 * Тир — это порог, а не цвет: 'green' → 'orange' (час) → 'red' (полтора).
 * Цвет и реакция на смену тира (пульс, поп-ап «пора завершать») остаются в
 * экране: они про интерфейс, а не про подсчёт времени.
 *
 * Неактивный день (другой день или сессия не начата) — ноль и 'off', без тика:
 * секундный интервал не должен идти на экране, где часы не показываются.
 *
 * @param isActive — этот ли день сейчас идёт.
 * @param startedAt — ISO-время старта сессии.
 * @returns { elapsedSec, timerTier }
 */
export function useWorkoutTimer(isActive, startedAt) {
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!isActive) { setElapsedSec(0); return }
    const tick = () => setElapsedSec(elapsedSecFrom(startedAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isActive, startedAt])

  const timerTier = !isActive ? 'off'
    : elapsedSec >= TIMER_RED_SEC ? 'red'
    : elapsedSec >= TIMER_ORANGE_SEC ? 'orange'
    : 'green'

  return { elapsedSec, timerTier }
}
