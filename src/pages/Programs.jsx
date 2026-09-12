import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getPinnedPrograms, getPinnedProgramsSync, togglePinnedProgram } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import { getProgramsByCategory } from '../features/programs/registry'
import ProgramCard from '../components/ProgramCard'
import UiIcon from '../components/UiIcon'
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
 * меняется тапом по табу ИЛИ горизонтальным свайпом ПО ВСЕМУ ЭКРАНУ (не только
 * по списку: под коротким списком остаётся пустое место, и свайп там обязан
 * работать так же). Разделы закольцованы: с «Растяжки» влево — снова «Силовая».
 * Таб и контент связаны в обе стороны — свайпнул список, таб доехал сам.
 *
 * Раздел НЕ запоминается: вход в каталог всегда открывает «Силовую». Каталог —
 * место выбора, и начинаться он должен из одной и той же точки. Исключение —
 * возврат «Назад» из программы: экран программы передаёт свой раздел
 * (`state.cat`), и человек возвращается ровно туда, откуда ушёл.
 *
 * Кнопки ▶ на карточках нет намеренно: в каталоге тап по карточке ведёт в
 * программу, а старт — уже оттуда или с главной.
 */

const idxOfCat = (id) => { const i = CATEGORY_ORDER.indexOf(id); return i >= 0 ? i : 0 }

