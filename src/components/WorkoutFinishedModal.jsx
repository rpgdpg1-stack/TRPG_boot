import { useEffect, useState } from 'react'
import ActionButton from './ActionButton'
import BicepGesture from './BicepGesture'

/**
 * Модалка завершения тренировки — с фирменным жестом «+1 мускул».
 *
 * При зачёте/лимите: по центру наш бицепс (как на лоадере) — качается ОДИН раз и
 * застывает; вокруг непрерывно летят гладкие зелёные искры; рядом статичный «+1».
 * Текст (заголовок/похвала/кнопка) проявляется после короткой паузы, чтобы жест
 * прочитался. Никакие мускулы/очки НЕ копятся — «+1» = «+1 тренировка» (идёт в
 * недельный стрик и счётчики статистики), лимит силовой — 1 в сутки.
 *
 * Состояния: idle | saving | error; offline — завершено без сети (в очередь).
 * При error/offline — обычная иконка (⚠️/📵), без жеста.
 */
export default function WorkoutFinishedModal({ durationLabel = '', status = 'idle', errorMsg = '', offline = false, alreadyToday = false, onConfirm }) {
  const isSaving = status === 'saving'
  const isError = status === 'error'
  const celebratory = !isError && !offline

  // Текст/кнопка проявляются после того, как жест бицепса прочитался (~900мс).
  const [revealed, setRevealed] = useState(!celebratory)
  useEffect(() => {
    if (!celebratory) { setRevealed(true); return }
    const t = setTimeout(() => setRevealed(true), 900)
    return () => clearTimeout(t)
  }, [celebratory])

  const titleText = isError ? 'НЕ УДАЛОСЬ СОХРАНИТЬ' : offline ? 'СОХРАНЕНО ЛОКАЛЬНО' : 'ТРЕНИРОВКА ЗАВЕРШЕНА'
  const buttonText = isSaving ? 'СОХРАНЕНИЕ...' : isError ? 'ПОВТОРИТЬ' : 'ОК'
  const handleClick = () => { if (isSaving) return; onConfirm?.() }

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, ...(isError ? styles.modalError : {}) }}>

        {/* Жест «+1 мускул» (зачёт/лимит) или иконка ошибки/оффлайна. */}
        {celebratory
          ? <BicepGesture size={84} />
          : <div style={styles.flame}>{isError ? '⚠️' : '📵'}</div>}

        {/* Текст/кнопка — проявляются после жеста. */}
        <div style={{ ...styles.body, opacity: revealed ? 1 : 0 }}>
          <div style={{ ...styles.title, color: (isError || offline) ? '#FF8C42' : 'var(--color-text)' }}>
            {titleText}
          </div>

          {!isError && durationLabel && <div style={styles.duration}>⏱ {durationLabel}</div>}

          {isError ? (
            <div style={styles.errorMessage}>{errorMsg || 'Проверь подключение к интернету и попробуй ещё раз.'}</div>
          ) : offline ? (
            <div style={styles.errorMessage}>Тренировка сохранена на телефоне.<br />Данные обновятся, как только появится интернет.</div>
          ) : alreadyToday ? (
            <>
              <div style={styles.praise}>Так держать! 💪</div>
              <div style={styles.limitNote}>За сегодня тренировка уже засчитана.<br />Лимит — 1 силовая в день.</div>
            </>
          ) : (
            <>
              <div style={styles.praise}>Отличная работа! 💪</div>
              <div style={styles.limitNote}>+1 тренировка за сегодня.</div>
            </>
          )}

          <ActionButton
            variant="accent"
            size="sm"
            onClick={handleClick}
            disabled={isSaving}
            style={{ marginTop: '8px', width: '100%', ...(isError ? { background: '#FF8C42', borderColor: '#C46A28', color: '#0D0C0C' } : {}) }}
          >
            {buttonText}
          </ActionButton>
        </div>
      </div>

      <style>{`
        @keyframes wfFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes wfScaleIn { 0% { opacity: 0; transform: scale(0.85); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 12, 12, 0.9)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: '20px',
    animation: 'wfFadeIn 0.25s ease-out forwards'
  },
  modal: {
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(158, 209, 83, 0.2)',
    borderRadius: 'var(--radius-card)',
    padding: '28px 24px 24px',
    width: '100%', maxWidth: '320px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
    animation: 'wfScaleIn 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(158, 209, 83, 0.12)'
  },
  modalError: {
    border: '1px solid rgba(255, 140, 66, 0.3)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 140, 66, 0.2)'
  },
  flame: { fontSize: '64px', lineHeight: 1, filter: 'drop-shadow(0 0 14px rgba(255, 140, 66, 0.7))' },
  body: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%', transition: 'opacity 0.4s ease' },
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', letterSpacing: '2px', textAlign: 'center' },
  duration: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px', color: 'var(--color-text)', letterSpacing: '1px', fontVariantNumeric: 'tabular-nums' },
  errorMessage: { fontFamily: 'var(--font-manrope)', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.5, padding: '8px 4px' },
  praise: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px', color: 'var(--color-text)', letterSpacing: '0.5px', textAlign: 'center' },
  limitNote: { fontFamily: 'var(--font-manrope)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45, opacity: 0.85 }
}
