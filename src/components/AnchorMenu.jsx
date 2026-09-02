import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import { useScrollLock } from '../lib/use-scroll-lock'

/**
 * Компактное контекст-меню, привязанное к элементу — как нативное iOS/Telegram.
 *
 * - Само меню «стекло» (блюр фона под ним), весь экран НЕ затемняется.
 * - Без «Закрыть» — тап мимо закрывает.
 * - Нажатие на пункт — серая пилюля-подсветка (держишь — есть, убрал — нет).
 * - Выбор протяжкой: палец ведёт по пунктам, подсветка идёт за ним, и КАЖДЫЙ
 *   переход отзывается микро-вибрацией (`haptic.selection`) — как в нативных
 *   меню iOS и в Telegram.
 *
 * Два режима подачи:
 *  - `align='right' + motion='scale'` (по умолчанию) — раскрытие из угла кнопки «⋯».
 *  - `align='center' + motion='drop'` — меню долгого нажатия: по центру под карточкой,
 *    выезжает сверху вниз (как меню чата в Telegram).
 *
 * @param anchorRect — DOMRect якоря (кнопки или карточки), от него позиционируется меню.
 * @param items — [{ key, icon, label, labelColor?, haptic?, onClick } | { divider:true }
 *   | { key, custom: <ReactNode> } — произвольное содержимое (напр. сегмент-контрол)]
 * @param onClose — закрыть (вызывается после анимации сворачивания).
 * @param align — 'right' (к правому краю якоря) | 'center' (по центру) | 'left'
 *   (к левому краю якоря — так открываются меню долгого нажатия).
 * @param gap — зазор между якорем и меню, px.
 * @param motion — 'scale' (раскрытие из угла) | 'drop' (выезд сверху вниз, 200мс).
 */
