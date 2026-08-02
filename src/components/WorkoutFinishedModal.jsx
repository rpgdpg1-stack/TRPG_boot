import { useEffect, useState, useRef } from 'react'
import ActionButton from './ActionButton'
import ClockIcon from './ClockIcon'
import StreakFlame from './StreakFlame'
import BicepGesture from './BicepGesture'
import { getCurrentUser } from '../lib/auth'
import { EVENTS, on } from '../lib/events'
import { resolveWeeklyStreak } from '../utils/dates'
import { useScrollLock } from '../lib/use-scroll-lock'
import UiIcon from './UiIcon'

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
const CLOSE_MS = 260

export default function WorkoutFinishedModal({ durationLabel = '', status = 'idle', errorMsg = '', offline = false, alreadyToday = false, onConfirm }) {
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)
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
    <div ref={overlayRef} style={{ ...styles.overlay, opacity: closing ? 0 : 1 }}>
      <div style={{
        ...styles.panel,
        ...(isError ? styles.panelError : null),
        ...(closing ? styles.panelClosing : null)
      }}>
        <div style={styles.content}>
          {/* Жест «+1 мускул» (зачёт/лимит) или иконка ошибки/оффлайна. */}
          {celebratory
            ? <span style={styles.gestureWrap}><BicepGesture size={78} /></span>
            : <div style={styles.flame}><UiIcon name={isError ? 'alert' : 'network_off'} size={48} color="var(--color-offline)" /></div>}

          <div style={styles.body}>
            <div style={{ ...styles.title, color: (isError || offline) ? 'var(--color-offline)' : 'var(--color-primary)' }}>
              {titleText}
            </div>

            {/* Одна строка показателей: серия (огонёк + цифра) и время. Оба —
                тем же кеглем/шрифтом, что счётчик серии на главной и в профиле.
                Пульс — синхронно с улетающим «+1» (тот же timerPulse, что у
                цифр шапки дня на старте тренировки). */}
            {!isError && (
              <div style={{
                ...styles.statsRow,
                ...(celebratory ? { animation: 'timerPulse 700ms var(--ease-ios) 620ms both' } : null)
              }}>
                <span style={styles.stat}>
                  <span style={streak >= 1 ? undefined : styles.flameGrey}><StreakFlame streak={streak} /></span>
                  <span style={{ ...styles.statNum, color: streak >= 1 ? 'var(--color-streak)' : 'rgba(255,255,255,0.4)' }}>{streak}</span>
                </span>
                {durationLabel && (
                  <span style={styles.stat}>
                    <span style={styles.statClock}><ClockIcon size={18} /></span>
                    <Duration label={durationLabel} />
                  </span>
                )}
              </div>
            )}

            {isError ? (
              <div style={styles.errorMessage}>{errorMsg || 'Проверь подключение к интернету и попробуй ещё раз.'}</div>
            ) : offline ? (
              <div style={styles.errorMessage}>Тренировка сохранена на телефоне.<br />Данные обновятся, как только появится интернет.</div>
            ) : alreadyToday ? (
              // Лимит занимает МЕСТО похвалы (не добавляется под ней) — иначе
              // панель прыгала, когда сервер отвечал «уже засчитано».
              <div style={styles.limitNote}>Достигнут лимит — 1 силовая в день.<br />Эта тренировка в статистику не войдёт.</div>
            ) : (
              <div style={styles.praise}>Отличная работа!</div>
            )}

            <ActionButton
              variant="accent"
              size="sm"
              onClick={handleClick}
              disabled={isSaving}
              style={{ marginTop: 'var(--space-1)', width: '100%', ...(isError ? { background: 'var(--color-offline)', borderColor: '#C46A28', color: 'var(--accent-on)' } : {}) }}
            >
              {buttonText}
            </ActionButton>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wfPanelIn { 0% { opacity: 0; transform: scale(0.92) translateY(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
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
    zIndex: 9999, padding: 'var(--space-5)',
    // Экран под модалкой заморожен: прокрутку гасим здесь (не трогая body —
    // position:fixed на нём дёргает закреплённую шапку дня).
    touchAction: 'none',
    overscrollBehavior: 'contain',
    // Затемнение уже стоит от модалки подтверждения — своего fade-in НЕ делаем,
    // иначе фон мигает на кадр при смене модалок.
    transition: `opacity ${CLOSE_MS}ms ease`
  },
  // Панель появляется сразу, целиком (жест играет уже внутри неё).
  // Обводки и зелёного свечения нет — акцент несут цифры и текст.
  panel: {
    width: '100%', maxWidth: '320px',
    background: 'rgba(34, 34, 34, 0.98)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    // «+1» жеста улетает вверх и обрезается краями панели, не вылезая наружу.
    overflow: 'hidden',
    animation: `wfPanelIn 0.32s var(--ease-ios) forwards`,
    transition: `opacity ${CLOSE_MS}ms ease, transform ${CLOSE_MS}ms var(--ease-ios)`
  },
  panelError: { border: '1px solid rgba(255, 140, 66, 0.3)' },
  panelClosing: { opacity: 0, transform: 'scale(0.94) translateY(6px)', animation: 'none' },
  content: {
    // Сверху воздуха больше: «+1» улетает вверх и не должен упираться в кромку.
    // Снизу жест подтянут к заголовку (отрицательный margin у сцены).
    padding: 'var(--space-6) var(--space-5) var(--space-5)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)'
  },
  // Жест опущен ниже и придвинут к заголовку.
  gestureWrap: { marginTop: '0', marginBottom: '-16px' },
  flame: { fontSize: '58px', lineHeight: 1, filter: 'drop-shadow(0 0 14px rgba(255, 140, 66, 0.7))' },
  body: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
    transition: `opacity ${CLOSE_MS}ms ease`
  },
  // Обычный регистр (первая заглавная), акцентный зелёный.
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-title-size)', letterSpacing: '0.5px', textAlign: 'center' },
  durationNum: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-title-size)', color: 'var(--color-primary)', letterSpacing: '0.5px' },
  durationUnit: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500, color: 'var(--color-text-secondary)' },
  errorMessage: { fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.5, padding: 'var(--space-1)' },
  // Похвала и заметка о лимите занимают ОДНУ и ту же строку фиксированной высоты —
  // панель не меняет размер, когда приходит ответ сервера.
  praise: {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-title-size)', color: 'var(--color-text)',
    letterSpacing: '0.5px', textAlign: 'center',
    minHeight: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  // Строка показателей: [огонёк N] [часы N мин] — в линию, одинаковым кеглем.
  statsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-5)' },
  stat: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' },
  statNum: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-title-size)', letterSpacing: '0.5px' },
  statClock: { display: 'inline-flex', color: 'var(--color-text-secondary)' },
  flameGrey: { display: 'inline-flex', opacity: 0.6, filter: 'grayscale(1)' },
  limitNote: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)', fontWeight: 500, color: 'var(--color-text-secondary)',
    textAlign: 'center', lineHeight: 1.45, opacity: 0.85,
    minHeight: '34px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
  }
}
