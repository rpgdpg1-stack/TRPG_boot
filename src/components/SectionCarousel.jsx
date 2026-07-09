import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import { getProgramBySlug } from '../features/programs/registry'
import { getActiveWorkout, onActiveWorkoutChange } from '../lib/active-workout'
import { getActiveDaySync } from '../lib/storage'
import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { formatRelative } from '../utils/history'
import UiIcon from './UiIcon'
import ActionButton from './ActionButton'

/**
 * Карусель разделов на главной — вместо избранного. Одна карточка-раздел
 * (Силовая → Плавание → Кардио → Растяжка), листается свайпом влево/вправо
 * (циклично), точки-пейджер под заголовком. Внутри карточки:
 *  - эмблема раздела + заголовок;
 *  - «последняя тренировка N дней назад» по ЗАКРЕПЛЁННОЙ программе раздела;
 *  - крупная кнопка быстрого действия: Продолжить / Начать / Закрепить программу;
 *  - ряд: «Все программы» (→ экран раздела) и «＋ Создать» (→ конструктор).
 *
 * «Закреплённая программа» раздела = запись `favorite_programs[category]`
 * (одна на раздел). Меняется через «⋯ → Закрепить» на карточке программы.
 */

const LAST_CAT_KEY = 'category-swiper-last'
const idxOfCat = (id) => { const i = CATEGORY_ORDER.indexOf(id); return i >= 0 ? i : 0 }

function readPinnedMap() {
  try { return JSON.parse(localGet('favorite_programs') || '{}') || {} } catch { return {} }
}

export default function SectionCarousel() {
  const navigate = useNavigate()

  const [idx, setIdx] = useState(() => idxOfCat(localGet(LAST_CAT_KEY)))
  const [slideDir, setSlideDir] = useState(null) // 'left' | 'right' | null
  const [active, setActive] = useState(getActiveWorkout)
  const swipe = useRef({ x: null, swiped: false })

  useEffect(() => onActiveWorkoutChange(() => setActive(getActiveWorkout())), [])

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
  const soon = cat.id === 'cardio' || cat.id === 'stretch'

  const go = (next, dir) => {
    if (next === idx) return
    haptic.light()
    setSlideDir(dir === 'next' ? 'right' : 'left')
    setIdx(next)
    const id = CATEGORY_ORDER[next]
    localSet(LAST_CAT_KEY, id)   // мгновенно
    cloudSet(LAST_CAT_KEY, id)   // кросс-девайс
  }

  const onTouchStart = (e) => { swipe.current.x = e.touches[0].clientX; swipe.current.swiped = false }
  const onTouchEnd = (e) => {
    const startX = swipe.current.x
    swipe.current.x = null
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) < 45) return
    swipe.current.swiped = true
    if (dx < 0) go((idx + 1) % cats.length, 'next')
    else go((idx - 1 + cats.length) % cats.length, 'prev')
    setTimeout(() => { swipe.current.swiped = false }, 120)
  }

  // Закреплённая программа раздела + её состояние.
  const pinnedSlug = readPinnedMap()[cat.id] || null
  const pinnedProg = pinnedSlug ? getProgramBySlug(pinnedSlug) : null
  const isActiveHere = !!active && pinnedSlug && active.programId === pinnedSlug
  const lastDate = pinnedSlug ? localGet(`program:${pinnedSlug}:last_day_date`) : null

  const openWorkout = (slug, day) => {
    if (getProgramBySlug(slug)?.kind === 'swim') navigate(`/swim/${slug}`, { state: { fromHome: true } })
    else navigate(`/workout/${slug}/${day}`, { state: { fromHome: true } })
  }

  const onPrimary = () => {
    if (swipe.current.swiped) return
    haptic.light()
    if (soon) return
    if (isActiveHere) { openWorkout(pinnedSlug, active.day); return }
    if (pinnedProg) {
      const day = getActiveDaySync(pinnedSlug) || (pinnedProg.data?.days ? Object.keys(pinnedProg.data.days)[0] : 'A')
      openWorkout(pinnedSlug, day)
      return
    }
    navigate(`/category/${cat.id}`) // ничего не закреплено → выбрать программу
  }

  const primaryLabel = soon ? 'Скоро'
    : isActiveHere ? 'Продолжить'
    : pinnedProg ? 'Начать тренировку'
    : 'Закрепить программу'

  const daysLine = !pinnedProg ? (soon ? 'Раздел скоро появится' : 'Ничего не закреплено')
    : lastDate ? `Последняя тренировка · ${formatRelative(lastDate)}`
    : 'Ещё не начинали'

  return (
    <div style={styles.wrap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div
        key={idx}
        className={slideDir === 'right' ? 'hslide-in-right' : slideDir === 'left' ? 'hslide-in-left' : undefined}
        style={styles.card}
      >
        {/* Шапка раздела: эмблема + название */}
        <div style={styles.head}>
          <UiIcon name={cat.iconName} size={30} color={cat.color} />
          <span style={styles.title}>{cat.title}</span>
        </div>

        {/* Точки-пейджер */}
        <div style={styles.dots}>
          {cats.map((c, i) => (
            <span key={c.id} style={{ ...styles.dot, ...(i === idx ? { background: cat.color, opacity: 1 } : null) }} />
          ))}
        </div>

        <div style={styles.daysLine}>{daysLine}</div>

        {/* Большая кнопка быстрого действия */}
        <ActionButton
          onClick={onPrimary}
          disabled={soon}
          variant={soon ? 'dim' : (pinnedProg || isActiveHere) ? 'accent' : 'neutral'}
          style={{ width: '100%', marginTop: '4px' }}
        >
          {pinnedProg && !soon && !isActiveHere ? `Начать · ${progTitle(pinnedProg)}` : primaryLabel}
        </ActionButton>

        {/* Ряд: Все программы + Создать */}
        <div style={styles.row}>
          <button
            style={styles.smallBtn}
            className="press-tile"
            onClick={() => { if (swipe.current.swiped) return; haptic.light(); navigate(`/category/${cat.id}`) }}
          >
            Все программы
          </button>
          <button
            style={styles.smallBtn}
            className="press-tile"
            onClick={() => { if (swipe.current.swiped) return; haptic.light(); navigate('/constructor') }}
          >
            <span style={styles.plus}>＋</span> Создать
          </button>
        </div>
      </div>
    </div>
  )
}

