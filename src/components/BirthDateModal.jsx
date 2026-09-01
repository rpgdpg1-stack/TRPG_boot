import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { useScrollLock } from '../lib/use-scroll-lock'
import ActionButton from './ActionButton'

/**
 * Выбор даты рождения — три барабана (день · месяц · год) и кнопка «Готово».
 *
 * ПОЧЕМУ БАРАБАНЫ, А НЕ ПОЛЕ ВВОДА. Дату рождения набирают один раз в жизни, и
 * на мобильной клавиатуре это шесть-восемь тапов с шансом занести «31.02».
 * Барабан не даёт ввести несуществующий день физически: список дней
 * пересобирается под выбранный месяц и год (февраль в високосный год — 29).
 *
 * ПОЧЕМУ НЕ `<input type="date">`. Он открывает СИСТЕМНЫЙ пикер, который живёт
 * по своим правилам темы и языка: внутри Telegram он выглядит чужим элементом
 * и на части Android открывается календарём с листанием по месяцам — искать в
 * нём 1990 год приходится долго.
 *
 * ЗАКРЫТИЕ БЕЗ ВЫБОРА — тап мимо (как в остальных модалках проекта); значение
 * отдаётся только по «Готово», поэтому прокрутка барабанов ничего не меняет,
 * пока человек не подтвердил.
 */

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
]

// Высота строки барабана и сколько строк видно. Пять — нечётное специально:
// у выбранного значения есть соседи сверху и снизу, и видно, куда крутить.
const ITEM = 38
const VISIBLE = 5

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
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)

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
    // (годы кончаются текущим), но день/месяц могли уехать вперёд.
    const выбрана = new Date(`${iso}T00:00:00`)
    if (выбрана.getTime() > Date.now()) { haptic.error(); return }
    haptic.success()
    onPick?.(iso)
  }

  return createPortal(
    <div ref={overlayRef} style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>Дата рождения</div>
        <div style={styles.text}>Возраст посчитаем сами — и будем держать его свежим.</div>

        <div style={styles.wheels}>
          {/* Подсветка выбранной строки — одна на все три барабана: так видно,
              что это одна дата, а не три независимых числа. */}
          <div style={styles.marker} aria-hidden="true" />
          <Wheel items={days} value={day} onChange={setDay} label="День" />
          <Wheel items={MONTHS.map((m, i) => ({ id: i, label: m }))} value={month} onChange={setMonth} label="Месяц" flex={1.4} />
          <Wheel items={years} value={year} onChange={setYear} label="Год" />
        </div>

        <ActionButton variant="accent" size="sm" onClick={готово}>Готово</ActionButton>
      </div>
    </div>,
    document.body
  )
}

/**
 * Один барабан. `items` — числа ИЛИ `{ id, label }`; выбранное значение
 * приходит своим id, а не индексом: у месяцев id — номер, у дней и лет само
 * число, и снаружи удобнее хранить именно его.
 *
 * Прокрутка нативная (`scroll-snap`), а не пересчёт пальца вручную: инерция,
 * доводка и отклик системы уже сделаны браузером и ощущаются как в iOS.
 */
function Wheel({ items, value, onChange, label, flex = 1 }) {
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
    if (Math.abs(el.scrollTop - top) < 2) return
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
      <div style={styles.wheelLabel}>{label}</div>
      <div ref={ref} style={styles.wheel} onScroll={onScroll}>
        <div style={styles.pad} />
        {list.map((it, i) => (
          <div
            key={it.id}
            style={{
              ...styles.item,
              color: i === index ? 'var(--color-text)' : 'var(--color-text-secondary)',
              fontWeight: i === index ? 800 : 500
            }}
          >
            {it.label}
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
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top) + 30px) var(--space-5) var(--space-5)'
  },
  modal: {
    width: '100%', maxWidth: '360px',
    background: 'var(--surface-raised)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    boxShadow: 'var(--shadow-modal)'
  },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-text)', textAlign: 'center'
  },
  text: {
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
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s ease'
  }
}
