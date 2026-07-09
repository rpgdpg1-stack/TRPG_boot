import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import { getProgramBySlug } from '../features/programs/registry'
import { onActiveWorkoutChange } from '../lib/active-workout'
import { getActiveDaySync, toggleFavoriteProgram } from '../lib/storage'
import { localGet, localSet } from '../utils/storage'
import { cloudGet, cloudSet } from '../lib/cloud-storage'
import { formatRelative } from '../utils/history'
import UiIcon from './UiIcon'
import ProgramCard from './ProgramCard'
import SectionPicker from './SectionPicker'

/**
 * Карусель разделов на главной (вместо избранного). Один раздел на экран, свайп
 * влево/вправо (циклично) — тем же заездом, что старый свайпер разделов
 * (иконка выезжает, заголовок кросс-фейдится), точки-пейджер под иконкой.
 * Внутри:
 *  - заголовок раздела (сверху) + КРУПНАЯ иконка + точки;
 *  - «последняя тренировка N назад» по ЗАКРЕПЛЁННОЙ программе раздела;
 *  - сама карточка закреплённой программы (`ProgramCard`, как внутри раздела) —
 *    тап начинает/продолжает; ⋯ → Закрепить/Открепить; если ничего не закреплено —
 *    заглушка «Закрепить программу» (→ экран раздела);
 *  - текст-ссылка «Все программы ⌄» → экран раздела.
 *
 * Закреплённая программа = `favorite_programs[category]` (CloudStorage, одна на раздел).
 */

const ANIM_MS = 360
const LAST_CAT_KEY = 'category-swiper-last'
const idxOfCat = (id) => { const i = CATEGORY_ORDER.indexOf(id); return i >= 0 ? i : 0 }

function readPinnedMap() {
  try { return JSON.parse(localGet('favorite_programs') || '{}') || {} } catch { return {} }
}

export default function SectionCarousel({ onSectionChange }) {
  const navigate = useNavigate()

  const [idx, setIdx] = useState(() => idxOfCat(localGet(LAST_CAT_KEY)))
  const [anim, setAnim] = useState(null) // { from, dir } во время перехода
  const [pinnedTick, setPinnedTick] = useState(0) // ре-чтение закрепа/последней
  const animTimer = useRef(null)
  const swipe = useRef({ x: null, y: null, swiped: false })
  const identityRef = useRef(null)
  const [pickerRect, setPickerRect] = useState(null) // null = закрыт

  // Старт/финиш тренировки → перечитать «последнюю» и состояние карточки.
  useEffect(() => onActiveWorkoutChange(() => setPinnedTick(t => t + 1)), [])
  useEffect(() => () => { if (animTimer.current) clearTimeout(animTimer.current) }, [])

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

  // Сообщаем наверх текущий раздел — для акцентного свечения фона на главной.
  useEffect(() => {
    const id = CATEGORY_ORDER[idx]
    onSectionChange?.({ id, color: CATEGORY_META[id]?.color })
  }, [idx, onSectionChange])

  const go = (next, dir) => {
    if (next === idx) return
    haptic.light()
    if (animTimer.current) clearTimeout(animTimer.current)
    setAnim({ from: idx, dir })
    setIdx(next)
    const id = CATEGORY_ORDER[next]
    localSet(LAST_CAT_KEY, id)
    cloudSet(LAST_CAT_KEY, id)
    animTimer.current = setTimeout(() => setAnim(null), ANIM_MS)
  }

  const onTouchStart = (e) => {
    swipe.current.x = e.touches[0].clientX
    swipe.current.y = e.touches[0].clientY
    swipe.current.swiped = false
  }
  const onTouchEnd = (e) => {
    const startX = swipe.current.x
    const startY = swipe.current.y
    swipe.current.x = null
    swipe.current.y = null
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    const dy = e.changedTouches[0].clientY - startY
    // Не свайп разделов: слишком короткий по X, или жест вертикальный (это скролл).
    if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return
    // Горизонтальный свайп засчитан → жёстко гасим тап по карточке/иконке.
    swipe.current.swiped = true
    if (dx < 0) go((idx + 1) % cats.length, 'next')
    else go((idx - 1 + cats.length) % cats.length, 'prev')
    setTimeout(() => { swipe.current.swiped = false }, 140)
  }

  // Закреплённая программа раздела.
  void pinnedTick
  const pinnedSlug = readPinnedMap()[cat.id] || null
  const pinnedProg = pinnedSlug ? getProgramBySlug(pinnedSlug) : null
  const lastDate = pinnedSlug ? localGet(`program:${pinnedSlug}:last_day_date`) : null
  const lastText = pinnedProg
    ? (lastDate ? `Последняя тренировка · ${formatRelative(lastDate)}` : 'Ещё не начинали')
    : ' '

  const openSection = () => { if (swipe.current.swiped) return; haptic.light(); navigate(`/category/${cat.id}`) }

  // Тап по иконке-идентичности → пикер разделов (как DayPicker в дне).
  const openPicker = () => {
    if (swipe.current.swiped) return
    haptic.light()
    setPickerRect(identityRef.current?.getBoundingClientRect() || null)
  }
  const onPickSection = (id) => {
    const next = idxOfCat(id)
    if (next !== idx) go(next, next > idx ? 'next' : 'prev')
    setPickerRect(null)
  }

  // Открепить/закрепить из ⋯ — перечитать карту закрепов.
  const onToggleFav = async () => {
    if (!pinnedSlug) return
    await toggleFavoriteProgram(cat.id, pinnedSlug)
    setPinnedTick(t => t + 1)
  }

  // Тап по карточке (гард от свайпа) — ProgramCard сам навигирует по своему onOpen.
  const guardedOpen = () => {
    if (swipe.current.swiped) return
    haptic.light()
    if (!pinnedProg) return
    if (pinnedProg.kind === 'swim') { navigate(`/swim/${pinnedSlug}`, { state: { fromHome: true } }); return }
    const day = getActiveDaySync(pinnedSlug) || (pinnedProg.data?.days ? Object.keys(pinnedProg.data.days)[0] : 'A')
    navigate(`/workout/${pinnedSlug}/${day}`, { state: { fromHome: true } })
  }

  return (
    <div style={styles.wrap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Идентичность раздела: заголовок + крупная иконка (заезд как у разделов).
          Тап — пикер разделов (иконки). */}
      <div ref={identityRef} style={styles.identity} onClick={openPicker}>
        {anim && <IdLayer cat={cats[anim.from]} role="out" dir={anim.dir} />}
        <IdLayer cat={cats[idx]} role={anim ? 'in' : 'static'} dir={anim?.dir} />
      </div>

      {/* Точки-пейджер */}
      <div style={styles.dots}>
        {cats.map((c, i) => (
          <span key={c.id} style={{ ...styles.dot, ...(i === idx ? { opacity: 0.65 } : null) }} />
        ))}
      </div>

      {/* Последняя тренировка в разделе (по закреплённой программе).
          Пустая строка (' ') держит зазор, чтобы пейджер не липнул к карточке. */}
      <div style={styles.lastLine}>{lastText}</div>

      {/* Закреплённая программа — сама карточка, как внутри раздела */}
      {pinnedProg ? (
        <ProgramCard
          key={pinnedSlug}
          prog={pinnedProg}
          dots
          isFav
          onToggleFav={onToggleFav}
          onOpen={guardedOpen}
          onDeleted={() => setPinnedTick(t => t + 1)}
        />
      ) : (
        <button style={styles.pinEmpty} className="press-tile" onClick={openSection}>
          <span style={styles.pinEmptyText}>Закрепить программу</span>
          <span style={styles.pinEmptyHint}>Выбери в разделе — она появится здесь</span>
        </button>
      )}

      {/* Все программы — текст-ссылка со стрелкой вниз (на экран раздела) */}
      <button style={styles.allLink} className="tg-row" onClick={openSection}>
        Все программы <span style={styles.chev}>›</span>
      </button>

      {pickerRect && (
        <SectionPicker
          sections={cats}
          currentId={cat.id}
          anchorRect={pickerRect}
          onPick={onPickSection}
          onClose={() => setPickerRect(null)}
        />
      )}
    </div>
  )
}

