import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { useScrollLock } from '../lib/use-scroll-lock'
import ActionButton from './ActionButton'

/**
 * Нижний лист с барабанами — ОДИН на все выборы «покрути и подтверди»
 * (дата рождения, рост, дальше — вес и обхваты).
 *
 * ПОЧЕМУ ЛИСТ СНИЗУ, А НЕ ОКНО ПО ЦЕНТРУ. Крутят барабан большим пальцем, а он
 * достаёт до низа экрана, а не до его середины. Поэтому пикеры в iOS и в
 * Telegram приезжают снизу — и уезжают тем же жестом, которым пришли.
 *
 * ПОЧЕМУ БАРАБАН, А НЕ ПОЛЕ ВВОДА. Клавиатура в мини-приложении сдвигает весь
 * экран (под это в проекте уже есть костыли с `visualViewport`), а барабан
 * физически не даёт ввести несуществующее: ни 31 февраля, ни рост 1930 см.
 *
 * Значение отдаётся ТОЛЬКО по «Готово»: прокрутка ничего не меняет, пока
 * человек не подтвердил. Тап мимо листа = отмена.
 */

// Высота строки барабана и сколько строк видно. Пять — нечётное специально:
// у выбранного значения есть соседи сверху и снизу, и видно, куда крутить.
export const ITEM = 38
const VISIBLE = 5

export default function WheelSheet({ title, hint, children, onDone, onClose, doneLabel = 'Готово' }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)

  return createPortal(
    <div ref={overlayRef} style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        {/* Полоска-ручка: тот же знак «это лист, его можно закрыть», что в
            Telegram и в нативных шитах. */}
        <div style={styles.grabber} aria-hidden="true" />
        <div style={styles.title}>{title}</div>
        {hint && <div style={styles.hint}>{hint}</div>}

        <div style={styles.wheels}>
          {/* Подсветка выбранной строки — одна на все барабаны листа: так
              видно, что это одно значение, а не несколько независимых. */}
          <div style={styles.marker} aria-hidden="true" />
          {children}
        </div>

        <ActionButton variant="accent" size="sm" onClick={onDone}>{doneLabel}</ActionButton>
      </div>
    </div>,
    document.body
  )
}

/**
 * Один барабан. `items` — числа ИЛИ `{ id, label }`; выбранное значение
 * приходит своим id, а не индексом: у месяцев id — номер, у дней, лет и
 * сантиметров само число, и снаружи удобнее хранить именно его.
 *
 * Прокрутка нативная (`scroll-snap`), а не пересчёт пальца вручную: инерция,
 * доводка и отклик системы уже сделаны браузером и ощущаются как в iOS.
 */
