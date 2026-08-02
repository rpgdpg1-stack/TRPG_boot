import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { localSet } from '../utils/storage'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, SoonNote } from '../components/FormControls'
import ActionButton from '../components/ActionButton'
import UiIcon from '../components/UiIcon'

/**
 * «Помоги улучшить приложение» — короткий отзыв.
 *
 * Сначала тема, потом текст: с выбранной темой человек пишет конкретнее, а
 * разбирать такие отзывы можно не читая каждый целиком.
 *
 * Без оценки звёздами: звёзды дают цифру, но не говорят, что чинить. На этом
 * этапе полезнее одна фраза «что мешает», чем средний балл.
 *
 * Отправка на сервер появится позже — пока текст сохраняется локально, чтобы
 * не пропал, и экран честно об этом говорит.
 */
const KEY = 'feedback-draft'
const MAX = 500

const TOPICS = [
  { id: 'bug',     label: 'Что-то сломалось' },
  { id: 'idea',    label: 'Есть идея' },
  { id: 'hard',    label: 'Неудобно пользоваться' },
  { id: 'other',   label: 'Другое' }
]

export default function Feedback() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState(null)
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate('/settings'))
    lockVerticalSwipes()
  }, [navigate])

  const canSend = !!topic && text.trim().length >= 10

  const send = () => {
    if (!canSend) return
    haptic.success()
    localSet(KEY, JSON.stringify({ topic, text: text.trim(), at: new Date().toISOString() }))
    setSent(true)
  }

  if (sent) {
    return (
      <div className="page page-fade" style={styles.page}>
        <ScreenTitle>Спасибо</ScreenTitle>
        <div style={styles.done}>
          <UiIcon name="check" size={40} color="var(--color-primary)" />
          <div style={styles.doneTitle}>Отзыв записан</div>
          <div style={styles.doneText}>
            Мы читаем всё, что приходит. Если понадобятся детали — напишем в Telegram.
          </div>
          <ActionButton onClick={() => navigate('/settings')} variant="neutral" size="sm" hug>
            Готово
          </ActionButton>
        </div>
      </div>
    )
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Улучшить приложение</ScreenTitle>

      <SectionLabel>О чём отзыв</SectionLabel>
      <div style={styles.chips}>
        {TOPICS.map((t) => {
          const active = t.id === topic
          return (
            <button
              key={t.id}
              className="press-tile"
              onClick={() => { haptic.selection(); setTopic(t.id) }}
              style={{
                ...styles.chip,
                ...(active ? styles.chipActive : null),
                color: active ? 'var(--accent-on)' : 'var(--color-text)'
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <SectionLabel style={{ marginTop: 'var(--space-6)' }}>Что хочешь сказать</SectionLabel>
      <FormCard style={styles.textCard}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          placeholder="Опиши, что произошло или чего не хватает…"
          style={styles.textarea}
          rows={5}
        />
        <div style={styles.counter}>{text.length} / {MAX}</div>
      </FormCard>

      <div style={styles.cta}>
        <ActionButton onClick={send} variant="primary" size="sm" hug disabled={!canSend}>
          Отправить
        </ActionButton>
      </div>

      <SoonNote>
        Отправка на сервер ещё подключается — пока отзыв сохраняется в приложении
        и не потеряется.
      </SoonNote>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' },
  chip: {
    padding: 'var(--space-2) var(--space-4)', minHeight: '40px',
    background: 'var(--color-card)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)', cursor: 'pointer',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-label)', WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.18s ease, color 0.18s ease'
  },
  chipActive: { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' },
  textCard: { padding: 'var(--space-4)', gap: 'var(--space-2)' },
  textarea: {
    width: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-text)', color: 'var(--color-text)', lineHeight: 1.5
  },
  counter: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', textAlign: 'right'
  },
  cta: { display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-5)' },
  done: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
    paddingTop: 'var(--space-12)', textAlign: 'center'
  },
  doneTitle: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-title-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-text)'
  },
  doneText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)', lineHeight: 1.45,
    maxWidth: '280px', marginBottom: 'var(--space-3)'
  }
}
