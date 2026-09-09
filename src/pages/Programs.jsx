import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getPinnedPrograms, getPinnedProgramsSync, togglePinnedProgram } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import { getProgramsByCategory } from '../features/programs/registry'
import { getPrefSync, setPref } from '../lib/prefs'
import ProgramCard from '../components/ProgramCard'
import ScreenTitle from '../components/ScreenTitle'
import Toast from '../components/Toast'

/**
 * Каталог программ — единственный вход из главной («Все программы ›»).
 *
 * Здесь человек ВЫБИРАЕТ программу, а не запускает её: категория — уровень
 * каталога, поэтому «Силовая / Плавание / Кардио / Растяжка» живут тут, а не на
 * стартовом экране. Заменил прежний `/category/:id`: четыре почти одинаковых
 * экрана свелись к одному с переключателем.
 *
 * Устройство: горизонтальные табы сверху (текст + зелёная линия под активным),
 * под ними — вертикальный список программ активной категории. Категория
 * меняется тапом по табу ИЛИ горизонтальным свайпом по списку; таб и контент
 * связаны в обе стороны — свайпнул список, таб доехал сам.
 *
 * Кнопки ▶ на карточках нет намеренно: в каталоге тап по карточке ведёт в
 * программу, а старт — уже оттуда или с главной.
 */

// Раздел, открытый в прошлый раз. Ключ прежний — привычка человека переезжает
// вместе с ним (раньше его помнила карусель разделов на главной).
const LAST_CAT_KEY = 'category-swiper-last'

const idxOfCat = (id) => { const i = CATEGORY_ORDER.indexOf(id); return i >= 0 ? i : 0 }

// Пейджинг: те же пороги, что у карусели на главной — жест один на всё приложение.
const SWIPE_RATIO = 0.22
const FLICK_PX = 40
const FLICK_MS = 260
const AXIS_LOCK_PX = 6
const SETTLE_MS = 380
const RUBBER = 0.33
// Сколько висит тост-подтверждение закрепа.
const TOAST_MS = 1800

// Программы, которых ещё нет: место под раздел видно, но оно честно не обещает
// работать. Переехали из прежнего экрана категории без изменений.
const PLACEHOLDER_PROGRAMS = {
  cardio: [
    { slug: 'running', title: 'Бег', tags: [], available: false, comingSoon: true }
  ],
  pool: [
    { slug: 'cardio-pool', title: 'Кардио план', tags: [], available: false, comingSoon: true }
  ],
  stretch: [
    { slug: 'yoga', title: 'Йога', tags: [], available: false, comingSoon: true }
  ]
}

