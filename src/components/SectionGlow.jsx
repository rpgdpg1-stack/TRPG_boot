import { useEffect, useRef, useState } from 'react'

// Акцентное свечение фона в цвет раздела: радиальный glow у верхней кромки (по центру)
// + мягкий tinted-градиент, растворяющийся к контенту. Всё приглушённо — «сияние», а
// не заливка. Цвет — токен раздела (cat.color).
//
// Координаты в px внутри glowWrap: верх экрана = y 600 (сверху ещё 600px «запаса» одного
// тона — чтобы при оттягивании/оверскролле не было жёсткой линии, а продолжался тот же
// тон, не ярче). Радиальный пик — ровно на кромке экрана (600).
const glowBg = (c) => `
  radial-gradient(130% 300px at 50% 600px,
    color-mix(in srgb, ${c} 22%, transparent) 0%,
    color-mix(in srgb, ${c} 8%, transparent) 45%,
    transparent 100%),
  linear-gradient(to bottom,
    color-mix(in srgb, ${c} 9%, transparent) 0px,
    color-mix(in srgb, ${c} 9%, transparent) 600px,
    color-mix(in srgb, ${c} 5%, transparent) 780px,
    transparent 1080px)`

// Два слоя — при смене раздела новый цвет плавно проявляется поверх старого
// (кросс-фейд ~360мс, как заезд иконки в карусели). На экране раздела цвет фикс —
// кросс-фейд просто не запускается.
export default function SectionGlow({ color }) {
  const [g, setG] = useState({ a: color, b: color, showA: true })
  const first = useRef(true) // пропускаем первый эффект (стартовый цвет уже показан)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setG(prev => prev.showA
      ? { ...prev, b: color, showA: false }
      : { ...prev, a: color, showA: true })
  }, [color])

  // Красим КОРНЕВОЙ фон (html) в тёмный акцент раздела — его видно при нативном
  // отскоке/оттяге, так зона того же цвета, без чёрной линии. НЕ сбрасываем при
  // размонтировании: иначе уход со старой страницы стирал бы тон, который новая
  // страница только что выставила (при переходе оба смонтированы). Последняя
  // страница со свечением выигрывает; цвет обновляется на каждой такой странице.
  useEffect(() => {
    document.documentElement.style.setProperty('--overscroll-tint', `color-mix(in srgb, ${color} 14%, var(--color-bg))`)
  }, [color])

  return (
    <div style={styles.glowWrap} aria-hidden="true">
      <div style={{ ...styles.glowLayer, background: glowBg(g.a), opacity: g.showA ? 1 : 0 }} />
      <div style={{ ...styles.glowLayer, background: glowBg(g.b), opacity: g.showA ? 0 : 1 }} />
    </div>
  )
}

const styles = {
  // Свечение за контентом (zIndex 0). Начинается на 600px ВЫШЕ страницы — этот «запас»
  // одного тона закрывает область оверскролла/оттягивания (тот же цвет продолжается вверх).
  glowWrap: {
    position: 'absolute',
    top: '-600px',
    left: 0,
    right: 0,
    height: '1120px',
    pointerEvents: 'none',
    zIndex: 0,
    overflow: 'hidden'
  },
  glowLayer: {
    position: 'absolute',
    inset: 0,
    transition: 'opacity 0.36s ease'
  }
}
