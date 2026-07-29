import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { useOutsideClose } from '../lib/use-outside-close'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import { getProgramBySlug } from '../features/programs/registry'
import { onActiveWorkoutChange } from '../lib/active-workout'
import { getActiveDaySync, toggleFavoriteProgram } from '../lib/storage'
import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { formatRelative } from '../utils/history'
import UiIcon from './UiIcon'
import ChevronIcon from './ChevronIcon'
import ProgramCard from './ProgramCard'

/**
 * Разделы на главной — БЕЗ обёртки-панели (карточка программы не вложена в другую
 * карточку, а идёт во всю ширину экрана).
 *
 * Строка-шапка (одна линия, без рамки, вес заголовка секции — Manrope 15/700,
 * 60% белого): слева селектор
 * «[цветная иконка] Силовая ▾» (тап → выпадающий список разделов), справа «Все ›»
 * (вход в раздел). Ниже — карточка закреплённой программы этого раздела
 * (`ProgramCard`, долгое нажатие → меню; нет закрепа — заглушка).
 *
 * Переключение раздела: селектор ИЛИ листание влево/вправо — лента едет за пальцем
 * (iOS-пейджинг: сопротивление на краях, доводка по броску, `--ease-ios`).
 *
 * Закреплённая программа = `favorite_programs[category]` (CloudStorage, одна на раздел).
 */

const LAST_CAT_KEY = 'category-swiper-last'
const idxOfCat = (id) => { const i = CATEGORY_ORDER.indexOf(id); return i >= 0 ? i : 0 }

// Пейджинг: порог доводки (доля ширины), быстрый бросок и сопротивление на краях.
const SWIPE_RATIO = 0.22
const FLICK_PX = 40
const FLICK_MS = 260
const AXIS_LOCK_PX = 6
const EDGE_RESIST = 0.32

function readPinnedMap() {
  try { return JSON.parse(localGet('favorite_programs') || '{}') || {} } catch { return {} }
}

