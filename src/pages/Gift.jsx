import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { SoonNote } from '../components/FormControls'
import ActionButton from '../components/ActionButton'
import UiIcon from '../components/UiIcon'

/**
 * Подарочный сертификат.
 *
 * Экран продающий, поэтому устроен как витрина, а не как форма: сначала
 * понятно ЧТО получит друг, потом на сколько времени, и только затем кнопка.
 *
 * Сроки, а не суммы: человек дарит доступ, а не деньги — «3 месяца» читается
 * как подарок, «990 ₽» как перевод. Цена стоит рядом мелко, для ориентира.
 *
 * Оплата ещё не подключена, поэтому кнопка честно называется «Напомнить»,
 * а не «Купить» — обманутое ожидание на экране оплаты стоит дороже, чем
 * отложенная покупка.
 */
const PLANS = [
  { id: '1m', title: '1 месяц',  price: '299 ₽',  hint: 'Попробовать' },
  { id: '3m', title: '3 месяца', price: '749 ₽',  hint: 'Выгоднее на 16%', best: true },
  { id: '12m', title: 'Год',     price: '2 490 ₽', hint: 'Выгоднее на 30%' }
]

const PERKS = [
  'Все программы тренировок',
  'Свои программы в конструкторе',
  'Статистика и история без ограничений',
  'Совместный прогресс с друзьями'
]

export default function Gift() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState('3m')

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate('/settings'))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Подарить сертификат</ScreenTitle>

      <div style={styles.hero}>
        <UiIcon name="gift" size={40} color="var(--color-primary)" />
        <div style={styles.heroText}>
          Подари другу доступ к TRPG — и тренируйтесь вместе
        </div>
      </div>

      <SectionLabel>Что входит</SectionLabel>
      <div style={styles.perks}>
        {PERKS.map((p) => (
          <div key={p} style={styles.perk}>
            <UiIcon name="check" size={16} color="var(--color-primary)" />
            <span style={styles.perkText}>{p}</span>
          </div>
        ))}
      </div>

      <SectionLabel style={{ marginTop: 'var(--space-6)' }}>На сколько</SectionLabel>
      <div style={styles.plans}>
        {PLANS.map((p) => {
          const active = p.id === plan
          return (
            <button
              key={p.id}
              className="press-tile"
              onClick={() => { haptic.selection(); setPlan(p.id) }}
              style={{ ...styles.plan, ...(active ? styles.planActive : null) }}
            >
              {p.best && <span style={styles.badge}>Выбирают чаще</span>}
              <span style={{ ...styles.planTitle, color: active ? 'var(--color-primary)' : 'var(--color-text)' }}>
                {p.title}
              </span>
              <span style={styles.planPrice}>{p.price}</span>
              <span style={styles.planHint}>{p.hint}</span>
            </button>
          )
        })}
      </div>

      <div style={styles.cta}>
        <ActionButton
          onClick={() => { haptic.medium(); navigate('/settings') }}
          variant="neutral" size="sm" hug
        >
          Напомнить, когда заработает
        </ActionButton>
      </div>

      <SoonNote>
        Оплата ещё подключается. Цены здесь предварительные — на них пока можно
        только посмотреть.
      </SoonNote>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  hero: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-5) var(--space-4) var(--space-6)', textAlign: 'center'
  },
  heroText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-label)', color: 'var(--color-text)',
    lineHeight: 1.4, maxWidth: '260px'
  },
  perks: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)', padding: 'var(--space-4)'
  },
  perk: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  perkText: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-text)', color: 'var(--text-label)', lineHeight: 1.35
  },
  plans: { display: 'flex', gap: 'var(--space-2)' },
  plan: {
    position: 'relative', flex: 1, minWidth: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-05)',
    padding: 'var(--space-5) var(--space-2) var(--space-3)',
    background: 'var(--color-card)', border: '1px solid transparent',
    borderRadius: 'var(--radius-card)', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.2s ease'
  },
  planActive: { borderColor: 'var(--color-primary)' },
  badge: {
    position: 'absolute', top: 'var(--space-15)', left: '50%', transform: 'translateX(-50%)',
    fontFamily: 'var(--font-manrope)', fontSize: '9px', fontWeight: 'var(--weight-label)',
    color: 'var(--color-primary)', whiteSpace: 'nowrap', letterSpacing: '0.2px'
  },
  planTitle: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-label)', transition: 'color 0.2s ease'
  },
  planPrice: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-size)',
    fontWeight: 'var(--weight-value)', color: 'var(--color-text)'
  },
  planHint: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.3
  },
  cta: { display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-6)' }
}
