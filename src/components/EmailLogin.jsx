import { useEffect, useRef, useState } from 'react'
import { requestEmailCode, verifyEmailCode, applySession, emailErrorText } from '../lib/email-auth'
import ActionButton from './ActionButton'

/**
 * Экран входа по почте — единственное, что видит человек в браузере, пока не вошёл.
 *
 * Внутри Telegram этот экран не показывается никогда: там вход происходит сам,
 * по подписи от Telegram. Здесь же подтверждать личность нечем, кроме письма.
 *
 * Два шага в одном экране, а не два разных: человек вводит адрес, получает код
 * и вводит его тут же. Отдельная страница под код означала бы переход в момент,
 * когда человек уходит в почтовое приложение и возвращается обратно, — а любой
 * переход в этот момент рискует потерять введённое.
 *
 * ПРО ССЫЛКУ-ПРИГЛАШЕНИЕ. Если человек пришёл по ссылке друга, её код лежит
 * в адресе страницы. Передаём его вместе с кодом из письма, чтобы дружба
 * завелась сразу при входе: просить «а теперь добавьте друга» после регистрации
 * значит потерять половину пришедших.
 */
export default function EmailLogin({ onSuccess }) {
  const [step, setStep] = useState('email')     // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [cooldown, setCooldown] = useState(0)   // сек до повторной отправки
  const codeRef = useRef(null)
  const timerRef = useRef(null)

  // Код приглашения из адреса страницы (?ref=…). Читаем один раз при открытии:
  // дальше адрес может измениться, а приглашение должно дожить до конца входа.
  const refCode = useRef(
    new URLSearchParams(window.location.search).get('ref') || null
  ).current

  useEffect(() => () => clearInterval(timerRef.current), [])

  const startCooldown = (seconds = 60) => {
    setCooldown(seconds)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const handleSendCode = async () => {
    if (busy || !emailLooksValid) return
    setBusy(true); setError(null)

    const res = await requestEmailCode(email, 'login')
    setBusy(false)

    if (!res?.ok) {
      setError(emailErrorText(res?.error, res))
      // «Ещё рано» — не ошибка ввода, а ожидание: показываем отсчёт, чтобы
      // человек видел конкретное число секунд, а не гадал.
      if (res?.error === 'too_soon') { startCooldown(res.retry_after || 60); setStep('code') }
      return
    }

    setStep('code')
    startCooldown(60)
    setTimeout(() => codeRef.current?.focus(), 100)
  }

  const handleVerify = async () => {
    if (busy || code.length !== 6) return
    setBusy(true); setError(null)

    const res = await verifyEmailCode(email, code, 'login', refCode)

    if (!res?.ok || !res.token_hash) {
      setBusy(false)
      setError(emailErrorText(res?.error, res))
      setCode('')
      return
    }

    const applied = await applySession(res.token_hash)
    setBusy(false)

    if (!applied) { setError('Не удалось войти. Попробуйте ещё раз'); return }
    onSuccess?.(res)
  }

  const onCodeChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (error) setError(null)
  }

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <img src="/favicon.webp" alt="" style={styles.logo} draggable={false} />
        <h1 style={styles.title}>TRPG</h1>

        {step === 'email' ? (
          <>
            <p style={styles.lead}>
              Введите почту — пришлём код для входа.
            </p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode() }}
              style={styles.field}
            />
            <ActionButton
              variant="accent"
              disabled={!emailLooksValid || busy}
              onClick={handleSendCode}
              style={styles.button}
            >
              {busy ? 'Отправляем…' : 'Получить код'}
            </ActionButton>
          </>
        ) : (
          <>
            <p style={styles.lead}>
              Код отправлен на <span style={styles.emailMark}>{email.trim().toLowerCase()}</span>
            </p>
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              /* Подсказка браузеру: на телефоне код из письма подставится сам. */
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={onCodeChange}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
              style={{ ...styles.field, ...styles.codeField }}
            />
            <ActionButton
              variant="accent"
              disabled={code.length !== 6 || busy}
              onClick={handleVerify}
              style={styles.button}
            >
              {busy ? 'Проверяем…' : 'Войти'}
            </ActionButton>

            <div style={styles.footRow}>
              <button
                style={styles.linkBtn}
                onClick={() => { setStep('email'); setCode(''); setError(null) }}
              >
                Другая почта
              </button>
              <button
                style={{ ...styles.linkBtn, ...(cooldown ? styles.linkBtnOff : null) }}
                disabled={cooldown > 0 || busy}
                onClick={handleSendCode}
              >
                {cooldown > 0 ? `Ещё раз через ${cooldown} с` : 'Отправить снова'}
              </button>
            </div>
          </>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <p style={styles.note}>
          Письмо приходит за несколько секунд. Если его нет — загляните в спам.
        </p>
      </div>
    </div>
  )
}

const styles = {
  screen: {
    minHeight: '100dvh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-6) var(--space-4)',
    background: 'var(--color-bg)'
  },
  card: {
    width: '100%', maxWidth: '360px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center'
  },
  logo: {
    width: '72px', height: '72px', borderRadius: 'var(--radius-card)',
    marginBottom: 'var(--space-4)'
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-size)',
    fontWeight: 800, letterSpacing: '1px', color: 'var(--color-text)'
  },
  lead: {
    margin: 'var(--space-2) 0 var(--space-6)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-body-size)',
    lineHeight: 1.5, color: 'var(--color-text-secondary)'
  },
  emailMark: { color: 'var(--color-text)', fontWeight: 700 },
  field: {
    width: '100%', height: 'var(--btn-height)',
    padding: '0 var(--space-4)',
    background: 'var(--surface)', border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-pill)', outline: 'none',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-button-size)',
    fontWeight: 700, color: 'var(--color-text)', textAlign: 'center',
    WebkitAppearance: 'none'
  },
  // Цифры кода — крупно и вразрядку: их сверяют глазами с письмом, а не читают.
  codeField: {
    fontSize: 'var(--text-heading-size)', letterSpacing: '6px'
  },
  button: { width: '100%', marginTop: 'var(--space-3)' },
  footRow: {
    display: 'flex', justifyContent: 'space-between', width: '100%',
    marginTop: 'var(--space-3)', gap: 'var(--space-3)'
  },
  linkBtn: {
    background: 'none', border: 'none', padding: 'var(--space-2)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 700, color: 'var(--color-text-secondary)',
    WebkitTapHighlightColor: 'transparent'
  },
  linkBtnOff: { color: 'var(--color-text-disabled)' },
  error: {
    marginTop: 'var(--space-4)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    lineHeight: 1.45, color: 'var(--color-error)'
  },
  note: {
    marginTop: 'var(--space-6)', marginBottom: 0,
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    lineHeight: 1.5, color: 'var(--color-text-disabled)'
  }
}
