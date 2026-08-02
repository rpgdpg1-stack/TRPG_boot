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

// Пейджинг: порог доводки (доля ширины), быстрый бросок, ось жеста и зазор между
// соседними карточками ленты (такой же, как поля экрана — 16px).
const SWIPE_RATIO = 0.22
const FLICK_PX = 40
const FLICK_MS = 260
const AXIS_LOCK_PX = 6
const SETTLE_MS = 380
// Сколько держится подсветка названия раздела после переключения.
const HEAD_LIT_MS = 1200

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

  // ——— Бесконечное листание: рендерим тройку [пред, текущий, след] ———
  // Лента едет за пальцем, на отпускании доезжает до соседа, после чего тройка
  // мгновенно пересобирается вокруг нового раздела (шва не видно — лента всегда
  // стоит на среднем слайде).
  const viewportRef = useRef(null)
  const [dx, setDx] = useState(0)
  const [settle, setSettle] = useState(null)   // 'next' | 'prev' — идёт доводка
  // Направление последней смены — для въезда названия раздела (сброс по key).
  const [headDir, setHeadDir] = useState(null)
  // Подсветка названия цветом раздела сразу после переключения (гаснет сама).
  const [headLit, setHeadLit] = useState(false)
  const headLitTimer = useRef(null)
  const litUp = () => {
    setHeadLit(true)
    if (headLitTimer.current) clearTimeout(headLitTimer.current)
    headLitTimer.current = setTimeout(() => setHeadLit(false), HEAD_LIT_MS)
  }
  useEffect(() => () => { if (headLitTimer.current) clearTimeout(headLitTimer.current) }, [])
  const settleTimer = useRef(null)
  const drag = useRef({ x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 })
  // Свайп не должен превращаться в тап по карточке (переход в тренировку).
  const swiped = useRef(false)

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  const wrapIdx = (i) => (i + cats.length) % cats.length

  // Доводка до соседа + фиксация нового раздела (память как раньше).
  const slideTo = (dir, withHaptic = true) => {
    if (settle) return
    if (withHaptic) haptic.light()
    setSettle(dir)
    setHeadDir(dir)
    litUp()
    const next = wrapIdx(dir === 'next' ? idx + 1 : idx - 1)
    settleTimer.current = setTimeout(() => {
      setIdx(next)
      setSettle(null)
      const id = CATEGORY_ORDER[next]
      localSet(LAST_CAT_KEY, id)
      cloudSet(LAST_CAT_KEY, id)
    }, SETTLE_MS)
  }

  const selectCat = (id) => {
    setOpen(false)
    const next = idxOfCat(id)
    if (next === idx || settle) return
    // Сосед — доезжаем анимацией, дальний раздел — переключаем сразу.
    if (next === wrapIdx(idx + 1)) { slideTo('next'); return }
    if (next === wrapIdx(idx - 1)) { slideTo('prev'); return }
    haptic.light()
    setHeadDir(next > idx ? 'next' : 'prev')
    litUp()
    setIdx(next)
    localSet(LAST_CAT_KEY, id)
    cloudSet(LAST_CAT_KEY, id)
  }

  const onTouchStart = (e) => {
    // Открыт дропдаун или идёт доводка — жест ленты не начинаем (w:0 глушит move).
    if (open || settle) { drag.current = { x: 0, y: 0, axis: null, w: 0, t0: 0, dx: 0 }; return }
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
    }
    if (d.axis !== 'h') return
    // Краёв нет (кольцо), резинка не нужна — лента идёт 1:1 за пальцем.
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
    d.dx = 0
    setDx(0)
    if (fast || far) slideTo(dist < 0 ? 'next' : 'prev')
  }

  // Название раздела в шапке: во время доводки показываем УЖЕ целевой — так
  // заголовок и карточка встают на место одновременно, без «догоняния».
  const headIdx = settle ? wrapIdx(settle === 'next' ? idx + 1 : idx - 1) : idx
  const headCat = cats[headIdx]

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
            {/* Название и шеврон — ОДНА группа: и въезд при свайпе, и вспышка
                цветом раздела достаются им вместе. Порознь шеврон стоял на месте,
                пока название уезжало, и связь между ними разваливалась. */}
            <span
              key={headIdx}
              className={headDir === 'next' ? 'hslide-in-right' : headDir === 'prev' ? 'hslide-in-left' : undefined}
              style={{
                ...styles.selectorGroup,
                // Вспышка цветом раздела: загорается мгновенно вместе со сменой,
                // гаснет в нейтральный серый плавно (0.6с), чтобы не мигало.
                color: headLit ? headCat.color : 'rgba(255, 255, 255, 0.6)',
                transition: headLit ? 'none' : 'color 0.6s ease'
              }}
            >
              <span style={styles.selectorText}>{headCat.title}</span>
              {/* Шеврон вниз — без него не читалось, что заголовок нажимается.
                  Размер и толщина ровно те же, что у шеврона «Все ›». */}
              <span style={{
                ...styles.selectorChev,
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)'
              }}>
                <ChevronIcon size={16} color="currentColor" />
              </span>
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

      {/* Рамка блока стоит на месте, листается ЕЁ СОДЕРЖИМОЕ (как виджеты iOS):
          тройка [пред, текущий, след] едет внутри, без зазоров и без выезда из-за
          края экрана. Прожимается вся рамка (press-tile), долгое нажатие — меню. */}
      <div
        ref={viewportRef}
        style={styles.viewport}
        className="press-dim"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          style={{
            ...styles.track,
            transform: settle === 'next'
              ? 'translate3d(-200%, 0, 0)'
              : settle === 'prev'
                ? 'translate3d(0px, 0, 0)'
                : `translate3d(calc(-100% + ${dx}px), 0, 0)`,
            // Анимируем ТОЛЬКО доводку: возврат тройки в базу после смены раздела
            // должен быть мгновенным, иначе виден «отскок».
            transition: settle ? `transform ${SETTLE_MS}ms var(--ease-ios)` : 'none'
          }}
        >
          {[wrapIdx(idx - 1), idx, wrapIdx(idx + 1)].map(i => {
            const c = cats[i]
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
                    // Фон и press-эффект живут на рамке блока — карточка внутри
                    // только содержимое, иначе при листании ехал бы и фон.
                    bordered={false}
                    press={false}
                    background="transparent"
                    footer={lastDate ? formatRelative(lastDate) : 'Ещё не начинали'}
                    onToggleFav={() => onToggleFav(c.id, slug)}
                    onOpen={() => guardedOpen(prog, slug)}
                    onDeleted={() => setPinnedTick(t => t + 1)}
                  />
                ) : (
                  // Cold-start: короткий рабочий CTA в цвет раздела. Тап → список
                  // программ раздела; выбранная закрепится здесь. Рамка общая (блок),
                  // своей пунктирной у заглушки больше нет.
                  <div style={styles.pinEmpty}>
                    {/* Нажимается только пилюля, а не весь блок: иначе отклик шёл
                        от пустого поля вокруг и было непонятно, где кнопка.
                        Пунктир в полную силу цвета раздела (был 40% — читался как
                        неактивный) + лёгкая заливка, чтобы область читалась. */}
                    <button
                      className="press-tile"
                      style={{
                        ...styles.pinEmptyPill,
                        border: `1px dashed ${c.color}`,
                        background: `color-mix(in srgb, ${c.color} 8%, transparent)`
                      }}
                      onClick={() => { if (!swiped.current) openSection(c.id) }}
                    >
                      <span style={{ ...styles.pinEmptyPlus, color: c.color }}>＋</span>
                      <span style={styles.pinEmptyText}>Выбрать программу</span>
                    </button>
                  </div>
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
  // Шапка и карточка — ОДНА группа: между ними всего 6px (закон близости),
  // сверху группу отделяет межгрупповой отступ строки недели.
  headRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 'var(--space-15)'
  },
  selectorWrap: { position: 'relative', minWidth: 0 },
  // Селектор — тот же вес, что заголовок секции «Мой прогресс» (Manrope 15/700,
  // 60% белого). Цветная только иконка; «Все ›» справа — того же размера.
  selector: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-2) var(--space-1) var(--space-1)',
    background: 'transparent', border: 'none',
    cursor: 'pointer'
  },
  // Группа «название + шеврон»: цвет задаётся здесь и наследуется обоими,
  // анимация въезда тоже общая.
  selectorGroup: { display: 'inline-flex', alignItems: 'center', gap: '1px', color: 'rgba(255, 255, 255, 0.6)' },
  selectorText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700,
    color: 'inherit', letterSpacing: '0.2px', whiteSpace: 'nowrap'
  },
  // Шеврон раскрытия списка разделов: вниз — закрыт, вверх — открыт.
  selectorChev: {
    display: 'inline-flex', lineHeight: 0, color: 'inherit',
    transition: 'transform 0.22s var(--ease-ios)'
  },
  // Выпадающий список — под селектором.
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 41,
    minWidth: '190px',
    padding: 'var(--space-15)',
    background: 'var(--surface-raised)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-medium)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-05)'
  },
  dropItem: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    width: '100%', padding: 'var(--space-3)',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-small)',
    cursor: 'pointer', textAlign: 'left'
  },
  dropItemText: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700 },
  // Окно ленты: горизонталь ведём сами, вертикаль отдаём нативному скроллу (pan-y).
  // Рамка блока: фон и скругление здесь, содержимое клипается по её краям —
  // листается ВНУТРЕННОСТЬ, сама рамка стоит на месте (как виджеты iOS).
  viewport: {
    overflow: 'hidden', touchAction: 'pan-y',
    background: 'color-mix(in srgb, var(--color-text) 6%, var(--surface-raised))',
    borderRadius: 'var(--radius-card)',
    cursor: 'pointer'
  },
  // Лента внутри рамки: слайды по 100% её ширины, БЕЗ зазоров.
  track: { display: 'flex', alignItems: 'stretch', width: '100%', willChange: 'transform' },
  slide: { width: '100%', flexShrink: 0, display: 'flex' },
  // Обёртка-центровка (не кнопка): нажимается только пилюля внутри.
  pinEmpty: {
    width: '100%', minHeight: '124px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  // Пунктирная пилюля вокруг «＋ Выбрать программу» — в цвет раздела, приглушённо.
  pinEmptyPill: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-pill)',
    cursor: 'pointer'
  },
  pinEmptyPlus: { fontSize: 'var(--text-title-size)', lineHeight: 1 },
  pinEmptyText: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700, color: 'var(--color-text-secondary)' },
  // «Все ›» — компактная ссылка-действие в правом верхнем углу (вход в раздел).
  allLink: {
    flexShrink: 0, minHeight: '44px',
    display: 'inline-flex', alignItems: 'center', gap: '1px',
    padding: '0 var(--space-1) 0 var(--space-3)',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)', fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.2px', whiteSpace: 'nowrap'
  },
  // Шеврон-стрелка «вправо» у «Все» (тот же ChevronIcon, повёрнут).
  chevRight: { display: 'inline-flex', transform: 'rotate(-90deg)', marginLeft: 'var(--space-05)' }
}