export default function AnchorMenu({ anchorRect, items, onClose, align = 'right', gap = 10, motion = 'scale' }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [placement, setPlacement] = useState('below')
  const [closing, setClosing] = useState(false)
  const [pressed, setPressed] = useState(null)

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => onClose?.(), motion === 'drop' ? 200 : 170)
  }

  // Только Esc. Скролл фона НЕ лочим через html/body (и position:fixed, и
  // overflow:hidden ломали закреплённую шапку с blur — она дёргалась/улетала).
  // Прокрутку под меню гасим через touch-action:none на оверлее (см. стили) —
  // фон при этом не трогаем, закреп остаётся на месте.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Позиция: меню под якорем с зазором `gap`; по горизонтали — к правому краю
  // якоря (align='right') или по его центру (align='center'). Не влезает вниз — вверх.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !anchorRect) return
    const mw = el.offsetWidth
    const mh = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'center'
      ? anchorRect.left + anchorRect.width / 2 - mw / 2
      : align === 'left'
        ? anchorRect.left
        : anchorRect.right - mw
    left = Math.max(8, Math.min(left, vw - 8 - mw))
    let top = anchorRect.bottom + gap
    let place = 'below'
    if (top + mh > vh - 8) {
      const above = anchorRect.top - gap - mh
      if (above >= 8) { top = above; place = 'above' }
      else top = Math.max(8, vh - 8 - mh)
    }
    setPlacement(place)
    setPos({ top, left })
  }, [anchorRect, align, gap])

  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 250)
    return () => clearTimeout(t)
  }, [])

  // ВЫБОР ПРОТЯЖКОЙ. Палец опускается на меню и, не отрываясь, ведёт по
  // пунктам — подсветка идёт за ним, отпустил над нужным = выбрал. Так же
  // ведут себя контекстные меню в iOS, и так же человек привык после долгого
  // нажатия: палец УЖЕ на экране, отрывать его, чтобы потом ткнуть заново, —
  // лишнее движение.
  //
  // Раньше подсветка гасла на первом же сдвиге пальца, и меню отвечало только
  // на отдельный тап. Отпускание мимо пунктов по-прежнему не выбирает ничего.
  const dragging = useRef(false)
  // Что сейчас под пальцем. Держим В REF, а не сверяемся с состоянием: отклик
  // должен сработать РОВНО один раз на переход, а setState — асинхронный и в
  // dev-режиме прогоняется дважды.
  const hovered = useRef(null)

  /**
   * Подсветить пункт под пальцем и дать МИКРО-ОТКЛИК на каждом переходе.
   *
   * Палец ведёт по меню, подсветка прыгает с пункта на пункт — и каждая граница
   * должна чувствоваться, как в нативных меню iOS и в самом Telegram. Без этого
   * выбор протяжкой приходится контролировать глазами.
   *
   * Уход в пустоту (мимо пунктов) молчит: вибрация означает «под пальцем есть
   * что выбрать», и на пустом месте она сбивала бы с толку.
   */
  const hoverTo = (key) => {
    if (hovered.current === key) return
    hovered.current = key
    if (key) haptic.selection()
    setPressed(key)
  }

  // Какой пункт под этой точкой экрана. Ищем по разметке, а не по координатам
  // из состояния: пункты разной высоты, часть из них — разделители и вставки.
  const keyAtPoint = (x, y) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest?.('[data-menu-key]')?.getAttribute('data-menu-key') || null
  }

  const pick = (key) => {
    const it = items.find(i => i.key === key && !i.divider && !i.custom)
    if (!it) return
    it.haptic === 'medium' ? haptic.medium() : haptic.light()
    requestClose()
    it.onClick?.()
  }

  // Клавиатура: касание целиком обрабатывается протяжкой (см. ниже), а обычного
  // onClick у пунктов НЕТ намеренно. После жеста браузер всё равно шлёт click
  // по элементу, НА КОТОРОМ палец опустился, — даже если увели его за пределы
  // меню и отпустили в пустоте. Из-за этого «передумал» всё равно срабатывало.
  const onItemKey = (it) => (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    it.haptic === 'medium' ? haptic.medium() : haptic.light()
    requestClose()
    it.onClick?.()
  }

  // Обработчики висят на КОНТЕЙНЕРЕ меню, а не на каждом пункте: палец должен
  // переходить между пунктами, а событие при этом принадлежит тому элементу,
  // на котором касание началось.
  const menuDragProps = {
    onPointerDown: (e) => {
      dragging.current = true
      hoverTo(keyAtPoint(e.clientX, e.clientY))
    },
    onPointerMove: (e) => {
      if (!dragging.current) return
      hoverTo(keyAtPoint(e.clientX, e.clientY))
    },
    onPointerUp: (e) => {
      if (!dragging.current) return
      dragging.current = false
      const key = keyAtPoint(e.clientX, e.clientY)
      hovered.current = null
      setPressed(null)
      // Отпустили мимо пунктов (в том числе за пределами меню) — не выбираем.
      if (key) pick(key)
    },
    onPointerCancel: () => { dragging.current = false; hovered.current = null; setPressed(null) }
  }

  // ПРИЗНАК «ПОВЕРХ ЧТО-ТО ОТКРЫТО» для жестовых компонентов под меню.
  // Подложка ловит касания, но жест мог начаться РАНЬШЕ неё: меню открывается
  // долгим нажатием, палец уже лежит на карусели и она успела начать свайп.
  // Дальше карусель получает движения напрямую и едет под открытым меню.
  // Метка на корне даёт ей возможность это заметить и прерваться.
  useEffect(() => {
    document.documentElement.classList.add('menu-open')
    return () => document.documentElement.classList.remove('menu-open')
  }, [])

  const visible = pos && !closing

  // Свёрнутое состояние: 'scale' — схлопывание в угол якоря; 'drop' — меню
  // «выезжает» сверху вниз (или снизу вверх, если развернулось над карточкой).
  const drop = motion === 'drop'
  const hiddenTransform = drop
    ? `translateY(${placement === 'above' ? 12 : -12}px) scale(0.98)`
    : 'scale(0.6)'
  const originX = align === 'center' ? 'center' : align === 'left' ? 'left' : 'right'
  const transformOrigin = `${placement === 'above' ? 'bottom' : 'top'} ${originX}`

  const menu = (
    <div
      ref={overlayRef}
      style={{ ...styles.overlay, pointerEvents: ready ? 'auto' : 'none' }}
      onClick={requestClose}
    >
      <div
        ref={menuRef}
        style={{
          ...styles.menu,
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : hiddenTransform,
          transformOrigin,
          // Выезд по долгому нажатию: 200мс с плавным разгоном и торможением.
          ...(drop ? { transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' } : null)
        }}
        onClick={(e) => e.stopPropagation()}
        {...menuDragProps}
      >
        {items.map((it, i) => it.divider ? (
          <div key={`d${i}`} style={styles.divider} />
        ) : it.custom ? (
          <div key={it.key || `c${i}`} style={styles.custom}>{it.custom}</div>
        ) : (
          <button
            key={it.key}
            data-menu-key={it.key}
            onKeyDown={onItemKey(it)}
            style={{
              ...styles.row,
              background: pressed === it.key ? 'var(--layer-2)' : 'transparent',
              transform: pressed === it.key ? 'scale(0.985)' : 'scale(1)'
            }}
          >
            <span style={styles.icon}>{it.icon}</span>
            <span style={{ ...styles.label, ...(it.labelColor ? { color: it.labelColor } : null) }}>
              {it.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  return createPortal(menu, document.body)
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'transparent',
    // Гасим прокрутку фона, не трогая html/body (иначе ломается закреп).
    touchAction: 'none',
    overscrollBehavior: 'contain',
    zIndex: 9999
  },
  menu: {
    position: 'fixed',
    minWidth: '234px',
    maxWidth: '290px',
    background: 'var(--surface-glass)',
    backdropFilter: 'var(--blur-glass)',
    WebkitBackdropFilter: 'var(--blur-glass)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-15)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-05)',
    boxShadow: 'var(--shadow-raised)',
    transition: 'opacity 0.16s ease, transform 0.17s cubic-bezier(0.2, 0.7, 0.3, 1)'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-3) var(--space-4)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background 0.12s ease, transform 0.1s ease',
    WebkitTapHighlightColor: 'transparent'
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '20px',
    flexShrink: 0,
    lineHeight: 0
  },
  label: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-body-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    whiteSpace: 'nowrap'
  },
  // Произвольное содержимое пункта (сегмент-контрол выбора периода и т.п.).
  custom: { padding: 'var(--space-05)' },
  divider: {
    height: '1px',
    background: 'var(--layer-2)',
    margin: 'var(--space-1) var(--space-2)'
  }
}
