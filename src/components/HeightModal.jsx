import { useMemo, useState } from 'react'
import WheelSheet, { Wheel } from './WheelSheet'

/**
 * Выбор роста — один барабан в том же нижнем листе, что и дата рождения.
 *
 * Раньше рост набирали с клавиатуры. Ради трёх цифр, которые вводят раз в
 * жизни, это плохой размен: клавиатура в мини-приложении дёргает весь экран, а
 * руками можно занести и 1930 см. Барабан ограничен разумным диапазоном —
 * невалидного значения просто нет в списке.
 */

const MIN = 120
const MAX = 230
const DEFAULT = 175

export default function HeightModal({ value, onPick, onClose }) {
  const items = useMemo(() => Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i), [])
  const начало = Number(value) >= MIN && Number(value) <= MAX ? Number(value) : DEFAULT
  const [cm, setCm] = useState(начало)

  return (
    <WheelSheet title="Рост" onDone={() => onPick?.(cm)} onClose={onClose}>
      <Wheel items={items} value={cm} onChange={setCm} unit="см" />
    </WheelSheet>
  )
}
