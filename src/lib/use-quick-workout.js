import { useEffect, useState } from 'react'
import { getQuickSet, getQuickSetSync, isQuickOn, syncQuickOn } from './quick-workout'

/**
 * Быстрая версия дня: какие упражнения в неё входят и включена ли она (FE-002).
 *
 * Второй вынос из `WorkoutDay` — экрана на две тысячи строк, где пять эффектов
 * висели на одних и тех же зависимостях `[programId, place, day]`. Порядок их
 * срабатывания определялся только порядком объявления в файле, а понять,
 * что произойдёт при смене дня, можно было лишь удерживая в голове все пять.
 * Здесь собраны два из них — оба про одно и то же и всегда менялись вместе.
 *
 * Обе величины стартуют МГНОВЕННО из localStorage и догоняются из облака:
 * экран дня не должен ждать сети, чтобы показать, включена ли ракета.
 *
 * Область у них разная, и это намеренно:
 *  - набор упражнений — свой для каждой пары место+день (в зале и дома
 *    быстрая версия состоит из разного);
 *  - включённость — тоже на каждый день своя: включил в A, в B она серая,
 *    пока не нажмёшь там же.
 *
 * Наружу отдаётся сеттер только для включённости: переключатель ракеты меняет
 * её сразу, не дожидаясь облака. Набор упражнений экран не правит — он его
 * только читает (редактируется набор на своём экране, /quick).
 *
 * @returns { quickIds, quickOn, setQuickOn }
 */
export function useQuickWorkout(programId, place, day) {
  const [quickIds, setQuickIds] = useState(null)
  const [quickOn, setQuickOn] = useState(false)

  // Набор быстрой версии: сперва из localStorage, затем облако догоняет.
  useEffect(() => {
    setQuickIds(getQuickSetSync(programId, place, day))
    let alive = true
    getQuickSet(programId, place, day).then(v => { if (alive) setQuickIds(v) })
    return () => { alive = false }
  }, [programId, place, day])

  // Включённость ракеты — тем же порядком.
  useEffect(() => {
    setQuickOn(isQuickOn(programId, place, day))
    let alive = true
    syncQuickOn(programId, place, day).then(v => { if (alive) setQuickOn(v) })
    return () => { alive = false }
  }, [programId, place, day])

  return { quickIds, quickOn, setQuickOn }
}