export default function Programs() {
  const navigate = useNavigate()

  const [idx, setIdx] = useState(() => idxOfCat(getPrefSync(LAST_CAT_KEY, null)))
  const [pinned, setPinned] = useState(() => getPinnedProgramsSync())
  const [toast, setToast] = useState(null)   // null | { text, nonce }
  const toastTimer = useRef(null)
  const [, bump] = useState(0)

  const cats = CATEGORY_ORDER.map(id => ({ id, ...CATEGORY_META[id] }))
  const cat = cats[idx]

  useEffect(() => {
    backButton.setHandler(() => navigate('/'))
    lockVerticalSwipes()
  }, [navigate])

  // Закрепы: догон из базы + событие (закрепить могли на другом устройстве).
  useEffect(() => {
    let cancelled = false
    const apply = () => { if (!cancelled) setPinned(getPinnedProgramsSync()) }
    getPinnedPrograms().then(apply)
    const off = on(EVENTS.PREFS_CHANGED, apply)
    return () => { cancelled = true; off() }
  }, [])

  // ——— Свайп между категориями ———
  const viewportRef = useRef(null)
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const settleTimer = useRef(null)
  const drag = useRef({ x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 })
  const swiped = useRef(false)
  // Полоска табов: активный таб доезжает в видимую зону сам.
  const tabsRef = useRef(null)
  const tabRefs = useRef(new Map())

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  const goTo = (next, withHaptic = true) => {
    if (next < 0 || next > cats.length - 1 || next === idx) return
    if (withHaptic) haptic.light()
    setSettling(true)
    setIdx(next)
    setPref(LAST_CAT_KEY, CATEGORY_ORDER[next])
    settleTimer.current = setTimeout(() => { settleTimer.current = null; setSettling(false) }, SETTLE_MS)
  }

  // Активный таб — в видимую зону полоски. Свайпнул список до «Растяжки» —
  // таб приехал сам, иначе непонятно, где ты находишься.
  useLayoutEffect(() => {
    const el = tabRefs.current.get(cat.id)
    const box = tabsRef.current
    if (!el || !box) return
    const left = el.offsetLeft
    const right = left + el.offsetWidth
    const viewLeft = box.scrollLeft
    const viewRight = viewLeft + box.offsetWidth
    if (left < viewLeft + 16) box.scrollTo({ left: Math.max(left - 16, 0), behavior: 'smooth' })
    else if (right > viewRight - 16) box.scrollTo({ left: right - box.offsetWidth + 16, behavior: 'smooth' })
  }, [cat.id])

  const menuIsOpen = () => document.documentElement.classList.contains('menu-open')

  const onTouchStart = (e) => {
    if (settling || menuIsOpen()) { drag.current = { x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 }; return }
    const t = e.touches[0]
    drag.current = {
      x: t.clientX, y: t.clientY, axis: null,
      w: viewportRef.current?.offsetWidth || 1, t0: Date.now(), dx: 0
    }
  }

  const onTouchMove = (e) => {
    const d = drag.current
    if (!d.w) return
    if (menuIsOpen()) { d.w = 0; d.axis = null; d.dx = 0; setDx(0); return }
    const t = e.touches[0]
    const mx = t.clientX - d.x
    const my = t.clientY - d.y
    if (!d.axis) {
      if (Math.abs(mx) < AXIS_LOCK_PX && Math.abs(my) < AXIS_LOCK_PX) return
      d.axis = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
    }
    if (d.axis !== 'h') return
    const atStart = idx === 0 && mx > 0
    const atEnd = idx === cats.length - 1 && mx < 0
    d.dx = (atStart || atEnd) ? mx * RUBBER : mx
    setDx(d.dx)
  }

  const onTouchEnd = () => {
    const d = drag.current
    if (d.axis !== 'h') { d.axis = null; return }
    const dist = d.dx
    const fast = Date.now() - d.t0 < FLICK_MS && Math.abs(dist) > FLICK_PX
    const far = Math.abs(dist) > d.w * SWIPE_RATIO
    if (Math.abs(dist) > 8) {
      swiped.current = true
      setTimeout(() => { swiped.current = false }, 160)
    }
    d.axis = null
    d.dx = 0
    setDx(0)
    if (fast || far) goTo(dist < 0 ? idx + 1 : idx - 1)
  }

  // ——— Данные активной категории ———
  const realPrograms = getProgramsByCategory(cat.id)
  const placeholders = realPrograms.length === 0
    ? (PLACEHOLDER_PROGRAMS[cat.id] || []).map(p => ({ ...p, category: cat.id }))
    : []
  const programs = [...realPrograms, ...placeholders]
  const hasCustom = realPrograms.some(p => p.source === 'custom')
  const canCreate = cat.id === 'gym'

  const handlePinTap = async (prog) => {
    haptic.medium()
    const nowPinned = await togglePinnedProgram(prog.slug, prog.category || cat.id)
    setPinned(getPinnedProgramsSync())
    // Короткий тост вместо модалки: это подтверждение действия, а не сообщение.
    // Нонс — чтобы повторный тап перезапускал показ, а не игнорировался.
    setToast({ text: nowPinned ? `${prog.title} закреплена` : `${prog.title} откреплена`, nonce: Date.now() })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  const handleCreateTap = () => {
    haptic.light()
    if (canCreate) navigate('/constructor')
  }

  return (
    <div className="page page-enter" style={styles.page}>
      <ScreenTitle>Программы</ScreenTitle>

      {/* Табы категорий: активный — белым текстом с зелёной линией снизу.
          Не чипы: выбран всегда ровно один раздел, а чип читается как фильтр,
          которых можно включить несколько. */}
      <div ref={tabsRef} style={styles.tabs}>
        {cats.map((c, i) => {
          const on = c.id === cat.id
          return (
            <button
              key={c.id}
              ref={el => { if (el) tabRefs.current.set(c.id, el); else tabRefs.current.delete(c.id) }}
              style={{ ...styles.tab, ...(on ? styles.tabOn : null) }}
              onClick={() => goTo(i)}
            >
              {c.title}
              <span style={{ ...styles.tabLine, ...(on ? styles.tabLineOn : null) }} />
            </button>
          )
        })}
      </div>

      {/* Список программ активной категории. Свайп по нему меняет категорию. */}
      <div
        ref={viewportRef}
        style={styles.viewport}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          key={cat.id}
          style={{
            ...styles.list,
            transform: `translate3d(${dx}px, 0, 0)`,
            transition: settling ? `transform ${SETTLE_MS}ms var(--ease-ios)` : 'none'
          }}
        >
          {programs.map(prog => (
            <ProgramCard
              key={prog.slug}
              prog={prog}
              isFav={pinned.includes(prog.slug)}
              onToggleFav={() => handlePinTap(prog)}
              onDeleted={() => bump(n => n + 1)}
              menu
              bordered={false}
              background={pinned.includes(prog.slug) ? 'var(--surface-pinned)' : 'var(--color-card)'}
            />
          ))}

          {/* «Создать» работает только в силовой — конструктор пока умеет её одну.
              В остальных разделах кнопка приглушена: место под функцию видно,
              но она честно не обещает работать. */}
          {(cat.id !== 'gym' || !hasCustom) && (
            <button
              onClick={canCreate ? handleCreateTap : undefined}
              disabled={!canCreate}
              style={{ ...styles.createButton, ...(canCreate ? null : styles.createSoon) }}
              className={canCreate ? 'press-tile' : undefined}
            >
              <span style={styles.createPlus}>＋</span> Создать
            </button>
          )}
        </div>
      </div>

      {/* Тост держится над таб-баром по центру — как подтверждение действия,
          а не как блок в потоке списка. */}
      {toast && (
        <div style={styles.toastWrap}>
          <Toast key={toast.nonce} tone="neutral">{toast.text}</Toast>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { paddingBottom: 'var(--space-6)' },
  // Полоска табов: горизонтальный скролл без полосы прокрутки, края уходят под
  // поля экрана — видно, что список можно листать.
  tabs: {
    display: 'flex', alignItems: 'stretch', gap: 'var(--space-5)',
    overflowX: 'auto', overflowY: 'hidden',
    marginBottom: 'var(--space-5)',
    WebkitOverflowScrolling: 'touch',
    // Полосу прокрутки прячем: край следующего таба и так подсказывает, что
    // ряд листается, а серая линия под текстом спорила бы с зелёной у активного.
    scrollbarWidth: 'none'
  },
  tab: {
    position: 'relative', flexShrink: 0,
    padding: 'var(--space-2) 0 var(--space-3)',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700,
    color: 'var(--color-text-inactive)', letterSpacing: '0.2px', whiteSpace: 'nowrap',
    transition: 'color 0.22s var(--ease-ios)'
  },
  tabOn: { color: 'var(--color-text)' },
  // Линия под активным табом — та же зелёная, что у всех состояний выбора.
  tabLine: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '2px',
    borderRadius: 'var(--radius-pill)', background: 'transparent',
    transition: 'background 0.22s var(--ease-ios)'
  },
  tabLineOn: { background: 'var(--color-primary)' },
  viewport: { overflow: 'hidden', touchAction: 'pan-y' },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', willChange: 'transform' },
  createButton: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    width: '100%', minHeight: '55px', marginTop: 'var(--space-2)',
    background: 'var(--color-card)', border: 'none', borderRadius: 'var(--radius-card)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', cursor: 'pointer'
  },
  createSoon: { opacity: 0.5, cursor: 'default' },
  toastWrap: {
    position: 'fixed', left: 0, right: 0,
    bottom: 'calc(var(--tabbar-height) + var(--tabbar-bottom) + var(--space-4))',
    display: 'flex', justifyContent: 'center',
    zIndex: 60, pointerEvents: 'none'
  },
  createPlus: { fontSize: 'var(--text-title-size)', lineHeight: 1 }
}
