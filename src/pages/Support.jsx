import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic, webApp } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, ValueRow, SoonNote } from '../components/FormControls'
import ActionButton from '../components/ActionButton'
import UiIcon from '../components/UiIcon'
import ChevronIcon from '../components/ChevronIcon'

/**
 * Поддержка.
 *
 * Сначала частые вопросы, только потом кнопка написать — так большинство
 * находит ответ само, а в переписку приходят те, у кого правда особый случай.
 * Обратный порядок превратил бы экран в генератор одинаковых обращений.
 *
 * Ответы раскрываются на месте: уводить на отдельный экран ради трёх абзацев
 * дороже, чем показать их здесь.
 */
const SUPPORT_CHAT = 'https://t.me/'   // TODO: заменить на реальный аккаунт поддержки

const FAQ = [
  {
    q: 'Тренировка не сохранилась',
    a: 'Если не было связи, тренировка легла в очередь — вверху экрана виден бейдж «Офлайн» со счётчиком. Как только сеть вернётся, всё отправится само. Приложение при этом закрывать можно.'
  },
  {
    q: 'Как поменять программу',
    a: 'На главной выбери раздел и programму, затем удерживай карточку — в меню есть «Закрепить». Закреплённая программа показывается первой и запускается кнопкой ▶.'
  },
  {
    q: 'Как добавить своё упражнение',
    a: 'Конструктор программ: профиль → своя программа → «Добавить упражнения». Там же меняется порядок дней и место занятий.'
  },
  {
    q: 'Друг не видит мою статистику',
    a: 'Проверь «Приватность» в настройках — там отдельно включается последняя тренировка, статистика, любимые упражнения и рабочие веса.'
  },
  {
    q: 'Как изменить рабочий вес',
    a: 'В дне тренировки нажми на вес рядом с упражнением. Он сохраняется сразу, в том числе без сети.'
  }
]

export default function Support() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const toggle = (i) => { haptic.light(); setOpen(open === i ? null : i) }

  const write = () => {
    haptic.medium()
    if (webApp?.openTelegramLink) webApp.openTelegramLink(SUPPORT_CHAT)
    else window.open(SUPPORT_CHAT, '_blank', 'noopener')
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Поддержка</ScreenTitle>

      <SectionLabel>Частые вопросы</SectionLabel>
      <FormCard>
        {FAQ.map((item, i) => {
          const isOpen = open === i
          return (
            <div key={i} style={i > 0 ? styles.divider : undefined}>
              <button className="press-tile" onClick={() => toggle(i)} style={styles.qRow}>
                <span style={styles.q}>{item.q}</span>
                <span style={{ ...styles.chev, transform: isOpen ? 'rotate(90deg)' : 'none' }}>
                  <ChevronIcon size={16} />
                </span>
              </button>
              {isOpen && <div style={styles.a}>{item.a}</div>}
            </div>
          )
        })}
      </FormCard>

      <SectionLabel style={{ marginTop: 'var(--space-6)' }}>Не нашёл ответ</SectionLabel>
      <FormCard>
        <ValueRow
          label="Написать в поддержку"
          hint="Отвечаем в Telegram, обычно в тот же день"
          value="Открыть"
          onClick={write}
        />
      </FormCard>

      <div style={styles.cta}>
        <ActionButton onClick={write} variant="primary" size="sm" hug>
          <UiIcon name="support" size={20} color="var(--accent-on)" />
          Написать в поддержку
        </ActionButton>
      </div>

      <SoonNote>Чат поддержки подключается — пока кнопка ведёт в Telegram.</SoonNote>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  divider: { borderTop: '1px solid var(--color-border)' },
  qRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)', minHeight: '56px', width: '100%', textAlign: 'left',
    background: 'transparent', border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  q: {
    flex: 1, minWidth: 0, fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-body-size)', fontWeight: 'var(--weight-label)', color: 'var(--color-text)'
  },
  chev: {
    flexShrink: 0, display: 'inline-flex', color: 'var(--color-text-secondary)',
    transition: 'transform 0.2s var(--ease-ios)'
  },
  a: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-text)', color: 'var(--color-text-secondary)', lineHeight: 1.5,
    padding: '0 var(--space-4) var(--space-4)'
  },
  cta: { display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-6)' }
}
