/**
 * Оценка длительности тренировки — ОДИН источник правды.
 *
 * Жила константой внутри WorkoutDay.jsx: экрану её хватало, но то же число
 * теперь нужно боту в напоминании («~50 минут»), а он считает на сервере.
 * Разъехавшиеся оценки в шапке и в письме выглядели бы как ошибка, поэтому
 * формула вынесена сюда и импортируется обоими.
 */

/**
 * Одно упражнение ≈ 3 рабочих подхода (8–12 повторов) с ~2 мин отдыха между
 * подходами + подход/переход к снаряду: ~2 мин работы (3×~40с) + ~4 мин отдыха
 * (2×~120с) + ~1 мин переход ≈ 7 мин.
 */
export const EST_MIN_PER_EXERCISE = 7

/**
 * Сколько примерно займёт день программы, в минутах.
 *
 * Плавание считает не по упражнениям, а по своей заложенной длительности
 * (durationMin): там время задаётся метражом и отдыхом между кругами, а не
 * числом строк в памятке.
 *
 * Возвращает null, если оценить нечем — вызывающий просто не покажет строку.
 */
export function estimateMinutes(program, day) {
  if (!program) return null

  if (program.kind === 'swim') {
    return program.data?.durationMin || null
  }

  const dayKey = day || Object.keys(program.data?.days || {})[0]
  const exercises = program.data?.days?.[dayKey]
  if (!Array.isArray(exercises) || exercises.length === 0) return null

  return exercises.length * EST_MIN_PER_EXERCISE
}

/**
 * Показывать ли оценку рядом с названием программы.
 *
 * Если число уже стоит в самом названии («ЗАПЛЫВ 45»), вторая цифра рядом
 * читается как разнобой, а не как уточнение.
 */
export function shouldShowEstimate(program) {
  if (!program?.title) return true
  return !/\d/.test(program.title)
}
