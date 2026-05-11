import { useEffect, useRef } from 'react'

/**
 * Фоновые пиксельные частицы — тихий поток.
 * 2-3 частицы постоянно появляются снизу и летят вверх с лёгким покачиванием.
 *
 * E1-fix: z-index 200 (было 0). Частицы теперь летят поверх sticky-шапки PlayerCard.
 * Слои:
 *   200 — частицы (этот файл)
 *   100 — таб-бар
 *    10 — sticky-шапка на главной
 *     1 — основной контент
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

      const isSmall = Math.random() < 0.6
      const size = isSmall ? (Math.random() < 0.5 ? 2 : 3) : 4
      const opacity = isSmall ? 0.25 + Math.random() * 0.15 : 0.30 + Math.random() * 0.15

      const startX = Math.random() * 100
      const driftMid = (Math.random() * 30 - 15) + 'px'
      const driftEnd = (Math.random() * 20 - 10) + 'px'
      const duration = 5 + Math.random() * 2

      particle.style.cssText = `
        position: fixed;
        left: ${startX}%;
        bottom: -10px;
        width: ${size}px;
        height: ${size}px;
        background: var(--color-primary);
        z-index: 200;
        pointer-events: none;
        --particle-opacity: ${opacity};
        --drift-mid: ${driftMid};
        --drift-end: ${driftEnd};
        animation: particleFloatBg ${duration}s linear forwards;
      `

      container.appendChild(particle)

      const removeTimer = setTimeout(() => particle.remove(), (duration + 1) * 1000)
      timers.push(removeTimer)
    }

    spawnParticle()
    setTimeout(spawnParticle, 800)

    const interval = setInterval(spawnParticle, 2000)

    return () => {
      isActive = false
      clearInterval(interval)
      timers.forEach(clearTimeout)
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
        zIndex: 200,
        overflow: 'hidden'
      }}
      aria-hidden="true"
    />
  )
}

/**
 * Утилита для "всплеска" частиц при тапах на карточки.
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
 * Усиленный всплеск при выполнении буста дня.
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

  const count = 12
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div')
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3
    const distance = 35 + Math.random() * 35
    const burstX = Math.cos(angle) * distance + 'px'
    const burstY = Math.sin(angle) * distance + 'px'
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

/**
 * Пиксельные искорки из горящих огоньков серии (Порция В).
 * Спавнятся при тапе по ряду огоньков (когда стрик 3+).
 * 3 кубика от каждого огонька, медленно плывут вверх и затухают.
 */
export function spawnFireSparks(x, y) {
  const burst = document.createElement('div')
  burst.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 30;
  `

  const colors = ['#FFD700', '#FF8C42', '#FF8C42']
  for (let i = 0; i < 3; i++) {
    const spark = document.createElement('div')
    const offsetX = (Math.random() * 8 - 4) + 'px'
    const driftY = -(20 + Math.random() * 14) + 'px'
    const driftX = (Math.random() * 6 - 3) + 'px'
    const size = 2 + Math.floor(Math.random() * 2)
    const delay = (i * 0.08).toFixed(2) + 's'

    spark.style.cssText = `
      position: absolute;
      left: ${offsetX};
      top: 0;
      width: ${size}px;
      height: ${size}px;
      background: ${colors[i]};
      box-shadow: 0 0 4px ${colors[i]};
      --burst-x: ${driftX};
      --burst-y: ${driftY};
      animation: particleBurst 1.2s ease-out ${delay} forwards;
      opacity: 0;
    `
    burst.appendChild(spark)
  }

  document.body.appendChild(burst)
  setTimeout(() => burst.remove(), 1600)
}
