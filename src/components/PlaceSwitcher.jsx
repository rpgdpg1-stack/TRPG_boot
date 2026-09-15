import { useMemo, useRef, useState } from 'react'
import { getProgramPlaces, getPlaceMeta } from '../features/programs/registry'
import { useProgramPlace } from '../lib/program-place'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'
import AnchorMenu from './AnchorMenu'

/**
 * Переключатель места тренировки (Зал/Дом/Улица) — общий для карточек программы
 * (главная, избранное, силовая).
 *
 * Показывает тег выбранного места (иконка + подпись, цвет по месту). Если у
 * программы заполнено несколько мест — тап по тегу раскрывает список остальных
 * ВНИЗ (непрозрачное меню), выбор запоминается (prefs аккаунта) пока юзер
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
export default function PlaceSwitcher({ program, value: cValue, onChange, locked = false, tag = false }) {
  const places = useMemo(() => getProgramPlaces(program), [program])
  const [iValue, iSet] = useProgramPlace(program?.slug || '', places)
  const [menuRect, setMenuRect] = useState(null)
  const pillRef = useRef(null)

  const controlled = cValue != null
  const value = controlled ? cValue : iValue

  if (places.length === 0) return null

  const meta = getPlaceMeta(value)

  // Статичный тег (карточки главной/избранного): только показываем выбранное место
  // (его выбирают ВНУТРИ тренировки), без тапа.
  if (tag) {
    return (
      <span style={{ ...styles.pill, color: meta.color }} onClick={(e) => e.stopPropagation()}>
        <UiIcon name={meta.icon} size={16} />
        {meta.label}
      </span>
    )
  }

  const multi = places.length > 1 && !locked
  const stop = (e) => e.stopPropagation()

  const pick = (loc) => {
    if (locked || loc === value) return
    haptic.selection()
    if (!controlled) iSet(loc)
    onChange?.(loc)
  }

  const toggle = (e) => {
    e.stopPropagation()
    // locked (идёт тренировка) — место менять нельзя, тег статичный.
    if (!multi) return
    haptic.light()
    setMenuRect(pillRef.current?.getBoundingClientRect() || null)
  }

  // Список — только ДРУГИЕ места: текущее и так написано на пилюле над ним,
  // повторять его пунктом было бы выбором «того же самого».
  const items = places
    .filter(loc => loc !== value)
    .map(loc => {
      const m = getPlaceMeta(loc)
      return {
        key: loc,
        icon: <span style={{ color: m.color, display: 'inline-flex' }}><UiIcon name={m.icon} size={18} /></span>,
        label: m.label,
        onClick: () => pick(loc)
      }
    })

  // Пилюля остаётся на месте и в том же виде; тап раскрывает список ВНИЗ под
  // ней. Раньше варианты выезжали вправо второй пилюлей внутри контейнера с
  // обводкой — налезали на таймер и читались как ещё один ряд тегов.
  // Меню — общий AnchorMenu (портал поверх экрана: шапка дня обрезает всё, что
  // выходит за её край), в непрозрачном варианте, чтобы текст под ним не мешал.
  return (
    <>
      <button
        ref={pillRef}
        onClick={toggle}
        className={multi ? 'press-tile' : undefined}
        style={{ ...styles.pill, ...styles.pillButton, color: meta.color, cursor: multi ? 'pointer' : 'default' }}
      >
        <UiIcon name={meta.icon} size={16} />
        {meta.label}
      </button>
      {menuRect && (
        // Обёртка глушит всплытие: события из портала идут по дереву React
        // к родителям, и тап мимо меню срабатывал бы как тап по шапке дня.
        <span onClick={stop} onPointerDown={stop} onTouchStart={stop}>
        <AnchorMenu
          anchorRect={menuRect}
          items={items}
          onClose={() => setMenuRect(null)}
          align="left"
          motion="drop"
          surface="solid"
          gap={6}
          minWidth={150}
        />
        </span>
      )}
    </>
  )
}

const styles = {
  // Пилюля места — одна и та же в карточке и в шапке дня: заливка активного
  // сегмента, цвет по месту, БЕЗ обводки и контейнера вокруг.
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
    minHeight: '26px', padding: '0 var(--space-3)',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--color-surface-active)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-label-size)', letterSpacing: '0.5px',
    whiteSpace: 'nowrap'
  },
  pillButton: { border: 'none', WebkitTapHighlightColor: 'transparent' }
}
