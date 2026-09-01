import { useEffect, useMemo, useState } from 'react'
import { haptic } from '../lib/telegram'
import WheelSheet, { Wheel } from './WheelSheet'

/**
 * Выбор даты рождения — три барабана (день · месяц · год) в общем нижнем листе
 * (`WheelSheet`), тот же, что у роста.
 *
 * Список дней пересобирается под выбранный месяц и год, поэтому 31 февраля не
 * выбрать физически — проверять это потом уже не нужно.
 *
 * ПОЧЕМУ НЕ `<input type="date">`. Он открывает СИСТЕМНЫЙ пикер, который живёт
 * по своим правилам темы и языка: внутри Telegram он выглядит чужим элементом
 * и на части Android открывается календарём с листанием по месяцам — искать в
 * нём 1990 год приходится долго.
 */

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
]

const YEARS_BACK = 100

function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate()
}

/** Разбор `YYYY-MM-DD` в части. Пусто или мусор → null. */
function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  const [, y, mo, d] = m
  return { year: Number(y), month: Number(mo) - 1, day: Number(d) }
}

export default function BirthDateModal({ value, onPick, onClose }) {
  const текущийГод = new Date().getFullYear()
  const years = useMemo(
    () => Array.from({ length: YEARS_BACK + 1 }, (_, i) => текущийГод - YEARS_BACK + i),
    [текущийГод]
  )

  // Пусто — встаём на 1 января года «тридцать лет назад»: это середина
  // аудитории, и крутить оттуда в любую сторону недалеко.
  const начало = parseISO(value) || { year: текущийГод - 30, month: 0, day: 1 }
  const [year, setYear] = useState(начало.year)
  const [month, setMonth] = useState(начало.month)
  const [day, setDay] = useState(начало.day)

  const дней = daysInMonth(year, month)
  // 31 марта → февраль: 31-го не существует, съезжаем на последний день месяца.
  useEffect(() => { if (day > дней) setDay(дней) }, [дней, day])

  const days = useMemo(() => Array.from({ length: дней }, (_, i) => i + 1), [дней])

  const готово = () => {
    const d = Math.min(day, дней)
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    // Дата из будущего — не дата рождения. Барабан её и не предлагает
    // (годы кончаются текущим), но день и месяц могли уехать вперёд.
    if (new Date(`${iso}T00:00:00`).getTime() > Date.now()) { haptic.error(); return }
    onPick?.(iso)
  }

  return (
    <WheelSheet title="Дата рождения" hint="Возраст посчитаем сами" onDone={готово} onClose={onClose}>
      <Wheel items={days} value={day} onChange={setDay} label="День" />
      <Wheel
        items={MONTHS.map((m, i) => ({ id: i, label: m }))}
        value={month} onChange={setMonth} label="Месяц" flex={1.4}
      />
      <Wheel items={years} value={year} onChange={setYear} label="Год" />
    </WheelSheet>
  )
}
