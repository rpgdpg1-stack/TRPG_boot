import { useEffect, useRef, useState } from 'react'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'

/**
 * Свайп влево по карточке → панель действий справа (сейчас везде одно — «Замена»).
 *
 * Общий для карточки дня тренировки (`ExerciseCard`) и строки конструктора
 * программы: жест, геометрия и подсветка обязаны совпадать, поэтому одна копия.
 *
 * - Карточка едет за пальцем ровно на ширину панели, не дальше.
 * - Выделение под пальцем — во ВСЮ высоту карточки, угол как у карточки (`radius`).
 * - Drag-select: нажал на панель — действие подсветилось; ведёшь пальцем — подсветка
 *   ходит между действиями; отпустил на действии — вибро + выполнить; увёл мимо — закрыть.
 * - Открыта одна панель на экран: касание другой карточки или скролл (>14px) закрывают.
 * - Касание по открытой карточке только закрывает панель: клик дальше не идёт
 *   (гасится на погружении, до обработчиков самой карточки).
 *
 * Долгое нажатие и тап остаются у карточки: ей приходит `onOpenChange(open)`
 * (не заводить долгое нажатие на открытой) и `onSwipeStart()` (жест ушёл в свайп —
 * долгое нажатие отменить).
 *
 * @param actions [{ key, icon, color, label, fn }] — пусто → свайпа нет вовсе.
 * @param radius  — CSS-значение угла карточки (например 'var(--radius-card)').
 * @param cell    — ширина плитки действия, px.
 * @param shouldIgnore — () => bool: не начинать жест (идёт ввод веса и т.п.).
 */
const SWIPE_GAP = 8 // = --space-2: от карточки до плитки и от плитки до края

// Реестр закрывашек — открыта одна панель на экран.
const closeFns = new Set()
let openAtScrollY = null
const scrollTopNow = () =>
  (typeof window !== 'undefined' ? (window.scrollY || document.scrollingElement?.scrollTop || 0) : 0)
function closeAll() { closeFns.forEach(fn => fn()); openAtScrollY = null }
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    if (openAtScrollY == null) return
    if (Math.abs(scrollTopNow() - openAtScrollY) > 14) closeAll()
  }, { passive: true })
}

