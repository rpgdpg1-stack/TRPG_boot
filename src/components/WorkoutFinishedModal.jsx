import { useEffect, useState } from 'react'
import ActionButton from './ActionButton'
import ClockIcon from './ClockIcon'
import BicepGesture, { GESTURE_MS } from './BicepGesture'

/**
 * Модалка завершения тренировки — с фирменным жестом «+1 мускул».
 *
 * Сценарий (зачёт/лимит):
 *   1) На затемнённом фоне СНАЧАЛА только жест: бицепс качается один раз и застывает,
 *      «+1» улетает вверх и гаснет (как на лоадере), искры продолжают лететь.
 *   2) Как только «+1» улетел (`GESTURE_MS`) — вокруг жеста проявляется сама панель
 *      с текстом и кнопкой. Бицепс при этом НЕ прыгает: композиция зафиксирована
 *      с самого начала, а фон панели — отдельный слой позади неё.
 *   3) «ОК» — панель и фон уходят обратной микроанимацией, затем `onConfirm`.
 *
 * Никакие мускулы/очки НЕ копятся — «+1» = «+1 тренировка» (идёт в недельный стрик
 * и счётчики статистики), лимит силовой — 1 в сутки.
 *
 * Состояния: idle | saving | error; offline — завершено без сети (в очередь).
 * При error/offline — обычная иконка (⚠️/📵), без жеста и без задержки.
 */
const CLOSE_MS = 220

export default function WorkoutFinishedModal({ durationLabel = '', status = 'idle', errorMsg = '', offline = false, alreadyToday = false, onConfirm }) {
  const isSaving = status === 'saving'
  const isError = status === 'error'
  const celebratory = !isError && !offline

  // Панель появляется только после того, как жест отыграл и «+1» улетел.
  const [revealed, setRevealed] = useState(!celebratory)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (!celebratory) { setRevealed(true); return }
    const t = setTimeout(() => setRevealed(true), GESTURE_MS)
    return () => clearTimeout(t)
  }, [celebratory])

  const titleText = isError ? 'Не удалось сохранить' : offline ? 'Сохранено локально' : 'Тренировка завершена'
  const buttonText = isSaving ? 'СОХРАНЕНИЕ...' : isError ? 'ПОВТОРИТЬ' : 'ОК'

  const handleClick = () => {
    if (isSaving || closing) return
    // Ошибка → повтор сохранения на месте, модалка остаётся. Иначе — плавно уходим.
    if (isError) { onConfirm?.(); return }
    setClosing(true)
    setTimeout(() => onConfirm?.(), CLOSE_MS)
  }

  const shown = revealed && !closing

  return (
    <div style={{ ...styles.overlay, opacity: closing ? 0 : 1 }}>
      <div style={styles.stage}>
        {/* Фон панели — отдельным слоем позади композиции: проявляется/уходит
            масштабом, не сдвигая при этом бицепс. */}
        <div style={{
          ...styles.panelBg,
          ...(isError ? styles.panelBgError : null),
          opacity: shown ? 1 : 0,
          transform: shown ? 'scale(1)' : 'scale(0.94)'
        }} aria-hidden="true" />

        <div style={styles.content}>
          {/* Жест «+1 мускул» (зачёт/лимит) или иконка ошибки/оффлайна. */}
          {celebratory
            ? <BicepGesture size={78} />
            : <div style={styles.flame}>{isError ? '⚠️' : '📵'}</div>}

          <div style={{ ...styles.body, opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}>
            <div style={{ ...styles.title, color: (isError || offline) ? '#FF8C42' : 'var(--color-primary)' }}>
              {titleText}
            </div>

            {!isError && durationLabel && (
              <div style={styles.duration}>
                <span style={styles.durationClock}><ClockIcon size={16} /></span>
                <Duration label={durationLabel} />
              </div>
            )}

            {isError ? (
              <div style={styles.errorMessage}>{errorMsg || 'Проверь подключение к интернету и попробуй ещё раз.'}</div>
            ) : offline ? (
              <div style={styles.errorMessage}>Тренировка сохранена на телефоне.<br />Данные обновятся, как только появится интернет.</div>
            ) : alreadyToday ? (
              <>
                <div style={styles.praise}>Так держать! 🔥</div>
                <div style={styles.limitNote}>За сегодня тренировка уже засчитана.<br />Лимит — 1 силовая в день.</div>
              </>
            ) : (
              <>
                <div style={styles.praise}>Отличная работа! 🔥</div>
                <div style={styles.limitNote}>+1 тренировка за сегодня.</div>
              </>
            )}

            <ActionButton
              variant="accent"
              size="sm"
              onClick={handleClick}
              disabled={isSaving}
              style={{ marginTop: '4px', width: '100%', ...(isError ? { background: '#FF8C42', borderColor: '#C46A28', color: '#0D0C0C' } : {}) }}
            >
              {buttonText}
            </ActionButton>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wfFadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  )
}

/** «45 мин» / «1 ч 20 мин»: числа — акцентом, единицы — серым. */
function Duration({ label }) {
  return (
    <>
      {String(label).split(' ').map((part, i) => (
        <span key={i} style={/^\d/.test(part) ? styles.durationNum : styles.durationUnit}>{part}</span>
      ))}
    </>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 12, 12, 0.9)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: '20px',
    animation: 'wfFadeIn 0.25s ease-out forwards',
    transition: `opacity ${CLOSE_MS}ms ease`
  },
  // Композиция зафиксирована с первого кадра (жест стоит на своём финальном месте),
  // меняется только видимость фона и текста.
  stage: { position: 'relative', width: '100%', maxWidth: '320px' },
  panelBg: {
    position: 'absolute', inset: 0,
    background: 'rgba(34, 34, 34, 0.98)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    // Обводки и зелёного свечения нет — панель тихая, акцент несут цифры и текст.
    transition: `opacity ${CLOSE_MS}ms ease, transform ${CLOSE_MS}ms var(--ease-ios)`
  },
  panelBgError: { border: '1px solid rgba(255, 140, 66, 0.3)' },
  content: {
    position: 'relative', zIndex: 1,
    padding: '16px 20px 18px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
  },
  flame: { fontSize: '58px', lineHeight: 1, filter: 'drop-shadow(0 0 14px rgba(255, 140, 66, 0.7))' },
  body: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%',
    transition: `opacity ${CLOSE_MS}ms ease`
  },
  // Обычный регистр (первая заглавная), акцентный зелёный.
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', letterSpacing: '0.5px', textAlign: 'center' },
  duration: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontVariantNumeric: 'tabular-nums' },
  durationClock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  durationNum: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: 'var(--color-primary)', letterSpacing: '0.5px' },
  durationUnit: { fontFamily: 'var(--font-manrope)', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' },
  errorMessage: { fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.5, padding: '4px' },
  praise: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px', color: 'var(--color-text)', letterSpacing: '0.5px', textAlign: 'center' },
  limitNote: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45, opacity: 0.85 }
}
