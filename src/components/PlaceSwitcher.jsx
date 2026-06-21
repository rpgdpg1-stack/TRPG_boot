import { useState, useMemo } from 'react'
import { getProgramPlaces, getPlaceMeta } from '../features/programs/registry'
import { useProgramPlace } from '../lib/program-place'
import { haptic } from '../lib/telegram'

/**
 * Переключатель места тренировки (Зал/Дом/Улица) — общий для карточек программы
 * (главная, избранное, силовая).
 *
 * Показывает тег выбранного места (эмодзи + подпись, цвет по месту). Если у
 * программы заполнено несколько мест — тап по тегу раскрывает остальные в строку
 * (выдвигаются справа), выбор запоминается (CloudStorage, кросс-девайс) пока юзер
 * не сменит. Если место одно — тег статичный, не тапается.
 *
 * Выбор живёт по ключу `program-place:<slug>` (см. useProgramPlace) и используется
 * как «активное место» программы — его же грузит экран тренировки.
 *
 * Управление: по умолчанию неконтролируемый (свой useProgramPlace, пишет выбор
 * сам). Если передан `value` — контролируемый (выбор хранит родитель, напр. экран
 * дня), тогда запись делает родитель через onChange.
 *
 * Тап по переключателю не должен срабатывать как тап по карточке — глушим
 * всплытие (stopPropagation) на всех интеракциях.
 */
export default function PlaceSwitcher({ program, value: cValue, onChange }) {
  const places = useMemo(() => getProgramPlaces(program), [program])
  const [iValue, iSet] = useProgramPlace(program?.slug || '', places)
  const [open, setOpen] = useState(false)

  const controlled = cValue != null
  const value = controlled ? cValue : iValue

  if (places.length === 0) return null

  const pick = (e, loc) => {
    e.stopPropagation()
    if (loc !== value) {
      haptic.selection()
      if (!controlled) iSet(loc)
      onChange?.(loc)
    }
    setOpen(false)
  }

  const toggle = (e) => {
    e.stopPropagation()
    if (places.length <= 1) return
    haptic.light()
    setOpen(o => !o)
  }

  // Свёрнуто — только выбранное; раскрыто — выбранное первым, затем остальные.
  const ordered = open ? [value, ...places.filter(p => p !== value)] : [value]

  return (
    <div style={styles.row} onClick={(e) => e.stopPropagation()}>
      {ordered.map((loc, i) => {
        const meta = getPlaceMeta(loc)
        const isCurrent = loc === value
        return (
          <button
            key={loc}
            onClick={(e) => (i === 0 ? toggle(e) : pick(e, loc))}
            className="press-tile"
            style={{
              ...styles.tag,
              borderColor: meta.color,
              background: isCurrent ? meta.color : 'transparent',
              color: isCurrent ? 'var(--color-bg)' : 'var(--color-text)',
              cursor: places.length > 1 ? 'pointer' : 'default'
            }}
          >
            <span style={styles.emoji}>{meta.emoji}</span>
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  row: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 9px',
    border: '1.5px solid transparent',
    borderRadius: '8px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  emoji: { fontSize: '12px', lineHeight: 1 }
}
