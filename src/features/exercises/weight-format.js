/**
 * Нормализация ввода веса упражнения — единый источник правды.
 * Используется в ExerciseCard и ExerciseActionMenu, чтобы фильтрация ввода,
 * clamp 0–500 и округление до 0.5 были одинаковыми в обоих местах.
 */

/**
 * Очистка ввода ПО ХОДУ набора (onChange): запятая → точка, только цифры
 * и одна точка, максимум 5 символов. Возвращает строку для setState.
 */
export function sanitizeWeightInput(raw) {
  let v = String(raw ?? '')
  v = v.replace(/,/g, '.')
  v = v.replace(/[^0-9.]/g, '')
  const parts = v.split('.')
  if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
  if (v.length > 5) v = v.slice(0, 5)
  return v
}

/**
 * Нормализация при сохранении (onBlur). Принимает черновик-строку, возвращает:
 *   { cleared: true, value: 0 } — поле очищено, сохранить 0
 *   { invalid: true }           — мусор, сохранять НЕ нужно
 *   { value: <число> }          — валидный вес, округлён до 0.5, clamp 0–500
 */
export function normalizeWeightForSave(draft) {
  const trimmed = String(draft ?? '').trim()
  if (trimmed === '') return { cleared: true, value: 0 }

  const num = parseFloat(trimmed)
  if (isNaN(num) || num < 0) return { invalid: true }

  const clamped = Math.max(0, Math.min(500, num))
  return { value: Math.round(clamped * 2) / 2 }
}