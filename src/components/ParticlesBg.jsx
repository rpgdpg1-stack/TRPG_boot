import { useEffect, useRef } from 'react'

/**
 * Фоновые пиксельные частицы — тихий поток.
 * 2-3 частицы постоянно появляются снизу и летят вверх с лёгким покачиванием.
 * Размер 2-4px, прозрачность 25-40% (микс для глубины).
 */
export default function ParticlesBg() {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let isActive = true
    const timers = []

    const spawnParticle = () => {
      if (!isActive || !container) return

      const particle = document.createElement('div')

      // Микс размеров: 60% маленьких, 40% побольше
      const isSmall = Math.random() < 0.6
      const size = isSmall ? (Math.random() < 0.5 ? 2 : 3) : 4
      const opacity = isSmall ? 0.25 + Math.random() * 0.15 : 0.30 + Math.random() * 0.15

      // Стартовая позиция — внизу экрана, X случайный
      const startX = Math.random() * 100 // в процентах
      const driftMid = (Math.random() * 30 - 15) + 'px'
      const driftEnd = (Math.random() * 20 - 10) + 'px'
      const duration = 5 + Math.random() * 2 // 5-7 секунд

      particle.style.cssText = `
        position: fixed;
        left: ${startX}%;
        bottom: -10px;
        width: ${size}px;
        height: ${size}px;
        background: var(--color-primary);
        z-index: 0;
        pointer-events: none;
        --particle-opacity: ${opacity};
        --drift-mid: ${driftMid};
        --drift-end: ${driftEnd};
        animation: particleFloatBg ${duration}s linear forwards;
      `

      container.appendChild(particle)

      // Автоудаление через 8 сек (с запасом после анимации)
      const removeTimer = setTimeout(() => particle.remove(), (duration + 1) * 1000)
      timers.push(removeTimer)
    }

    // Запускаем сразу 2 частицы для старта
    spawnParticle()
    setTimeout(spawnParticle, 800)

    // Дальше каждые ~2 секунды появляется новая
    const interval = setInterval(spawnParticle, 2000)

    return () => {
      isActive = false
      clearInterval(interval)
      timers.forEach(clearTimeout)
      // Удаляем все оставшиеся частицы
      container.querySelectorAll('div').forEach(el => el.remove())
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden'
      }}
      aria-hidden="true"
    />
  )
}

/**
 * Утилита для создания "всплеска" частиц из конкретной точки.
 * Используется при тапах на карточки.
 *
 * Пример: spawnBurst(50, 200, 4) — создаёт 4 искры в точке (50, 200) экрана
 */
export function spawnBurst(x, y, count = 4) {
  const burst = document.createElement('div')
  burst.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 50;
  `

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div')
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const distance = 25 + Math.random() * 25
    const burstX = Math.cos(angle) * distance + 'px'
    const burstY = Math.sin(angle) * distance + 'px'

    spark.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 3px;
      height: 3px;
      background: var(--color-primary);
      --burst-x: ${burstX};
      --burst-y: ${burstY};
      animation: particleBurst 0.6s ease-out forwards;
    `
    burst.appendChild(spark)
  }

  document.body.appendChild(burst)
  setTimeout(() => burst.remove(), 800)
}

/**
 * УСИЛЕННЫЙ всплеск для выполнения daily quest.
 * Больше частиц (12 вместо 4), бо́льший радиус, плюс центральная вспышка.
 */
export function spawnQuestBurst(x, y) {
  const burst = document.createElement('div')
  burst.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 50;
  `

  // Центральная вспышка — мягкий glow в эпицентре
  const flash = document.createElement('div')
  flash.style.cssText = `
    position: absolute;
    left: -30px;
    top: -30px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(158, 209, 83, 0.6) 0%, transparent 70%);
    animation: questFlash 0.5s ease-out forwards;
  `
  burst.appendChild(flash)

  // 12 частиц во все стороны
  const count = 12
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div')
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3
    const distance = 35 + Math.random() * 35 // больше радиус чем у обычного burst
    const burstX = Math.cos(angle) * distance + 'px'
    const burstY = Math.sin(angle) * distance + 'px'

    // Размер частиц чуть больше: 3-4px
    const size = 3 + Math.floor(Math.random() * 2)

    spark.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: ${size}px;
      height: ${size}px;
      background: var(--color-primary);
      box-shadow: 0 0 6px var(--color-primary);
      --burst-x: ${burstX};
      --burst-y: ${burstY};
      animation: particleBurst 0.8s ease-out forwards;
    `
    burst.appendChild(spark)
  }

  document.body.appendChild(burst)
  setTimeout(() => burst.remove(), 1000)
}
