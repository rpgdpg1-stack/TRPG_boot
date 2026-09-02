import { describe, it, expect } from 'vitest'
import {
  periodRange, summarizeWorkouts, hasWorkoutTodayOfType,
  periodShortLabel, workoutMinutes, formatDuration, formatMeters, programCategoryKey
} from '../history'

/**
 * Периоды и сводка статистики (TEST-001).
 *
 * Эти функции решают, какие тренировки попадут в «неделю», «месяц» и «год»
 * на экране статистики. Ошибка здесь тихая: приложение не падает, просто
 * показывает не то число — и человек либо не заметит, либо перестанет верить
 * цифрам. Проверить руками почти нельзя: нужно дождаться конца месяца или
 * границы недели.
 *
 * Неделя в проекте начинается с ПОНЕДЕЛЬНИКА и считается по Москве —
 * так же, как на сервере. Расхождение здесь развело бы цифры на главной
 * и в сводке бота.
 */

// Среда, 2 сентября 2026, 12:00 МСК.
const NOW = new Date('2026-09-02T09:00:00Z')
const wk = (iso, extra = {}) => ({ finished_at: iso, started_at: iso, ...extra })

describe('periodRange — границы периода', () => {
  it('неделя начинается в понедельник и длится ровно 7 суток', () => {
    const [start, end] = periodRange('week', NOW)
    expect(end - start).toBe(7 * 86400000)
    // 2 сентября 2026 — среда, значит понедельник это 31 августа.
    expect(new Date(start).toISOString()).toBe('2026-08-30T21:00:00.000Z') // 31.08 00:00 МСК
  })

  it('месяц — от первого числа до первого числа следующего', () => {
    const [start, end] = periodRange('month', NOW)
    expect(new Date(start).toISOString()).toBe('2026-08-31T21:00:00.000Z') // 01.09 00:00 МСК
    expect(new Date(end).toISOString()).toBe('2026-09-30T21:00:00.000Z')   // 01.10 00:00 МСК
  })

  it('год — от 1 января до 1 января', () => {
    const [start, end] = periodRange('year', NOW)
    expect(new Date(start).toISOString()).toBe('2025-12-31T21:00:00.000Z')
    expect(new Date(end).toISOString()).toBe('2026-12-31T21:00:00.000Z')
  })

  it('«всё время» охватывает любую дату', () => {
    const [start, end] = periodRange('all', NOW)
    expect(start).toBe(0)
    expect(new Date('1999-01-01').getTime()).toBeGreaterThanOrEqual(start)
    expect(Date.now()).toBeLessThan(end)
  })
})

describe('summarizeWorkouts — что попадает в период', () => {
  it('считает только завершённые тренировки', () => {
    const list = [wk('2026-09-02T09:00:00Z'), { finished_at: null, started_at: '2026-09-02T09:00:00Z' }]
    expect(summarizeWorkouts(list, 'month', NOW).count).toBe(1)
  })

  it('тренировка прошлого месяца не попадает в текущий', () => {
    const list = [wk('2026-08-30T09:00:00Z'), wk('2026-09-01T09:00:00Z')]
    expect(summarizeWorkouts(list, 'month', NOW).count).toBe(1)
  })

  it('первое число месяца ВХОДИТ в месяц', () => {
    // Полночь 1 сентября по Москве — это 31 августа 21:00 UTC.
    expect(summarizeWorkouts([wk('2026-08-31T21:00:00Z')], 'month', NOW).count).toBe(1)
  })

  it('последняя минута предыдущего месяца НЕ входит', () => {
    expect(summarizeWorkouts([wk('2026-08-31T20:59:00Z')], 'month', NOW).count).toBe(0)
  })

  it('понедельник входит в неделю, воскресенье до него — нет', () => {
    const monday = wk('2026-08-31T06:00:00Z')  // 09:00 МСК понедельника
    const sunday = wk('2026-08-30T06:00:00Z')  // предыдущее воскресенье
    expect(summarizeWorkouts([monday, sunday], 'week', NOW).count).toBe(1)
  })

  it('пустой и отсутствующий список не ломают подсчёт', () => {
    expect(summarizeWorkouts([], 'month', NOW).count).toBe(0)
    expect(summarizeWorkouts(null, 'month', NOW).count).toBe(0)
  })

  it('минуты суммируются по длительности', () => {
    const list = [{ started_at: '2026-09-02T09:00:00Z', finished_at: '2026-09-02T10:00:00Z' }]
    expect(summarizeWorkouts(list, 'month', NOW).minutes).toBe(60)
  })
})

describe('hasWorkoutTodayOfType — предупреждение о лимите суток', () => {
  it('видит тренировку, завершённую сегодня по Москве', () => {
    const list = [wk('2026-09-02T05:00:00Z', { program_id: 'fullbody' })]
    expect(hasWorkoutTodayOfType(list, 'strength', NOW)).toBe(true)
  })

  it('вчерашняя тренировка не считается сегодняшней', () => {
    const list = [wk('2026-09-01T05:00:00Z', { program_id: 'fullbody' })]
    expect(hasWorkoutTodayOfType(list, 'strength', NOW)).toBe(false)
  })

  // Разделение по разделам здесь НЕ проверяем: hasWorkoutTodayOfType зовёт
  // workoutCategoryMeta, а та идёт в реестр программ — вне приложения он пуст,
  // и всё считается силовой. Саму логику раздела проверяем ниже на чистой
  // programCategoryKey, где она целиком и живёт.
})

describe('programCategoryKey — к какому разделу относится программа', () => {
  it('плавание узнаётся и по виду, и по категории', () => {
    expect(programCategoryKey({ kind: 'swim' })).toBe('pool')
    expect(programCategoryKey({ category: 'pool' })).toBe('pool')
  })

  it('кардио и растяжка — свои разделы', () => {
    expect(programCategoryKey({ category: 'cardio' })).toBe('cardio')
    expect(programCategoryKey({ category: 'stretch' })).toBe('stretch')
  })

  it('всё остальное считается силовой', () => {
    expect(programCategoryKey({ category: 'gym' })).toBe('strength')
    expect(programCategoryKey({})).toBe('strength')
    // Неизвестная программа (удалена, ещё не загружена) не должна ронять подсчёт.
    expect(programCategoryKey(undefined)).toBe('strength')
  })
})

describe('подписи и форматирование', () => {
  it('месяц подписан названием, год — числом', () => {
    expect(periodShortLabel('month', NOW)).toBe('Сентябрь')
    expect(periodShortLabel('year', NOW)).toBe('2026')
    expect(periodShortLabel('week', NOW)).toBe('7 дней')
    expect(periodShortLabel('all', NOW)).toBe('За всё время')
  })

  it('длительность считается от старта до финиша', () => {
    expect(workoutMinutes({ started_at: '2026-09-02T09:00:00Z', finished_at: '2026-09-02T10:30:00Z' })).toBe(90)
  })

  it('без времени старта длительность равна нулю, а не отрицательна', () => {
    expect(workoutMinutes({ started_at: null, finished_at: '2026-09-02T10:00:00Z' })).toBe(0)
  })

  it('часы отделяются от минут только когда есть часы', () => {
    expect(formatDuration(45)).toBe('45 мин')
    expect(formatDuration(90)).toBe('1 ч 30 мин')
    expect(formatDuration(120)).toBe('2 ч')
  })

  it('метры переходят в километры после порога', () => {
    expect(formatMeters(750)).toContain('750')
    expect(formatMeters(2800)).toContain('2,8')
  })
})
