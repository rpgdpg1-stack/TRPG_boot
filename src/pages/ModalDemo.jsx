/**
 * Витрина модалки завершения. ТОЛЬКО для разработки.
 *
 * Маршрут подключается в App под `import.meta.env.DEV`, в боевую сборку файл
 * не попадает. Нужен, чтобы посмотреть все состояния модалки глазами, не
 * проходя каждый раз настоящую тренировку: возвращение и рекорды случаются
 * редко, и дожидаться их ради проверки вёрстки нельзя.
 */
import { useState } from 'react'
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
      </div>

      <WorkoutFinishedModal
        key={name}
        durationLabel="48 мин"
        {...CASES[name]}
        onConfirm={() => {}}
      />
    </div>
  )
}