export function Wheel({ items, value, onChange, label, unit, flex = 1 }) {
  const ref = useRef(null)
  const list = items.map(it => (typeof it === 'object' ? it : { id: it, label: String(it) }))
  const index = Math.max(0, list.findIndex(it => it.id === value))
  // Что сейчас под маркером — в ref: отклик обязан сработать РОВНО один раз на
  // переход, а setState асинхронный.
  const текущий = useRef(index)
  const таймер = useRef(null)
  // Когда в последний раз отзывались вибрацией. Барабан года пролетает сотню
  // делений за бросок пальца — тик на каждое превратился бы в дребезг.
  const последнийОтклик = useRef(0)

  // Встаём на выбранное: при открытии — сразу, при смене снаружи (день съехал
  // за короткий месяц) — плавно, чтобы движение было видно.
  const первыйКадр = useRef(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const top = index * ITEM
    if (Math.abs(el.scrollTop - top) < 2) { первыйКадр.current = false; return }
    el.scrollTo({ top, behavior: первыйКадр.current ? 'auto' : 'smooth' })
    текущий.current = index
    первыйКадр.current = false
  }, [index])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const i = Math.max(0, Math.min(list.length - 1, Math.round(el.scrollTop / ITEM)))
    if (i !== текущий.current) {
      текущий.current = i
      const сейчас = Date.now()
      if (сейчас - последнийОтклик.current > 40) {
        последнийОтклик.current = сейчас
        haptic.selection()
      }
    }
    // Значение отдаём, когда прокрутка успокоилась: на каждый кадр это
    // перерисовывало бы соседние барабаны прямо под пальцем.
    clearTimeout(таймер.current)
    таймер.current = setTimeout(() => {
      const it = list[i]
      if (it && it.id !== value) onChange?.(it.id)
    }, 90)
  }

  useEffect(() => () => clearTimeout(таймер.current), [])

  return (
    <div style={{ ...styles.wheelCol, flex }}>
      {/* Строка подписи стоит ВСЕГДА, даже пустая: от её высоты отсчитывается
          маркер выбранной строки, и без неё лента съехала бы из-под него. */}
      <div style={styles.wheelLabel}>{label || ''}</div>
      <div ref={ref} style={styles.wheel} onScroll={onScroll}>
        <div style={styles.pad} />
        {list.map((it, i) => (
          <div
            key={it.id}
            style={{
              ...styles.item,
              color: i === index ? 'var(--color-text)' : 'var(--color-text-secondary)',
              fontWeight: i === index ? 700 : 500
            }}
          >
            {it.label}
            {/* Единица едет ЗА выбранным значением, а не стоит отдельной
                подписью: «193 см» читается как одно число с мерой. */}
            {unit && i === index && <span style={styles.unit}>{unit}</span>}
          </div>
        ))}
        <div style={styles.pad} />
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
    background: 'var(--overlay-scrim)',
    backdropFilter: 'blur(var(--blur-sm))', WebkitBackdropFilter: 'blur(var(--blur-sm))',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
  },
  sheet: {
    width: '100%', maxWidth: '460px',
    background: 'var(--surface-raised)',
    borderTopLeftRadius: 'var(--radius-card)', borderTopRightRadius: 'var(--radius-card)',
    borderTop: '1px solid var(--layer-2)',
    padding: 'var(--space-3) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom))',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    boxShadow: 'var(--shadow-modal)',
    animation: 'sheet-up 0.24s var(--ease-ios)'
  },
  grabber: {
    width: '36px', height: '4px', borderRadius: 'var(--radius-pill)',
    background: 'var(--layer-3)', margin: '0 auto var(--space-2)'
  },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-text)', textAlign: 'center'
  },
  hint: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-text)', color: 'var(--color-text-secondary)',
    textAlign: 'center', lineHeight: 1.4
  },

  wheels: {
    position: 'relative',
    display: 'flex', gap: 'var(--space-2)',
    margin: 'var(--space-3) 0 var(--space-4)'
  },
  // Маркер выбранной строки: ровно по центру барабанов, под цифрами.
  marker: {
    position: 'absolute', left: 0, right: 0,
    // Заголовки барабанов («День») стоят над лентой — маркер отсчитываем от
    // её верха, а не от верха блока.
    top: `calc(var(--space-4) + ${ITEM * 2}px)`,
    height: `${ITEM}px`,
    background: 'var(--color-surface-active)',
    borderRadius: 'var(--radius-small)',
    pointerEvents: 'none'
  },
  wheelCol: { minWidth: 0, display: 'flex', flexDirection: 'column' },
  wheelLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'center',
    height: 'var(--space-4)', lineHeight: '16px'
  },
  wheel: {
    height: `${ITEM * VISIBLE}px`, overflowY: 'auto', overscrollBehavior: 'contain',
    scrollSnapType: 'y mandatory', scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch'
  },
  pad: { height: `${ITEM * Math.floor(VISIBLE / 2)}px` },
  item: {
    height: `${ITEM}px`, scrollSnapAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s ease'
  },
  unit: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    fontWeight: 500, color: 'var(--color-text-secondary)'
  }
}