export default function SectionCarousel() {
  const navigate = useNavigate()

  const [idx, setIdx] = useState(() => idxOfCat(localGet(LAST_CAT_KEY)))
  const [open, setOpen] = useState(false)          // выпадающий список разделов
  const [pinnedTick, setPinnedTick] = useState(0)  // ре-чтение закрепа/последней
  const selectorRef = useRef(null)
  useOutsideClose(selectorRef, open, useCallback(() => setOpen(false), []))

  // Старт/финиш тренировки → перечитать «последнюю» и состояние карточки.
  useEffect(() => onActiveWorkoutChange(() => setPinnedTick(t => t + 1)), [])

  // Догоняем выбранный раздел из облака (кросс-девайс).
  useEffect(() => {
    let alive = true
    cloudGet(LAST_CAT_KEY).then(id => {
      if (alive && id && CATEGORY_ORDER.includes(id)) setIdx(idxOfCat(id))
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const cats = CATEGORY_ORDER.map(id => ({ id, ...CATEGORY_META[id] }))
  const cat = cats[idx]

  const goTo = (next, withHaptic = true) => {
    if (next === idx || next < 0 || next >= cats.length) return
    if (withHaptic) haptic.light()
    setIdx(next)
    const id = CATEGORY_ORDER[next]
    localSet(LAST_CAT_KEY, id)
    cloudSet(LAST_CAT_KEY, id)
  }

  const selectCat = (id) => {
    setOpen(false)
    goTo(idxOfCat(id))
  }

  // ——— Листание влево/вправо: лента едет за пальцем, на отпускании доводится ———
  const viewportRef = useRef(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef({ x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 })
  // Свайп не должен превращаться в тап по карточке (переход в тренировку).
  const swiped = useRef(false)

  const onTouchStart = (e) => {
    // Открыт дропдаун — жест ленты не начинаем (w:0 глушит и последующий move).
    if (open) { drag.current = { x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 }; return }
    const t = e.touches[0]
    drag.current = { x: t.clientX, y: t.clientY, axis: null, w: viewportRef.current?.offsetWidth || 1, t0: Date.now(), dx: 0 }
  }

  const onTouchMove = (e) => {
    const d = drag.current
    if (!d.w) return
    const t = e.touches[0]
    const mx = t.clientX - d.x
    const my = t.clientY - d.y
    // Ось решаем один раз: вертикаль отдаём нативному скроллу и больше не мешаем.
    if (!d.axis) {
      if (Math.abs(mx) < AXIS_LOCK_PX && Math.abs(my) < AXIS_LOCK_PX) return
      d.axis = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
      if (d.axis === 'h') setDragging(true)
    }
    if (d.axis !== 'h') return
    // На крайних разделах лента тянется туго (резинка), как в iOS.
    const atEdge = (idx === 0 && mx > 0) || (idx === cats.length - 1 && mx < 0)
    d.dx = atEdge ? mx * EDGE_RESIST : mx
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
    if (fast || far) goTo(dist < 0 ? idx + 1 : idx - 1)
    d.axis = null
    d.dx = 0
    setDragging(false)
    setDx(0)
  }

  // ——— Данные закрепов по всем разделам (лента рендерит все четыре) ———
  void pinnedTick
  const pinnedMap = readPinnedMap()

  const openSection = (id) => { haptic.light(); navigate(`/category/${id}`) }

  const onToggleFav = async (catId, slug) => {
    if (!slug) return
    await toggleFavoriteProgram(catId, slug)
    setPinnedTick(t => t + 1)
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
      {/* Одна строка: селектор раздела слева, «Все ›» справа. Без рамки и заливки. */}
      <div style={styles.headRow}>
        <div style={styles.selectorWrap} ref={selectorRef}>
          <button
            style={styles.selector}
            className="press-tile"
            onClick={() => { haptic.light(); setOpen(o => !o) }}
            aria-label="Выбрать раздел"
          >
            <UiIcon name={cat.iconName} size={20} color={cat.color} />
            <span style={styles.selectorText}>{cat.title}</span>
            <span style={{ ...styles.selectorChev, transform: open ? 'rotate(180deg)' : 'none' }}>
              <ChevronIcon size={16} color="var(--color-text-secondary)" />
            </span>
          </button>

          {open && (
            <div style={styles.dropdown}>
              {cats.map(c => {
                const on = c.id === cat.id
                return (
                  <button
                    key={c.id}
                    className="press-tile"
                    style={styles.dropItem}
                    onClick={() => selectCat(c.id)}
                  >
                    <UiIcon name={c.iconName} size={22} color={on ? c.color : 'var(--color-text-secondary)'} />
                    <span style={{ ...styles.dropItemText, color: on ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                      {c.title}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          style={styles.allLink}
          className="press-tile"
          onClick={() => openSection(cat.id)}
          aria-label={`Все программы раздела «${cat.title}»`}
        >
          Все
          <span style={styles.chevRight}><ChevronIcon size={16} color="var(--color-text-secondary)" /></span>
        </button>
      </div>

      {/* Лента разделов: одна карточка на экран, листается влево/вправо. */}
      <div
        ref={viewportRef}
        style={styles.viewport}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          style={{
            ...styles.track,
            width: `${cats.length * 100}%`,
            transform: `translate3d(calc(${(-idx * 100) / cats.length}% + ${dx}px), 0, 0)`,
            transition: dragging ? 'none' : 'transform 0.38s var(--ease-ios)'
          }}
        >
          {cats.map(c => {
            const slug = pinnedMap[c.id] || null
            const prog = slug ? getProgramBySlug(slug) : null
            const lastDate = slug ? localGet(`program:${slug}:last_day_date`) : null
            return (
              <div key={c.id} style={styles.slide}>
                {prog ? (
                  <ProgramCard
                    key={slug}
                    prog={prog}
                    menu
                    isFav
                    cta
                    // Как закреплённая карточка внутри раздела: светло-серая заливка
                    // БЕЗ цветной обводки (нитка в цвет раздела на главной убрана).
                    bordered={false}
                    background="color-mix(in srgb, #FFFFFF 6%, var(--surface-raised))"
                    footer={lastDate ? formatRelative(lastDate) : 'Ещё не начинали'}
                    onToggleFav={() => onToggleFav(c.id, slug)}
                    onOpen={() => guardedOpen(prog, slug)}
                    onDeleted={() => setPinnedTick(t => t + 1)}
                  />
                ) : (
                  // Cold-start: заглушка = рабочий CTA в цвет раздела. Тап → список
                  // программ раздела, где выбираешь; выбранная закрепится здесь.
                  <button
                    style={{ ...styles.pinEmpty, border: `1px dashed color-mix(in srgb, ${c.color} 45%, transparent)` }}
                    className="press-tile"
                    onClick={() => { if (!swiped.current) openSection(c.id) }}
                  >
                    <span style={{ ...styles.pinEmptyPlus, color: c.color }}>＋</span>
                    <span style={styles.pinEmptyText}>Выбрать программу</span>
                    <span style={styles.pinEmptyHint}>Появится здесь для быстрого старта</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const styles = {
  // Обёртки-панели больше НЕТ: карточка программы идёт во всю ширину экрана.
  wrap: { display: 'flex', flexDirection: 'column' },
  // Шапка: селектор слева, «Все ›» справа — одна тихая линия, без рамки/заливки.
  headRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '8px'
  },
  selectorWrap: { position: 'relative', minWidth: 0 },
  // Селектор — тот же вес, что заголовок секции «Мой прогресс» (Manrope 15/700,
  // 60% белого). Цветная только иконка; «Все ›» справа — того же размера.
  selector: {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '4px 8px 4px 2px',
    background: 'transparent', border: 'none',
    cursor: 'pointer'
  },
  selectorText: {
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px', whiteSpace: 'nowrap'
  },
  selectorChev: {
    display: 'inline-flex', marginTop: '1px',
    transition: 'transform 0.2s var(--ease-ios)'
  },
  // Выпадающий список — под селектором.
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 41,
    minWidth: '190px',
    padding: '6px',
    background: 'var(--surface-raised)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 'var(--radius-medium)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
    display: 'flex', flexDirection: 'column', gap: '2px'
  },
  dropItem: {
    display: 'flex', alignItems: 'center', gap: '11px',
    width: '100%', padding: '10px 12px',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-small)',
    cursor: 'pointer', textAlign: 'left'
  },
  dropItemText: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 600 },
  // Окно ленты: горизонталь ведём сами, вертикаль отдаём нативному скроллу (pan-y).
  viewport: { overflow: 'hidden', touchAction: 'pan-y' },
  track: { display: 'flex', alignItems: 'stretch', willChange: 'transform' },
  slide: { width: `${100 / CATEGORY_ORDER.length}%`, flexShrink: 0, display: 'flex' },
  pinEmpty: {
    width: '100%',
    minHeight: '124px',
    borderRadius: 'var(--radius-card)',
    background: 'var(--color-card)',
    border: '1px dashed rgba(255, 255, 255, 0.18)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
    cursor: 'pointer'
  },
  pinEmptyPlus: { fontSize: '22px', lineHeight: 1, marginBottom: '2px' },
  pinEmptyText: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' },
  pinEmptyHint: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)' },
  // «Все ›» — компактная ссылка-действие в правом верхнем углу (вход в раздел).
  allLink: {
    flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', gap: '1px',
    padding: '4px 2px 4px 8px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px', whiteSpace: 'nowrap'
  },
  // Шеврон-стрелка «вправо» у «Все» (тот же ChevronIcon, повёрнут).
  chevRight: { display: 'inline-flex', transform: 'rotate(-90deg)', marginLeft: '2px' }
}
