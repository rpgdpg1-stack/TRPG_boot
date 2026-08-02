import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { localGet, localSet } from '../utils/storage'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, TextField, SoonNote } from '../components/FormControls'

/**
 * Цель — зачем человек тренируется.
 *
 * Выбор ОДИН и крупный: цель определяет и подсказки по весам, и то, как читать
 * прогресс (при сушке падающий вес — успех, при массе — наоборот). Поэтому это
 * не строка настройки, а карточки во всю ширину: решение важное и редкое.
 *
 * Целевой вес показываем только там, где он осмыслен — для «поддерживать
 * форму» и «стать сильнее» он лишний и только путал бы.
 */
const KEY = 'training-goal'

const GOALS = [
  { id: 'mass',      title: 'Набрать массу',    hint: 'Профицит калорий, рост весов в базовых' },
  { id: 'cut',       title: 'Сбросить вес',     hint: 'Дефицит калорий, сохранить силу' },
  { id: 'strength',  title: 'Стать сильнее',    hint: 'Прогрессия нагрузки без цели по весу' },
  { id: 'keep',      title: 'Поддерживать форму', hint: 'Регулярность важнее рекордов' }
]

const NEEDS_TARGET = new Set(['mass', 'cut'])

export default function Goal() {
  const navigate = useNavigate()
  const [state, setState] = useState(() => {
    try { return JSON.parse(localGet(KEY) || '{}') } catch { return {} }
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const save = (next) => { setState(next); localSet(KEY, JSON.stringify(next)) }

  const pick = (id) => {
    if (id === state.goal) return
    haptic.selection()
    save({ ...state, goal: id })
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Цель</ScreenTitle>

      <SectionLabel>Что хочешь достичь</SectionLabel>
      <div style={styles.list}>
        {GOALS.map((g) => {
          const active = g.id === state.goal
          return (
            <button
              key={g.id}
              className="press-tile"
              onClick={() => pick(g.id)}
              style={{ ...styles.card, ...(active ? styles.cardActive : null) }}
            >
              <span style={styles.cardText}>
                <span style={{ ...styles.cardTitle, color: active ? 'var(--color-primary)' : 'var(--color-text)' }}>
                  {g.title}
                </span>
                <span style={styles.cardHint}>{g.hint}</span>
              </span>
              <span style={{ ...styles.radio, ...(active ? styles.radioOn : null) }} />
            </button>
          )
        })}
      </div>

      {NEEDS_TARGET.has(state.goal) && (
        <>
          <SectionLabel style={{ marginTop: 'var(--space-6)' }}>Ориентир</SectionLabel>
          <FormCard>
            <TextField
              label="Целевой вес" unit="кг" inputMode="decimal"
              value={state.targetWeight} placeholder="—"
              onChange={(v) => save({ ...state, targetWeight: String(v).replace(/[^\d.,]/g, '').replace(',', '.').slice(0, 5) })}
            />
          </FormCard>
        </>
      )}

      <SoonNote>
        Цель пока только запоминается. Дальше по ней будут настраиваться
        подсказки по весам и то, как считается прогресс на экране статистики.
      </SoonNote>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  card: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
    padding: 'var(--space-4)', minHeight: '64px', width: '100%', textAlign: 'left',
    background: 'var(--color-card)', border: '1px solid transparent',
    borderRadius: 'var(--radius-card)', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.2s ease'
  },
  cardActive: { borderColor: 'var(--color-primary)' },
  cardText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-05)' },
  cardTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-label)', transition: 'color 0.2s ease'
  },
  cardHint: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', lineHeight: 1.35
  },
  radio: {
    flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%',
    border: '2px solid var(--layer-3)', transition: 'all 0.2s ease'
  },
  radioOn: {
    borderColor: 'var(--color-primary)',
    boxShadow: 'inset 0 0 0 4px var(--color-primary)'
  }
}
