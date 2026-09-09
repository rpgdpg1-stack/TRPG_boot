import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getProgramBySlug } from '../features/programs/registry'
import {
  getActiveDaySync,
  getLastWorkoutDateBySlug,
  getPinnedPrograms,
  getPinnedProgramsSync,
  togglePinnedProgram,
  PINNED_VISIBLE
} from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import { formatRelative } from '../utils/history'
import ChevronIcon from './ChevronIcon'
import ProgramCard from './ProgramCard'

/**
 * Закреплённые программы на главной — карусель.
 *
 * Главный экран отвечает на один вопрос: «что я сейчас запускаю». Поэтому здесь
 * нет ни категорий, ни каталога — только то, что человек сам закрепил, и один
 * вход «Все программы ›» для всего остального.
 *
 * Закрепить можно сколько угодно (лимит «одна на раздел» снят), но в карусели
 * показываем первые `PINNED_VISIBLE` — иначе главная превращается в библиотеку.
 * Свежее впереди: только что закреплённая программа идёт первой (см. storage).
 *
 * Отличие от прежней карусели разделов: список КОНЕЧНЫЙ, кольца нет. Поэтому на
 * краях лента пружинит (резинка), а не перескакивает по кругу.
 */

// Пейджинг: те же пороги, что были у карусели разделов, — жест уже привычен.
const SWIPE_RATIO = 0.22
const FLICK_PX = 40
const FLICK_MS = 260
const AXIS_LOCK_PX = 6
const SETTLE_MS = 380
// Сопротивление за краем списка: палец идёт, лента отстаёт втрое.
const RUBBER = 0.33