export default function SwipeReveal({
  actions = [], radius, cell = 76, shouldIgnore, onOpenChange, onSwipeStart, children
}) {
  const canSwipe = actions.length > 0
  const panelW = SWIPE_GAP + actions.length * (cell + SWIPE_GAP)

  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [activeAction, setActiveAction] = useState(null)
  const offsetRef = useRef(0)
  const openRef = useRef(false)
  // active — идёт жест, начатый на ЭТОЙ карточке. Без флага движение от касания,
  // которое карточка не видела (поле веса гасит pointerdown), подхватывало бы
  // решение прошлого жеста.
  const swipe = useRef({ x: 0, y: 0, start: 0, active: false, decided: false, swiping: false, suppressClick: false })

  const setOff = (v) => { offsetRef.current = v; setOffset(v) }
  const setOpen = (v) => {
    if (openRef.current === v) return
    openRef.current = v
    onOpenChange?.(v)
  }
  const closePanel = () => { setOpen(false); setDragging(false); setOff(0); openAtScrollY = null; setActiveAction(null) }

  const closeRef = useRef(closePanel)
  closeRef.current = closePanel
  const myCloseFn = useRef(null)
  useEffect(() => {
    const fn = () => closeRef.current?.()
    myCloseFn.current = fn
    closeFns.add(fn)
    return () => closeFns.delete(fn)
  }, [])
  // Открытая панель закрывается касанием В ЛЮБОМ другом месте экрана — шапка,
  // кнопки, ручка перетаскивания той же строки. Слушаем на погружении, чтобы
  // успеть раньше жестов, которые гасят всплытие.
  const outerRef = useRef(null)
  const shown = offset !== 0
  useEffect(() => {
    if (!shown) return
    const onDown = (e) => { if (!outerRef.current?.contains(e.target)) closeRef.current?.() }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [shown])

  const closeOthers = () => { closeFns.forEach(fn => { if (fn !== myCloseFn.current) fn() }) }

  // ── Панель: drag-select ──
  const panelRef = useRef(null)
  const actionDrag = useRef(false)
  const actionIndexAt = (clientX, clientY) => {
    const r = panelRef.current?.getBoundingClientRect()
    if (!r) return null
    if (clientY < r.top - 28 || clientY > r.bottom + 28) return null // увёл вниз/вверх — мимо
    const i = Math.floor(((clientX - r.left) / r.width) * actions.length)
    return Math.max(0, Math.min(actions.length - 1, i))
  }
  const onPanelPointerDown = (e) => {
    e.stopPropagation()
    actionDrag.current = true
    setActiveAction(actionIndexAt(e.clientX, e.clientY))
    try { panelRef.current?.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  }
  const onPanelPointerMove = (e) => {
    if (!actionDrag.current) return
    setActiveAction(actionIndexAt(e.clientX, e.clientY))
  }
  const onPanelPointerUp = (e) => {
    if (!actionDrag.current) return
    actionDrag.current = false
    const i = actionIndexAt(e.clientX, e.clientY)
    setActiveAction(null)
    if (i == null) { closePanel(); return }
    haptic.light()
    closePanel()
    actions[i].fn?.()
  }
  const onPanelPointerCancel = () => { actionDrag.current = false; setActiveAction(null) }

  // ── Слайдер: жест ──
  const onPointerDown = (e) => {
    if (shouldIgnore?.()) return
    swipe.current = { x: e.clientX, y: e.clientY, start: offsetRef.current, active: true, decided: false, swiping: false, suppressClick: false }
    // Касание любой карточки закрывает чужую открытую панель.
    closeOthers()
  }

  const onPointerMove = (e) => {
    const s = swipe.current
    if (!s.active) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.decided) {
      if (canSwipe && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) + 2) {
        s.decided = true; s.swiping = true; setDragging(true)
        onSwipeStart?.()
        // Захват пальца: движения идут сюда, даже если под пальцем уже другой
        // элемент (подсветка возврата, соседняя карточка после перестройки).
        try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
      } else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        s.decided = true; s.swiping = false // вертикаль — это скролл списка
      }
    }
    if (s.swiping) setOff(Math.max(-panelW, Math.min(0, s.start + dx)))
  }

  const onPointerUp = () => {
    const s = swipe.current
    if (!s.active) return
    s.active = false
    if (!s.swiping) return
    setDragging(false)
    const opened = offsetRef.current < -panelW / 2
    setOpen(opened)
    setOff(opened ? -panelW : 0)
    openAtScrollY = opened ? scrollTopNow() : null // старт для микро-скролл защиты
    if (opened) haptic.light()
    s.suppressClick = true
    setTimeout(() => { s.suppressClick = false }, 60)
  }

  // Клик после свайпа или по открытой карточке — не тап по карточке.
  const onClickCapture = (e) => {
    const s = swipe.current
    if (s.suppressClick) { s.suppressClick = false; e.stopPropagation(); return }
    if (openRef.current) { e.stopPropagation(); closePanel() }
  }

  return (
    // Клип по скруглению — только пока карточка сдвинута или едет. В покое
    // панель целиком под карточкой и резать нечего, а постоянный клип срезал бы
    // тень карточки (строка конструктора при перетаскивании приподнимается).
    <div ref={outerRef} style={{ ...styles.outer, borderRadius: radius, overflow: offset !== 0 || dragging ? 'hidden' : 'visible' }}>
      {canSwipe && (
        <div
          ref={panelRef}
          style={{ ...styles.panel, width: `${panelW}px` }}
          aria-hidden={offset === 0}
          onPointerDown={onPanelPointerDown}
          onPointerMove={onPanelPointerMove}
          onPointerUp={onPanelPointerUp}
          onPointerCancel={onPanelPointerCancel}
        >
          {activeAction != null && (
            <div style={{
              ...styles.highlight,
              borderRadius: radius,
              left: `${SWIPE_GAP + activeAction * (cell + SWIPE_GAP)}px`,
              width: `${cell}px`
            }} />
          )}
          {actions.map(a => (
            <div key={a.key} style={styles.action}>
              <UiIcon name={a.icon} size={22} color={a.color} />
              <span style={styles.label}>{a.label}</span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          ...styles.slider,
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.28s var(--ease-ios)',
          touchAction: 'pan-y'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  )
}

const styles = {
  // Панель под слайдером; overflow — инлайном (клип только в движении).
  outer: { position: 'relative' },
  panel: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    display: 'flex',
    alignItems: 'stretch',
    padding: `0 ${SWIPE_GAP}px`,
    gap: `${SWIPE_GAP}px`,
    zIndex: 0
  },
  action: {
    flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    // Панель ловит все pointer-события (drag-select); сами действия — только визуал.
    pointerEvents: 'none',
    position: 'relative', zIndex: 1
  },
  // Выделение во всю высоту карточки: нажал — сразу видно зону, куда попал.
  // Плитка стоит на 8px от края и в скругление обёртки не упирается.
  highlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    background: 'var(--layer-2)',
    pointerEvents: 'none',
    zIndex: 0,
    transition: 'left 0.16s var(--ease-ios)'
  },
  label: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)'
  },
  slider: { position: 'relative', zIndex: 1 }
}