/** Слой идентичности (заголовок + иконка), анимируется как старый свайпер разделов. */
function IdLayer({ cat, role, dir }) {
  const textAnim = role === 'out' ? 'catFadeOut' : role === 'in' ? 'catFadeIn' : null
  const iconAnim = role === 'static' ? null
    : role === 'out'
      ? (dir === 'next' ? 'catIconOutNext' : 'catIconOutPrev')
      : (dir === 'next' ? 'catIconInNext' : 'catIconInPrev')
  const textStyle = textAnim ? { animation: `${textAnim} ${ANIM_MS}ms ease forwards` } : null

  return (
    <div style={styles.idLayer}>
      <span style={{ ...styles.title, ...textStyle }}>{cat.title}</span>
      <div style={{ ...styles.iconRow, ...(iconAnim ? { animation: `${iconAnim} ${ANIM_MS}ms var(--ease-ios) forwards` } : null) }}>
        <UiIcon name={cat.iconName} size={52} color={cat.color} />
      </div>
    </div>
  )
}

const styles = {
  wrap: { touchAction: 'pan-y' },
  // Идентичность: фикс. высота под абсолютные слои перехода, overflow — клип иконки.
  identity: {
    position: 'relative',
    height: '120px',
    overflow: 'hidden'
  },
  idLayer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px'
  },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: '18px', fontWeight: 700,
    color: 'var(--color-text)', letterSpacing: '0.3px', lineHeight: 1, textAlign: 'center'
  },
  iconRow: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  dots: { display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center', marginTop: '4px' },
  // Тихий пейджер: одинаковые серые кружки, активный лишь чуть ярче.
  // Без акцентного цвета и без вытягивания — не спорит с фокусом на текущем разделе.
  dot: {
    width: '6px', height: '6px', borderRadius: '3px', flexShrink: 0,
    background: 'var(--color-text-secondary)', opacity: 0.25,
    transition: 'opacity 0.2s ease'
  },
  lastLine: {
    minHeight: '16px',
    marginTop: '10px', marginBottom: '12px',
    fontFamily: 'var(--font-manrope)', fontSize: '12.5px', fontWeight: 600,
    color: 'var(--color-text-secondary)', textAlign: 'center'
  },
  pinEmpty: {
    width: '100%',
    // Та же высота, что у ProgramCard (minHeight 130px) — чтобы карусель не «прыгала».
    minHeight: '130px',
    borderRadius: 'var(--radius-card)',
    background: 'var(--surface)',
    border: '1px dashed rgba(255, 255, 255, 0.18)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
    cursor: 'pointer'
  },
  pinEmptyText: { fontFamily: 'var(--font-manrope)', fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' },
  pinEmptyHint: { fontFamily: 'var(--font-manrope)', fontSize: '12px', color: 'var(--color-text-secondary)' },
  allLink: {
    width: '100%',
    marginTop: '12px',
    padding: '10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-medium)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    fontFamily: 'var(--font-manrope)', fontSize: '13px', fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer'
  },
  chev: { fontSize: '17px', lineHeight: 1, marginTop: '-1px' }
}
