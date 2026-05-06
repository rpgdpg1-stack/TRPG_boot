import { useEffect, useState } from 'react'

export default function Loader({ onFinish }) {
  const [dots, setDots] = useState(1)

  useEffect(() => {
    // Анимация точек: 1 → 2 → 3 → 1 → 2 → 3 ...
    const dotsTimer = setInterval(() => {
      setDots(prev => (prev % 3) + 1)
    }, 400)

    // Через 1.8 сек скрываем лоадер
    const finishTimer = setTimeout(onFinish, 1800)

    return () => {
      clearInterval(dotsTimer)
      clearTimeout(finishTimer)
    }
  }, [onFinish])

  return (
    <div style={styles.container}>
      <div style={styles.bicepsWrapper}>
        <span style={styles.biceps} role="img" aria-label="biceps">💪</span>
      </div>

      <div style={styles.text}>
        LOADING<span style={styles.dotsBlock}>{'.'.repeat(dots)}</span>
      </div>

      <style>{`
        @keyframes flexBiceps {
          0%   { transform: rotate(0deg) scale(1); }
          45%  { transform: rotate(-6deg) translateY(-2px) scale(1.06); }
          55%  { transform: rotate(-6deg) translateY(-2px) scale(1.06); }
          100% { transform: rotate(0deg) scale(1); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    gap: '40px'
  },
  bicepsWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '140px',
    height: '140px'
  },
  biceps: {
    fontSize: '96px',
    display: 'block',
    lineHeight: 1,
    // Анимация "напряжения" — медленная, плавная, реалистичная
    animation: 'flexBiceps 1.8s ease-in-out infinite',
    // Точка вращения — нижняя часть (там где предплечье, имитация локтя)
    transformOrigin: '60% 85%',
    // Тонировка эмодзи в светло-бежевый кожный цвет
    // Эмодзи разные на разных платформах — этот фильтр универсально приводит к тёплому бежевому
    filter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)',
    WebkitFilter: 'sepia(0.25) saturate(0.85) brightness(1.05) contrast(1.02)'
  },
  text: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '16px',
    color: 'var(--color-primary)',
    letterSpacing: '3px',
    // Фиксируем ширину чтобы текст не "прыгал" когда меняется количество точек
    minWidth: '140px',
    textAlign: 'left'
  },
  dotsBlock: {
    display: 'inline-block',
    minWidth: '28px',
    textAlign: 'left'
  }
}
