import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, confirm as tgConfirm } from '../lib/telegram'
import { getCurrentUser, refreshCurrentUser } from '../lib/auth'
import {
  requestEmailCode, verifyEmailCode, applySession,
  unlinkEmail, unlinkTelegram, emailErrorText
} from '../lib/email-auth'
import ScreenTitle from '../components/ScreenTitle'
import ActionButton from '../components/ActionButton'

/**
 * Страница «Вход» — какими способами человек попадает в свой аккаунт.
 *
 * Способов два: Telegram и почта. Почта нужна не вместо Telegram, а рядом:
 * она открывает браузерную версию и остаётся единственной дверью, если человек
 * перестанет пользоваться Telegram.
 *
 * ГЛАВНОЕ ПРАВИЛО ЭКРАНА: последний способ входа отвязать нельзя. Оно же стоит
 * в базе — здесь только ради внятного объяснения вместо ошибки.
 *
 * ОСОБЫЙ СЛУЧАЙ — «переезд». Если человек давно живёт в браузерном аккаунте,
 * а в Telegram зашёл впервые, привязка почты не добавляет адрес к текущей
 * записи, а переносит Telegram в ту, где лежат тренировки. Аккаунт после этого
 * ДРУГОЙ, и сессию надо взять новую — иначе приложение останется с ключом от
 * удалённой двери. Сервер отдаёт такой ключ вместе с ответом.
 */
export default function AccountAccess() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => getCurrentUser())
  const [mode, setMode] = useState('idle')     // 'idle' | 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
    return () => clearInterval(timerRef.current)
  }, [navigate])

  const startCooldown = (seconds = 60) => {
    setCooldown(seconds)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCooldown(prev => (prev <= 1 ? (clearInterval(timerRef.current), 0) : prev - 1))
    }, 1000)
  }

  const hasEmail = !!user?.email
  const hasTelegram = !!user?.telegram_id
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const handleSend = async () => {
    if (busy || !emailLooksValid) return
    haptic.light(); setBusy(true); setError(null)

    const res = await requestEmailCode(email, 'link')
    setBusy(false)

    if (!res?.ok) {
      setError(emailErrorText(res?.error, res))
      if (res?.error === 'too_soon') { startCooldown(res.retry_after || 60); setMode('code') }
      return
    }
    setMode('code')
    startCooldown(60)
  }

  const handleVerify = async () => {
    if (busy || code.length !== 6) return
    setBusy(true); setError(null)

    const res = await verifyEmailCode(email, code, 'link')

    if (!res?.ok) {
      setBusy(false)
      setError(emailErrorText(res?.error, res))
      setCode('')
      return
    }

    // Аккаунт переехал — забираем новую сессию и перезапускаемся: данные,
    // программы и друзья теперь берутся из другой записи.
    if (res.moved && res.token_hash) {
      await applySession(res.token_hash)
      window.location.replace(window.location.origin)
      return
    }

    const fresh = await refreshCurrentUser()
    setUser(fresh || getCurrentUser())
    setBusy(false)
    setMode('idle'); setCode(''); setEmail('')
    haptic.success()
  }

  const handleUnlink = async (what) => {
    const isEmail = what === 'email'
    const ok = await tgConfirm(
      isEmail
        ? 'Отвязать почту? Входить в браузере после этого не получится.'
        : 'Отвязать Telegram? Войти можно будет только по почте.'
    )
    if (!ok) return

    setBusy(true); setError(null)
    const res = isEmail ? await unlinkEmail() : await unlinkTelegram()
    setBusy(false)

    if (!res?.ok) { setError(emailErrorText(res?.error)); return }

    const fresh = await refreshCurrentUser()
    setUser(fresh || getCurrentUser())
    haptic.success()
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Вход</ScreenTitle>

      <p style={styles.intro}>
        Способы попасть в свой аккаунт. Почта нужна, чтобы открывать приложение
        в браузере — данные там те же самые.
      </p>

      <div style={styles.card}>
        {/* Telegram */}
        <div style={styles.row}>
          <div style={styles.rowMain}>
            <div style={styles.rowTitle}>Telegram</div>
            <div style={styles.rowValue}>
              {hasTelegram
                ? (user?.username ? `@${user.username}` : user?.first_name || 'Привязан')
                : 'Не привязан'}
            </div>
          </div>
          {hasTelegram && (
            <button
              style={{ ...styles.action, ...(hasEmail ? null : styles.actionOff) }}
              disabled={!hasEmail || busy}
              onClick={() => handleUnlink('telegram')}
            >
              Отвязать
            </button>
          )}
        </div>

        {/* Почта */}
        <div style={{ ...styles.row, ...styles.rowDivided }}>
          <div style={styles.rowMain}>
            <div style={styles.rowTitle}>Почта</div>
            <div style={styles.rowValue}>{hasEmail ? user.email : 'Не привязана'}</div>
          </div>
          {hasEmail ? (
            <button
              style={{ ...styles.action, ...(hasTelegram ? null : styles.actionOff) }}
              disabled={!hasTelegram || busy}
              onClick={() => handleUnlink('email')}
            >
              Отвязать
            </button>
          ) : (
            mode === 'idle' && (
              <button style={styles.action} onClick={() => { haptic.light(); setMode('email') }}>
                Привязать
              </button>
            )
          )}
        </div>
      </div>

      {/* Форма привязки: адрес → код */}
      {mode !== 'idle' && !hasEmail && (
        <div style={styles.form}>
          {mode === 'email' ? (
            <>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
                style={styles.field}
              />
              <ActionButton
                variant="accent" size="sm"
                disabled={!emailLooksValid || busy}
                onClick={handleSend}
                style={styles.formBtn}
              >
                {busy ? 'Отправляем…' : 'Прислать код'}
              </ActionButton>
            </>
          ) : (
            <>
              <div style={styles.sentTo}>Код отправлен на {email.trim().toLowerCase()}</div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  if (error) setError(null)
                }}
                style={{ ...styles.field, ...styles.codeField }}
              />
              <ActionButton
                variant="accent" size="sm"
                disabled={code.length !== 6 || busy}
                onClick={handleVerify}
                style={styles.formBtn}
              >
                {busy ? 'Проверяем…' : 'Подтвердить'}
              </ActionButton>
              <button
                style={{ ...styles.linkBtn, ...(cooldown ? styles.linkBtnOff : null) }}
                disabled={cooldown > 0 || busy}
                onClick={handleSend}
              >
                {cooldown > 0 ? `Отправить снова через ${cooldown} с` : 'Отправить снова'}
              </button>
            </>
          )}

          <button
            style={styles.linkBtn}
            onClick={() => { setMode('idle'); setCode(''); setError(null) }}
          >
            Отмена
          </button>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {/* Пояснение к неактивной кнопке: почему отвязать нельзя. Без него
          серая кнопка читается как поломка. */}
      {hasEmail !== hasTelegram && (
        <p style={styles.hint}>
          {hasEmail
            ? 'Почта — единственный способ войти, поэтому отвязать её нельзя. Сначала откройте приложение в Telegram.'
            : 'Telegram — единственный способ войти, поэтому отвязать его нельзя. Сначала привяжите почту.'}
        </p>
      )}
    </div>
  )
}

