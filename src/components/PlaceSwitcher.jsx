import { useState, useMemo } from 'react'
import { getProgramPlaces, getPlaceMeta } from '../features/programs/registry'
import { useProgramPlace } from '../lib/program-place'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'

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

  // Свёрнуто — только выбранное; раскрыто — выбранное первым, затем остальные
  // (выезжают справа). Одно место — всегда статичная пилюля.
  const ordered = open ? [value, ...places.filter(p => p !== value)] : [value]
  const multi = places.length > 1

  // Вид — как сегмент-контрол мест в конструкторе: контейнер-пилюля (фон/обводка
  // таб-бара), активная позиция залита `surface-active` и покрашена цветом места,
  // неактивные (раскрытые) — серым текстом. Нахлёст -5 + zIndex активного выше.
  return (
    <div style={styles.wrap} onClick={(e) => e.stopPropagation()}>
      <div style={styles.group}>
        {ordered.map((loc, i) => {
          const meta = getPlaceMeta(loc)
          const active = loc === value
          return (
            <button
              key={loc}
              onClick={(e) => (i === 0 ? toggle(e) : pick(e, loc))}
              className="press-tile"
              style={{
                ...styles.item,
                ...(active ? styles.itemActive : {}),
                marginLeft: i === 0 ? 0 : '-5px',
                zIndex: active ? 2 : 1,
                color: active ? meta.color : 'var(--color-text-inactive)',
                cursor: multi ? 'pointer' : 'default'
              }}
            >
              <UiIcon name={meta.icon} size={16} />
              {meta.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  // Hug-обёртка: пилюля по содержимому, не растягивает карточку.
  wrap: { display: 'inline-flex' },
  // Контейнер-таб-бар (как нижний таб-бар / места в конструкторе).
  group: {
    display: 'flex', alignItems: 'center', gap: 0, padding: '3px', width: 'auto',
    background: 'var(--color-surface-dim)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)'
  },
  // Таб места: прозрачный (неактивный) / залитый (активный). Текст+иконка
  // красятся через color (UiIcon наследует currentColor).
  item: {
    position: 'relative',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
    minHeight: '26px', padding: '0 11px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  itemActive: {
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))'
  }
}
