/**
 * Витрина модалки завершения. ТОЛЬКО для разработки.
 *
 * Маршрут подключается в App под `import.meta.env.DEV`, в боевую сборку файл
 * не попадает. Нужен, чтобы посмотреть все состояния модалки глазами, не
 * проходя каждый раз настоящую тренировку: возвращение и рекорды случаются
 * редко, и дожидаться их ради проверки вёрстки нельзя.
 */
import { useEffect, useState } from 'react'
import WorkoutFinishedModal from '../components/WorkoutFinishedModal'

const CASES = {
  'Обычная': {},
  'Возвращение': { comebackDays: 32 },
  'Рекорды': {
    records: [
      { name: 'Жим лёжа', value: '50 кг', delta: '5 кг' },
      { name: 'Тяга верхнего блока', value: '105 кг', delta: '2,5 кг' }
    ]
  },
  'Возвращение + рекорды': {
    comebackDays: 32,
    records: [
      { name: 'Жим лёжа', value: '50 кг', delta: '5 кг' },
      { name: 'Тяга верхнего блока', value: '105 кг', delta: '2,5 кг' },
      { name: 'Приседания со штангой', value: '112,5 кг', delta: '2,5 кг' }
    ]
  },
  'Плавание с рекордом': {
    distanceLabel: '850 м',
    records: [{ name: 'Дистанция заплыва', value: '850 м', delta: '100 м' }]
  }
}

export default function ModalDemo() {
  const [name, setName] = useState('Возвращение + рекорды')
  // «Как в жизни» — с настоящими задержками: сохранение (900 мс), потом ответ
  // сервера, потом вторым запросом украшения (ещё 900 мс). Ради этого режима
  // витрина и нужна: очередь появления блоков проверяется только на задержках.
  const [live, setLive] = useState(false)
  const [phase, setPhase] = useState(2)
  useEffect(() => {
    if (!live) { setPhase(2); return }
    setPhase(0)
    const a = setTimeout(() => setPhase(1), 900)
    const b = setTimeout(() => setPhase(2), 1800)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [live, name])
  const c = CASES[name]
  const props = phase >= 2 ? c : { distanceLabel: c.distanceLabel }

  return (
    <div style={{ padding: 'var(--space-4)', paddingTop: 'var(--tg-safe-top)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, position: 'relative', zIndex: 10000 }}>
        {Object.keys(CASES).map((k) => (
          <button
            key={k}
            onClick={() => setName(k)}
            style={{
              padding: '8px 12px', borderRadius: 'var(--radius-pill)', border: 'none',
              background: k === name ? 'var(--color-primary)' : 'var(--color-card)',
              color: k === name ? 'var(--accent-on)' : 'var(--color-text)',
              fontFamily: 'var(--font-manrope)', fontSize: 13, fontWeight: 700
            }}
          >{k}</button>
        ))}
        <button
          onClick={() => setLive(v => !v)}
          style={{
            padding: '8px 12px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--layer-2)',
            background: live ? 'var(--color-surface-active)' : 'transparent',
            color: live ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontFamily: 'var(--font-manrope)', fontSize: 13, fontWeight: 700
          }}
        >Как в жизни (задержки)</button>
      </div>

      <WorkoutFinishedModal
        key={`${name}-${live}`}
        durationLabel="48 мин"
        status={phase === 0 ? 'saving' : 'idle'}
        {...props}
        onConfirm={() => {}}
      />
    </div>
  )
}