const styles = {
  page: { paddingBottom: 'var(--space-8)' },
  // Вводная строка — как на «Приватности»: по центру, узкой колонкой,
  // подписным кеглем. Экраны-настройки в приложении читаются одинаково,
  // и заводить второй вид пояснения ради одной страницы незачем.
  intro: {
    margin: 'var(--space-3) auto var(--space-5)', maxWidth: '300px',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 500, lineHeight: 1.45,
    color: 'var(--color-text-secondary)', textAlign: 'center'
  },
  card: {
    background: 'var(--color-card)', borderRadius: 'var(--radius-card)',
    padding: '0 var(--space-4)'
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4) 0', minHeight: '56px'
  },
  rowDivided: { borderTop: '1px solid var(--color-border)' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-label-size)',
    fontWeight: 700, color: 'var(--color-text)'
  },
  rowValue: {
    marginTop: '2px',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  action: {
    flexShrink: 0, background: 'none', border: 'none', padding: 'var(--space-2)',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-label-size)',
    fontWeight: 700, color: 'var(--color-primary)',
    WebkitTapHighlightColor: 'transparent'
  },
  actionOff: { color: 'var(--color-text-disabled)' },
  form: {
    marginTop: 'var(--space-3)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)'
  },
  sentTo: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', textAlign: 'center'
  },
  field: {
    width: '100%', height: 'var(--btn-height-sm)', padding: '0 var(--space-4)',
    background: 'var(--color-card)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)', outline: 'none',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-button-size)',
    fontWeight: 700, color: 'var(--color-text)', textAlign: 'center',
    WebkitAppearance: 'none'
  },
  codeField: { fontSize: 'var(--text-heading-size)', letterSpacing: '6px' },
  formBtn: { width: '100%' },
  linkBtn: {
    background: 'none', border: 'none', padding: 'var(--space-2)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    fontWeight: 700, color: 'var(--color-text-secondary)',
    WebkitTapHighlightColor: 'transparent'
  },
  linkBtnOff: { color: 'var(--color-text-disabled)' },
  error: {
    marginTop: 'var(--space-3)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    lineHeight: 1.45, color: 'var(--color-error)'
  },
  hint: {
    marginTop: 'var(--space-3)', marginBottom: 0,
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    lineHeight: 1.5, color: 'var(--color-text-disabled)'
  }
}