export default function PinnedCarousel() {
  const navigate = useNavigate()

  // Первый кадр — синхронно из настроек аккаунта, чтобы карточка не мигала пустой.
  const [slugs, setSlugs] = useState(() => getPinnedProgramsSync())
  const [idx, setIdx] = useState(0)

  // Догоняем из базы и слушаем смену настроек (другое устройство, закреп из
  // каталога). Отписку возвращаем как есть — она снимает слушатель при уходе.
  useEffect(() => {
    let cancelled = false
    const apply = () => { if (!cancelled) setSlugs(getPinnedProgramsSync()) }
    getPinnedPrograms().then(apply)
    const off = on(EVENTS.PREFS_CHANGED, apply)
    return () => { cancelled = true; off() }
  }, [])

  // Программы, которые реально существуют: слаг мог остаться от удалённой своей
  // программы — показывать пустое место вместо карточки нельзя.
  const items = slugs
    .map(slug => ({ slug, prog: getProgramBySlug(slug) }))
    .filter(x => x.prog)
    .slice(0, PINNED_VISIBLE)

  // Список стал короче (открепили последнюю) — не оставляем указатель за краем.
  useEffect(() => {
    setIdx(i => Math.min(i, Math.max(items.length - 1, 0)))
  }, [items.length])

  const viewportRef = useRef(null)
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const settleTimer = useRef(null)
  const drag = useRef({ x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 })
  // Свайп не должен превращаться в тап по карточке (переход в тренировку).
  const swiped = useRef(false)

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  const slideTo = (next) => {
    if (next < 0 || next > items.length - 1 || next === idx) return
    haptic.light()
    setSettling(true)
    setIdx(next)
    settleTimer.current = setTimeout(() => { settleTimer.current = null; setSettling(false) }, SETTLE_MS)
  }

  // Поверх открыто меню (долгое нажатие по карточке) — лента замирает.
  const menuIsOpen = () => document.documentElement.classList.contains('menu-open')

  const onTouchStart = (e) => {
    if (settling || menuIsOpen() || items.length < 2) {
      drag.current = { x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 }
      return
    }
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
    // Ось решаем один раз: вертикаль отдаём нативному скроллу и больше не мешаем.
    if (!d.axis) {
      if (Math.abs(mx) < AXIS_LOCK_PX && Math.abs(my) < AXIS_LOCK_PX) return
      d.axis = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
    }
    if (d.axis !== 'h') return
    // За краем списка — резинка: лента идёт, но втрое медленнее пальца.
    const atStart = idx === 0 && mx > 0
    const atEnd = idx === items.length - 1 && mx < 0
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
    if (fast || far) slideTo(dist < 0 ? idx + 1 : idx - 1)
  }

  const openCatalog = () => { haptic.light(); navigate('/programs') }

  const onUnpin = async (slug) => {
    await togglePinnedProgram(slug)
    setSlugs(getPinnedProgramsSync())
  }

  // Тап по карточке — переход в тренировку; после свайпа тап игнорируем.
  const guardedOpen = (prog, slug) => {
    if (swiped.current) return
    haptic.light()
    if (prog.kind === 'swim') { navigate(`/swim/${slug}`, { state: { fromHome: true } }); return }
    const day = getActiveDaySync(slug) || (prog.data?.days ? Object.keys(prog.data.days)[0] : 'A')
    navigate(`/workout/${slug}/${day}`, { state: { fromHome: true } })
  }

  return (
    <div style={styles.wrap}>
      {/* Рамка блока стоит на месте, листается ЕЁ СОДЕРЖИМОЕ (как виджеты iOS).
          Прожимается вся рамка (press-dim), долгое нажатие по карточке — меню. */}
      <div
        ref={viewportRef}
        style={styles.viewport}
        className="press-dim"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {items.length > 0 ? (
          <div
            style={{
              ...styles.track,
              transform: `translate3d(calc(${-idx * 100}% + ${dx}px), 0, 0)`,
              transition: settling ? `transform ${SETTLE_MS}ms var(--ease-ios)` : 'none'
            }}
          >
            {items.map(({ slug, prog }) => {
              const lastDate = getLastWorkoutDateBySlug(slug)
              return (
                <div key={slug} style={styles.slide}>
                  <ProgramCard
                    prog={prog}
                    menu
                    isFav
                    cta
                    // Фон и press-эффект живут на рамке блока — карточка внутри
                    // только содержимое, иначе при листании ехал бы и фон.
                    bordered={false}
                    press={false}
                    background="transparent"
                    // Двумя строками: подпись объясняет, о чём срок, сам срок —
                    // ответ. «80 дней назад» в одиночку не говорит ни о чём.
                    footer={lastDate
                      ? { label: 'Последняя тренировка', value: formatRelative(lastDate) }
                      : { value: 'Ещё не начинали' }}
                    onToggleFav={() => onUnpin(slug)}
                    onOpen={() => guardedOpen(prog, slug)}
                    onDeleted={() => setSlugs(getPinnedProgramsSync())}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          // Cold-start: закреплённых нет. Короткий рабочий CTA — тап в каталог,
          // выбранная там программа закрепится и встанет сюда.
          <div style={styles.pinEmpty}>
            <button
              className="press-tile"
              style={styles.pinEmptyPill}
              onClick={() => { if (!swiped.current) openCatalog() }}
            >
              <span style={styles.pinEmptyPlus}>＋</span>
              <span style={styles.pinEmptyText}>Выбрать программу</span>
            </button>
          </div>
        )}
      </div>

      {/* Индикатора-точек НЕТ (сентябрь 2026): под карточкой он читался отдельным
          декоративным уровнем «карточка → точки → Все программы» и уводил взгляд
          с главного объекта. О том, что список листается, говорит сам жест.

          Вход в каталог — СЛЕВА, по краю карточки, тихой текстовой ссылкой: это
          редкое действие рядом с частым, и по центру оно спорило бы с карточкой
          за внимание (и ловило случайные тапы). */}
      <button style={styles.allLink} className="press-tile" onClick={openCatalog}>
        Все программы
        <span style={styles.chevRight}><ChevronIcon size={14} color="var(--color-text-secondary)" /></span>
      </button>
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column' },
  // Окно ленты: горизонталь ведём сами, вертикаль отдаём нативному скроллу (pan-y).
  viewport: {
    overflow: 'hidden', touchAction: 'pan-y',
    background: 'var(--surface-pinned)',
    borderRadius: 'var(--radius-card)',
    cursor: 'pointer'
  },
  // Лента внутри рамки: слайды по 100% её ширины, БЕЗ зазоров.
  track: { display: 'flex', alignItems: 'stretch', width: '100%', willChange: 'transform' },
  slide: { width: '100%', flexShrink: 0, display: 'flex' },
  // Высота — та же, что была у заглушки раздела: блок не должен прыгать.
  pinEmpty: {
    width: '100%', minHeight: '124px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  pinEmptyPill: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-pill)',
    border: '1px dashed var(--color-primary)',
    background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
    cursor: 'pointer'
  },
  pinEmptyPlus: { fontSize: 'var(--text-title-size)', lineHeight: 1, color: 'var(--color-primary)' },
  pinEmptyText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)',
    fontWeight: 700, color: 'var(--color-text-secondary)'
  },
  // Вход в каталог — слева, вровень с краем карточки. Горизонтальные паддинги
  // съедены отрицательным margin: зона нажатия остаётся 44px, а текст стоит
  // ровно по краю блока над ним.
  allLink: {
    alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-15)',
    // Своего marginTop НЕТ: зазор до карточки задаёт padding самой кнопки — 12px,
    // шаг «между связанными» по шкале. Раньше стояло ещё --space-4 сверху, и
    // оптически между карточкой и ссылкой выходило 28px — пропасть. Паддинг
    // при этом остаётся: он держит зону нажатия 44px.
    marginLeft: 'calc(-1 * var(--space-3))',
    padding: 'var(--space-3)',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px', whiteSpace: 'nowrap'
  },
  chevRight: { display: 'inline-flex', transform: 'rotate(-90deg)' }
}
