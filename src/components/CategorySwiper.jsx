import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/programs/categories'
import { programCountLabel } from '../features/programs/registry'
import UiIcon from './UiIcon'

/**
 * Свайпер разделов на главной — одна карточка-раздел, листается влево/вправо
 * (Силовая → Плавание → Кардио → Растяжка, циклично). Карточка: название сверху,
 * крупная иконка раздела по центру, число программ снизу. Тап → экран раздела.
 *
 * Анимация перехода (по свайпу):
 *  - Название и число — КРОСС-ФЕЙД (старое темнеет/исчезает, новое проявляется).
 *  - Иконка — ВЫЕЗЖАЕТ (не гаснет): старая уезжает за край в сторону свайпа,
 *    новая въезжает с другой стороны. Обе анимации — keyframes в index.css
 *    (`catFade*`, `catIcon*`).
 *
 * На странице «Разделы» остаётся прежний список (`CategoryList`) — этот свайпер
 * только для главной.
 */
const ANIM_MS = 360

export default function CategorySwiper() {
  const navigate = useNavigate()

  // Считаем на каждый рендер: число программ может меняться (свои/от друга).
  const cats = CATEGORY_ORDER.map(id => ({
    id,
    ...CATEGORY_META[id],
    subtitle: id === 'cardio' ? 'Бег' : id === 'stretch' ? 'Йога' : programCountLabel(id),
    soon: id === 'cardio' || id === 'stretch'
  }))

  const [idx, setIdx] = useState(0)
  // anim = { from, dir } во время перехода; null в покое.
  const [anim, setAnim] = useState(null)
  const animTimer = useRef(null)
  const swipe = useRef({ x: null, swiped: false })

  useEffect(() => () => { if (animTimer.current) clearTimeout(animTimer.current) }, [])

  const go = (next, dir) => {
    if (next === idx) return
    haptic.light()
    if (animTimer.current) clearTimeout(animTimer.current)
    setAnim({ from: idx, dir })
    setIdx(next)
    animTimer.current = setTimeout(() => setAnim(null), ANIM_MS)
  }

  const onTouchStart = (e) => { swipe.current.x = e.touches[0].clientX; swipe.current.swiped = false }
  const onTouchEnd = (e) => {
    const startX = swipe.current.x
    swipe.current.x = null
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) < 45) return // это тап, не свайп
    swipe.current.swiped = true
    if (dx < 0) go((idx + 1) % cats.length, 'next')
    else go((idx - 1 + cats.length) % cats.length, 'prev')
    setTimeout(() => { swipe.current.swiped = false }, 120)
  }

  const openCat = () => {
    if (swipe.current.swiped) return
    haptic.light()
    setTimeout(() => navigate(`/category/${cats[idx].id}`), 80)
  }

  return (
    <div style={styles.wrap}>
      <div
        className="press-tile"
        style={styles.card}
        onClick={openCat}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {anim && <Layer cat={cats[anim.from]} role="out" dir={anim.dir} />}
        <Layer cat={cats[idx]} role={anim ? 'in' : 'static'} dir={anim?.dir} />
      </div>

      {/* Точки-индикатор: активная шире и в цвете раздела. */}
      <div style={styles.dots}>
        {cats.map((c, i) => (
          <span
            key={c.id}
            style={{
              ...styles.dot,
              ...(i === idx ? { width: '16px', background: c.color } : null)
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** Один слой карточки (название + иконка + число). role: out | in | static. */
function Layer({ cat, role, dir }) {
  const textAnim = role === 'out' ? 'catFadeOut' : role === 'in' ? 'catFadeIn' : null
  const iconAnim = role === 'static' ? null
    : role === 'out'
      ? (dir === 'next' ? 'catIconOutNext' : 'catIconOutPrev')
      : (dir === 'next' ? 'catIconInNext' : 'catIconInPrev')

  const textStyle = textAnim ? { animation: `${textAnim} ${ANIM_MS}ms ease forwards` } : null

  return (
    <div style={styles.layer}>
      <span style={{ ...styles.title, ...textStyle }}>{cat.title}</span>

      <div style={{ ...styles.iconRow, ...(iconAnim ? { animation: `${iconAnim} ${ANIM_MS}ms var(--ease-ios) forwards` } : null) }}>
        <UiIcon name={cat.iconName} size={52} color={cat.color} />
      </div>

      <span style={{ ...styles.count, ...textStyle }}>
        {cat.subtitle}
        {cat.soon && <span style={styles.soonTag}>Скоро</span>}
      </span>
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  // Карточка-раздел: скругление 33 (radius-card), overflow hidden — иконка клипается
  // по краю при выезде. Фикс. высота — под абсолютные слои перехода.
  card: {
    position: 'relative',
    width: '100%',
    height: '150px',
    borderRadius: 'var(--radius-card)',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    cursor: 'pointer',
    touchAction: 'pan-y'
  },
  // Слой контента — заполняет карточку, вертикально по центру.
  layer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '20px 16px'
  },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    lineHeight: 1,
    textAlign: 'center'
  },
  // Ряд иконки — на всю ширину слоя, иконка по центру; translateX(±100%) уводит её
  // на ширину карточки (за край, клипается overflow карточки).
  iconRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1
  },
  count: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    letterSpacing: '0.5px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  soonTag: {
    display: 'inline-block',
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '9px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '1px'
  },
  dots: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '12px'
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '999px',
    background: 'rgba(255, 255, 255, 0.2)',
    transition: 'width 0.25s var(--ease-ios), background 0.25s ease'
  }
}