// Имя закреплённой программы: кастомную — как ввёл юзер, встроенную — Первая заглавная.
function progTitle(prog) {
  if (!prog?.title) return ''
  return prog.source === 'custom' ? prog.title : prog.title.charAt(0).toUpperCase() + prog.title.slice(1).toLowerCase()
}

const styles = {
  wrap: { touchAction: 'pan-y' },
  card: {
    position: 'relative',
    width: '100%',
    borderRadius: 'var(--radius-card)',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    padding: '18px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px'
  },
  head: { display: 'flex', alignItems: 'center', gap: '10px' },
  title: {
    fontFamily: 'var(--font-manrope)', fontWeight: 700, fontSize: '18px',
    color: 'var(--color-text)', letterSpacing: '0.3px', lineHeight: 1
  },
  dots: { display: 'flex', gap: '6px', alignItems: 'center' },
  dot: {
    width: '6px', height: '6px', borderRadius: '50%',
    background: 'var(--color-text-secondary)', opacity: 0.35,
    transition: 'opacity 0.2s ease, background 0.2s ease'
  },
  daysLine: {
    fontFamily: 'var(--font-manrope)', fontSize: '12.5px', fontWeight: 600,
    color: 'var(--color-text-secondary)', textAlign: 'center'
  },
  row: { display: 'flex', gap: '10px', width: '100%' },
  smallBtn: {
    flex: 1,
    minHeight: '44px',
    borderRadius: 'var(--radius-medium)',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid var(--border-hairline)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    cursor: 'pointer'
  },
  plus: { fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }
}
