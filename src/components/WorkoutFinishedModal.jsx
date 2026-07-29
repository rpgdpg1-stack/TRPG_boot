import { useEffect, useState } from 'react'
import ActionButton from './ActionButton'
import ClockIcon from './ClockIcon'
import StreakFlame from './StreakFlame'
import BicepGesture from './BicepGesture'
import { getCurrentUser } from '../lib/auth'
import { EVENTS, on } from '../lib/events'
import { resolveWeeklyStreak } from '../utils/dates'

/**
 * Модалка завершения тренировки — с фирменным жестом «+1 мускул».
 *
 * Сценарий (зачёт/лимит):
 *   1) Модалка появляется СРАЗУ (микроанимация scale+fade) — со всем текстом.
 *   2) Жест играет ВНУТРИ неё: бицепс качается один раз и застывает, «+1» улетает
 *      вверх и гаснет (как на лоадере), искры продолжают лететь.
 *   3) «ОК» — модалка уходит обратной микроанимацией, затем `onConfirm`.
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

  const [closing, setClosing] = useState(false)

  // Серия за неделю — тем же огоньком, что в шапке главной и в профиле. Тренировка
  // сохраняется параллельно, поэтому досчитываем после USER_CHANGED.
  const [streak, setStreak] = useState(() => {
    const u = getCurrentUser()
    return resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week)
  })
  useEffect(() => {
    const upd = () => {
      const u = getCurrentUser()
      setStreak(resolveWeeklyStreak(u?.weekly_streak, u?.weekly_streak_week))
    }
    const off = on(EVENTS.USER_CHANGED, upd)
    const off2 = on(EVENTS.USER_READY, upd)
    return () => { off(); off2() }
  }, [])

  const titleText = isError ? 'Не удалось сохранить' : offline ? 'Сохранено локально' : 'Тренировка завершена'
  const buttonText = isSaving ? 'СОХРАНЕНИЕ...' : isError ? 'ПОВТОРИТЬ' : 'ОК'

  const handleClick = () => {
    if (isSaving || closing) return
    // Ошибка → повтор сохранения на месте, модалка остаётся. Иначе — плавно уходим.
    if (isError) { onConfirm?.(); return }
    setClosing(true)
    setTimeout(() => onConfirm?.(), CLOSE_MS)
  }

  return (
    <div style={{ ...styles.overlay, opacity: closing ? 0 : 1 }}>
      <div style={{
        ...styles.panel,
        ...(isError ? styles.panelError : null),
        ...(closing ? styles.panelClosing : null)
      }}>
        <div style={styles.content}>
          {/* Жест «+1 мускул» (зачёт/лимит) или иконка ошибки/оффлайна. */}
          {celebratory
            ? <BicepGesture size={78} />
            : <div style={styles.flame}>{isError ? '⚠️' : '📵'}</div>}

          <div style={styles.body}>
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
                <Praise text="Так держать!" streak={streak} />
                <div style={styles.limitNote}>Достигнут лимит — 1 силовая в день.<br />Эта тренировка в статистику не войдёт.</div>
              </>
            ) : (
              <Praise text="Отличная работа!" streak={streak} />
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
        @keyframes wfPanelIn { 0% { opacity: 0; transform: scale(0.92) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  )
}

/** Похвала + огонёк серии за неделю (тот же компонент, что в шапке и профиле). */
function Praise({ text, streak }) {
  return (
    <div style={styles.praiseRow}>
      <span style={styles.praise}>{text}</span>
      <span style={styles.praiseFlame}>
        <span style={streak >= 1 ? undefined : styles.flameGrey}><StreakFlame streak={streak} /></span>
        <span style={{ ...styles.streakCount, ...(streak >= 1 ? null : styles.streakCountZero) }}>{streak}</span>
      </span>
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
    // Экран под модалкой заморожен: прокрутку гасим здесь (не трогая body —
    // position:fixed на нём дёргает закреплённую шапку дня).
    touchAction: 'none',
    overscrollBehavior: 'contain',
    animation: 'wfFadeIn 0.25s ease-out forwards',
    transition: `opacity ${CLOSE_MS}ms ease`
  },
  // Панель появляется сразу, целиком (жест играет уже внутри неё).
  // Обводки и зелёного свечения нет — акцент несут цифры и текст.
  panel: {
    width: '100%', maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    animation: `wfPanelIn 0.3s var(--ease-ios) forwards`,
    transition: `opacity ${CLOSE_MS}ms ease, transform ${CLOSE_MS}ms var(--ease-ios)`
  },
  panelError: { border: '1px solid rgba(255, 140, 66, 0.3)' },
  panelClosing: { opacity: 0, transform: 'scale(0.94)', animation: 'none' },
  content: {
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
  praiseRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  praise: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px', color: 'var(--color-text)', letterSpacing: '0.5px', textAlign: 'center' },
  // Огонёк серии + цифра — 1:1 с главной и профилем (без крестика, вплотную).
  praiseFlame: { display: 'inline-flex', alignItems: 'center', gap: '3px' },
  flameGrey: { display: 'inline-flex', opacity: 0.6, filter: 'grayscale(1)' },
  streakCount: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '17px', color: '#FF8C42', letterSpacing: '0.5px' },
  streakCountZero: { color: 'rgba(255, 255, 255, 0.4)' },
  limitNote: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45, opacity: 0.85 }
}
