import { describe, it, expect } from 'vitest'
import { isWorkoutStale, lastTickOf, STALE_AFTER_TICK_MS, STALE_AFTER_START_MS } from '../workout-stale'

const NOW = new Date('2026-09-16T15:00:00Z').getTime()
const ago = (ms) => new Date(NOW - ms).toISOString()
const MIN = 60 * 1000

describe('isWorkoutStale', () => {
  it('без сессии — не забыта', () => {
    expect(isWorkoutStale(null, 0, NOW)).toBe(false)
  })

  it('с галочками: 89 мин после последней — ещё идёт, 90 — забыта', () => {
    const s = { startedAt: ago(4 * 60 * MIN), lastTickAt: ago(89 * MIN) }
    expect(isWorkoutStale(s, 3, NOW)).toBe(false)
    expect(isWorkoutStale({ ...s, lastTickAt: ago(STALE_AFTER_TICK_MS) }, 3, NOW)).toBe(true)
  })

  it('длинная тренировка со свежей галочкой не обрывается, как бы давно ни начали', () => {
    const s = { startedAt: ago(5 * 60 * MIN), lastTickAt: ago(10 * MIN) }
    expect(isWorkoutStale(s, 8, NOW)).toBe(false)
  })

  it('без галочек отсчёт от старта: 2 ч 59 — идёт, 3 ч — забыта', () => {
    expect(isWorkoutStale({ startedAt: ago(179 * MIN) }, 0, NOW)).toBe(false)
    expect(isWorkoutStale({ startedAt: ago(STALE_AFTER_START_MS) }, 0, NOW)).toBe(true)
  })

  it('без галочек lastTickAt не учитывается (сдвинулся от открытия дня)', () => {
    const s = { startedAt: ago(4 * 60 * MIN), lastTickAt: ago(5 * MIN), updatedAt: ago(5 * MIN) }
    expect(isWorkoutStale(s, 0, NOW)).toBe(true)
  })

  it('старая сессия без lastTickAt — берём updatedAt', () => {
    const s = { startedAt: ago(6 * 60 * MIN), updatedAt: ago(100 * MIN) }
    expect(lastTickOf(s, 2)).toBe(s.updatedAt)
    expect(isWorkoutStale(s, 2, NOW)).toBe(true)
  })
})
