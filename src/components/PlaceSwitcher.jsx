import { useState, useEffect, useMemo } from 'react'
import { getProgramPlaces, getPlaceMeta } from '../features/programs/registry'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { localGet, localSet } from '../utils/storage'
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
 * Выбор живёт по ключу `program-place:<slug>` и используется как «активное место»
 * программы (его потом будет грузить экран тренировки).
 *
 * Тап по переключателю не должен срабатывать как тап по карточке — глушим
 * всплытие (stopPropagation) на всех интеракциях.
 */
export default function PlaceSwitcher({ program, onChange }) {
  const places = useMemo(() => getProgramPlaces(program), [program])
  const key = `program-place:${program?.slug || ''}`
  const placesKey = places.join(',')

  const [value, setValue] = useState(() => {
    const saved = localGet(key)
    return (saved && places.includes(saved)) ? saved : (places[0] || 'gym')
  })
  const [open, setOpen] = useState(false)

  // Догоняем выбор из облака (другое устройство).
  useEffect(() => {
    let alive = true
    cloudGet(key).then(v => {
      if (alive && v && places.includes(v)) setValue(v)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, placesKey])

  // Если выбранное место исчезло (удалили в конструкторе) — откат на первое.
  useEffect(() => {
    if (places.length && !places.includes(value)) setValue(places[0])
  }, [placesKey, value, places])

  if (places.length === 0) return null

  const pick = (e, loc) => {
    e.stopPropagation()
    if (loc !== value) {
      haptic.selection()
      setValue(loc)
      localSet(key, loc)
      cloudSet(key, loc)
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