// Пейджинг: те же пороги, что у карусели на главной — жест один на всё приложение.
const SWIPE_RATIO = 0.22
const FLICK_PX = 40
const FLICK_MS = 260
const AXIS_LOCK_PX = 6
const SETTLE_MS = 380
// Сколько висит тост-подтверждение закрепа.
const TOAST_MS = 1800
// Насколько активный таб крупнее остальных. 1.15 — заметно с одного взгляда и
// при этом не ломает ряд: значок с подписью растут внутри своей доли ширины.
const TAB_ACTIVE_SCALE = 1.15
// Зазор между панелями разделов на переходе = --space-3, шаг между карточками.
// Лента доезжает ровно на ширину экрана ПЛЮС этот зазор, иначе соседний раздел
// встал бы не на своё место и в конце перехода дёрнулся.
const PANEL_GAP = 'var(--space-3)'
const PANEL_STEP = `calc(100% + ${PANEL_GAP})`

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
  const location = useLocation()

  // Раздел на входе: «Силовая», если не сказано иное. `state.cat` приходит
  // только с кнопки «Назад» экрана программы — чтобы вернуться в тот раздел,
  // из которого туда зашли.
  const [idx, setIdx] = useState(() => idxOfCat(location.state?.cat))
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
  // Соседние панели в дереве: только пока идёт жест и доводка.
  const [peek, setPeek] = useState(false)
  // Куда доводим ленту: +1 — к следующему разделу, -1 — к предыдущему,
  // 0/null — возврат на место (жест не дотянули).
  const [commit, setCommit] = useState(0)
  const [settling, setSettling] = useState(false)
  const settleTimer = useRef(null)
  const drag = useRef({ x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0, peek: false })
  const swiped = useRef(false)

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  // Переход к разделу ПО КРУГУ: за «Растяжкой» снова «Силовая», перед
  // «Силовой» — «Растяжка». Список коротким кольцом читается лучше тупика:
  // палец не упирается в невидимую стену на краю.
  // Тап по табу: меняем раздел сразу, лента не едет — жест тут не при чём.
  const goTo = (next, withHaptic = true) => {
    const target = ((next % cats.length) + cats.length) % cats.length
    if (target === idx || settling) return
    if (withHaptic) haptic.light()
    setIdx(target)
  }

  /**
   * Довести ленту до соседнего раздела (dir = ±1) или вернуть на место (0).
   *
   * Панель уезжает под палец, соседняя доезжает до края экрана, и только когда
   * движение закончилось, указатель переставляется, а лента возвращается в
   * нулевую позицию уже без анимации. Для глаза это один непрерывный ход.
   */
  const settleTo = (dir) => {
    setSettling(true)
    setCommit(dir)
    // Возврат: гасим сдвиг СРАЗУ, чтобы лента доехала до нуля этим же
    // движением. Сбрось мы его только по таймеру — она бы висела под пальцем
    // всю анимацию и прыгнула в конце.
    if (!dir) setDx(0)
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null
      if (dir) {
        haptic.light()
        setIdx(i => (((i + dir) % cats.length) + cats.length) % cats.length)
      }
      setCommit(0)
      setDx(0)
      setSettling(false)
      setPeek(false)
    }, SETTLE_MS)
  }

  const menuIsOpen = () => document.documentElement.classList.contains('menu-open')

  // Жест ловим на ВСЁМ экране (см. описание сверху), кроме полоски табов:
  // она листается сама по горизонтали, и один палец не может значить там два
  // разных движения.
  const onTouchStart = (e) => {
    const onTabs = e.target?.closest?.('[data-cat-tabs]')
    if (settling || menuIsOpen() || onTabs) { drag.current = { x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0, peek: false }; return }
    const t = e.touches[0]
    drag.current = {
      x: t.clientX, y: t.clientY, axis: null, peek: false,
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
    // Ось стала горизонтальной — достаём соседей, чтобы их было видно за краем.
    if (!d.peek) { d.peek = true; setPeek(true) }
    // Резинки на краях больше нет: разделы закольцованы, края кончились.
    d.dx = mx
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
    d.peek = false
    // Дотянул — доводим до соседнего раздела, не дотянул — лента возвращается
    // на место тем же движением. Резкого сброса нет ни в одном из случаев.
    settleTo((fast || far) ? (dist < 0 ? 1 : -1) : 0)
  }

  // ——— Данные категории ———
  // Считаем для ЛЮБОЙ категории, а не только активной: во время свайпа соседние
  // панели уже отрисованы и выглядывают из-за края.
  const buildPanel = (catId) => {
    const realPrograms = getProgramsByCategory(catId)
    const placeholders = realPrograms.length === 0
      ? (PLACEHOLDER_PROGRAMS[catId] || []).map(p => ({ ...p, category: catId }))
      : []
    // Закреплённые — наверх списка, среди них позже закреплённая выше (порядок
    // `pinned` = порядок закрепления, свежее первым). Открепил — программа
    // возвращается на своё место в обычном порядке, ничего никуда не «уезжает».
    // Ручного перетаскивания нет: чтобы поднять программу выше, её открепляют и
    // закрепляют заново — правило одно и предсказуемое.
    const all = [...realPrograms, ...placeholders]
    const rank = (prog) => {
      const i = pinned.indexOf(prog.slug)
      return i === -1 ? Infinity : i
    }
    const programs = [...all].sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra === rb) return all.indexOf(a) - all.indexOf(b)   // оба не закреплены — обычный порядок
      return ra - rb
    })
    return {
      programs,
      hasCustom: realPrograms.some(p => p.source === 'custom'),
      canCreate: catId === 'gym'
    }
  }

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

  // Одна панель раздела: карточки + «Создать». Рисуется и для активной
  // категории, и для соседних, которые выглядывают во время свайпа.
  const renderPanel = (c) => {
    const panel = buildPanel(c.id)
    return (
      <>
        {panel.programs.map(prog => (
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
        {(c.id !== 'gym' || !panel.hasCustom) && (
          <button
            onClick={panel.canCreate ? handleCreateTap : undefined}
            disabled={!panel.canCreate}
            style={{ ...styles.createButton, ...(panel.canCreate ? null : styles.createSoon) }}
            className={panel.canCreate ? 'press-tile' : undefined}
          >
            <span style={styles.createPlus}>＋</span> Создать
          </button>
        )}
      </>
    )
  }

  return (
    <div
      className="page page-enter"
      style={styles.page}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <ScreenTitle>Программы</ScreenTitle>

      {/* Табы категорий: значок над названием. Активный — В ЦВЕТЕ СВОЕГО РАЗДЕЛА
          и КРУПНЕЕ остальных; неактивные приглушены и мельче.
          Не чипы: выбран всегда ровно один раздел, а чип читается как фильтр,
          которых можно включить несколько.

          Линии-подчёркивания под активным НЕТ. Цвет раздела уже принят языком
          проекта (эмблема программы, теги, данные), и вместе с размером он
          отвечает на вопрос «где я» дважды — черта была третьим ответом на тот
          же вопрос и превращала полоску в лесенку из подсветок.

          Четыре таба делят ширину поровну и помещаются на экран целиком —
          прокрутки у полоски нет, а с ней ушла и доводка активного таба
          в видимую зону. */}
      <div style={styles.tabs} data-cat-tabs>
        {cats.map((c, i) => {
          const on = c.id === cat.id
          return (
            <button
              key={c.id}
              style={{
                ...styles.tab,
                color: on ? c.color : 'var(--color-text-inactive)',
                // Масштабируем ВНУТРЕННОСТИ, не саму кнопку: её ширина — доля
                // полоски, и растягивать её значило бы двигать соседей.
                // Цвет иконки не задаём пропом: UiIcon наследует currentColor,
                // и он переливается вместе с текстом, а не переключается рывком.
                transform: on ? `scale(${TAB_ACTIVE_SCALE})` : 'scale(1)'
              }}
              onClick={() => goTo(i)}
            >
              <UiIcon name={c.iconName} size={22} />
              <span style={styles.tabTitle}>{c.title}</span>
            </button>
          )
        })}
      </div>

      {/* Списки программ. Едет лента, а жест ловит вся страница.

          Соседние разделы висят ВПРИТЫК слева и справа и выглядывают из-за края,
          пока палец ведёт ленту: видно, куда попадёшь, и недотянутый жест честно
          возвращается назад. Они позиционированы абсолютно и поэтому НЕ влияют
          на высоту — иначе страница всегда была бы ростом с самый длинный раздел
          и под коротким «Кардио» болталась пустая прокрутка.

          Рисуем их только на время жеста и доводки: в покое лишние две панели
          держать в дереве незачем. */}
      <div ref={viewportRef} style={styles.viewport}>
        <div
          style={{
            ...styles.track,
            transform: commit
              ? `translate3d(calc(${commit > 0 ? '-1 * ' : ''}${PANEL_STEP}), 0, 0)`
              : `translate3d(${dx}px, 0, 0)`,
            transition: settling ? `transform ${SETTLE_MS}ms var(--ease-ios)` : 'none'
          }}
        >
          {peek && (
            <div style={{ ...styles.sidePanel, right: PANEL_STEP }} aria-hidden="true">
              {renderPanel(cats[(idx - 1 + cats.length) % cats.length])}
            </div>
          )}

          <div style={styles.list}>{renderPanel(cat)}</div>

          {peek && (
            <div style={{ ...styles.sidePanel, left: PANEL_STEP }} aria-hidden="true">
              {renderPanel(cats[(idx + 1) % cats.length])}
            </div>
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
  // pan-y на всей странице: вертикаль остаётся нативным скроллом, горизонталь
  // ведём сами — иначе браузер (и жест «назад» в Telegram) перехватывал бы её.
  // Колонка на всю свободную высоту .app: список внизу растягивается, и пустое
  // место под коротким перечнем программ тоже ловит свайп разделов, а не
  // остаётся мёртвой зоной. touch-action НЕ ставим на страницу целиком: он
  // пересекается по всей ветке и заодно запретил бы полоске табов ездить
  // горизонтально — держим его на самом списке.
  page: {
    paddingBottom: 'var(--space-6)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 'calc(100dvh - var(--tabbar-height) - var(--tabbar-bottom) - 60px)'
  },
  // Полоска табов: четыре равные доли ширины экрана, без прокрутки.
  tabs: {
    display: 'flex', alignItems: 'stretch',
    marginBottom: 'var(--space-5)'
  },
  // Таб — колонка «значок над названием». Ширину делят поровну: разделов ровно
  // четыре, и разная ширина читалась бы как разная важность.
  tab: {
    position: 'relative', flex: 1, minWidth: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-15)',
    padding: 'var(--space-2) var(--space-1) var(--space-3)',
    background: 'transparent', border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    // Цвет и размер переливаются одним движением — без рывка на переключении.
    transition: 'color 0.22s var(--ease-ios), transform 0.26s var(--ease-ios)'
  },
  tabTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    letterSpacing: '0.2px', whiteSpace: 'nowrap', color: 'inherit'
  },
  viewport: { overflow: 'hidden', touchAction: 'pan-y', flex: 1 },
  // Лента: едет она, высоту ей задаёт ТОЛЬКО активная панель.
  track: { position: 'relative', willChange: 'transform' },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  // Соседний раздел — за краем активного, вне потока: высоту не меняет.
  // Между панелями тот же зазор, что между карточками (PANEL_GAP): без него
  // на переходе два раздела слипались бы в один список.
  sidePanel: {
    position: 'absolute', top: 0, width: '100%',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)'
  },
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
