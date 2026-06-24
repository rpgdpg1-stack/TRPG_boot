import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/telegram'
import UiIcon from './UiIcon'
import FavCardBody from './FavCardBody'
import PixelHeart from './PixelHeart'

/**
 * Меню действий над программой (long-press или «⋯» на карточке).
 *
 * Как меню в дне тренировки: сверху мини-карточка программы (тот же FavCardBody)
 * с сердечком-избранным в углу, ниже — действия. Для своей программы —
 * Редактировать / Поделиться / Удалить; для встроенной — только сердечко + Закрыть.
 * Фон фиксируется через body.position.
 */
export default function ProgramActionMenu({
  prog,
  activeDay = null,
  accent = 'var(--color-primary)',
  isFav = false,
  onToggleFav,
  editable,
  onEdit,
  onShare,
  onDelete,
  onClose
}) {
  const [closePressed, setClosePressed] = useState(false)

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)

    // Прибиваем страницу под модалкой (как в ExerciseActionMenu), чтобы фон
    // не скроллился и не «обрезался».
    const scrollY = window.scrollY
    const body = document.body
    const prev = {
      position: body.style.position, top: body.style.top,
      left: body.style.left, right: body.style.right, width: body.style.width
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'

    return () => {
      document.removeEventListener('keydown', handleKey)
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [onClose])

  // Блокируем взаимодействие с оверлеем на первые 300мс: гасим «долетевший»
  // клик/тап, которым открылось меню (иначе он проскакивает на кнопки).
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(t)
  }, [])

  const run = (fn) => (e) => { e.stopPropagation(); haptic.light(); fn() }

  const menu = (
    <div
      style={{ ...styles.overlay, pointerEvents: ready ? 'auto' : 'none' }}
      onClick={onClose}
    >
      <div
        style={styles.menu}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >

        {/* Мини-карточка программы — сверху, как в дне тренировки. Сердечко в
            углу переключает избранное (вместо «⋯» на самой карточке). */}
        {prog && (
          <div style={styles.miniCard}>
            <FavCardBody entry={{ prog, activeDay }} accent={accent} />
            <button
              onClick={(e) => { e.stopPropagation(); haptic.medium(); onToggleFav?.() }}
              style={styles.miniHeart}
              aria-label={isFav ? 'Убрать из избранного' : 'В избранное'}
            >
              <PixelHeart filled={isFav} size={22} />
            </button>
          </div>
        )}

        {/* Действия — только для своей программы. */}
        {editable && (
          <div style={styles.actionsBlock}>
            <button onClick={run(onEdit)} className="press-tile" style={styles.actionButton}>
              <span style={styles.actionIcon}>
                <UiIcon name="change" size={20} color="#3FA2F7" />
              </span>
              <span style={styles.actionLabel}>Редактировать</span>
            </button>

            <button onClick={run(onShare)} className="press-tile" style={styles.actionButton}>
              <span style={styles.actionIcon}>
                <UiIcon name="invite-friend" size={20} color="#9ED153" />
              </span>
              <span style={styles.actionLabel}>Поделиться</span>
            </button>

            <button onClick={run(onDelete)} className="press-tile" style={styles.actionButton}>
              <span style={styles.actionIcon}>
                <TrashIcon />
              </span>
              <span style={{ ...styles.actionLabel, color: '#E84545' }}>Удалить</span>
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="press-tile"
          onPointerDown={() => setClosePressed(true)}
          onPointerUp={() => setClosePressed(false)}
          onPointerLeave={() => setClosePressed(false)}
          onPointerCancel={() => setClosePressed(false)}
          style={{
            ...styles.closeButton,
            background: closePressed ? 'rgba(180, 90, 90, 0.16)' : 'transparent',
            color: closePressed ? '#C77' : 'var(--color-text-secondary)'
          }}
        >
          <CloseIcon />
          <span>Закрыть</span>
        </button>

      </div>

      <style>{`
        @keyframes menuOverlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )

  return createPortal(menu, document.body)
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke="#E84545" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M4 5.5 H16" />
        <path d="M8 5.5 V4 H12 V5.5" />
        <path d="M5.5 5.5 L6.2 16 H13.8 L14.5 5.5" />
        <path d="M8.5 8.5 V13" />
        <path d="M11.5 8.5 V13" />
      </g>
    </svg>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(13, 12, 12, 0.75)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 'calc(env(safe-area-inset-top) + 30px) 20px 20px',
    overflowY: 'auto',
    animation: 'menuOverlayFadeIn 0.2s ease-out forwards'
  },
  menu: {
    width: '100%',
    maxHeight: '100%',
    overflowY: 'auto',
    background: 'rgba(34, 34, 34, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '33px',
    padding: '14px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)'
  },
  // Мини-карточка программы в шапке меню (тот же FavCardBody, чуть ниже карточки
  // в списках). Сердечко в правом верхнем углу вместо «⋯».
  miniCard: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    paddingRight: '48px',
    minHeight: '112px',
    background: '#1C1C1C',
    borderRadius: '24px',
    textAlign: 'left'
  },
  miniHeart: {
    position: 'absolute',
    bottom: '12px',
    right: '14px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  actionsBlock: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 'var(--radius-medium)',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s ease, transform 0.1s ease',
    cursor: 'pointer'
  },
  actionIcon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '20px', lineHeight: 0, flexShrink: 0 },
  actionLabel: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)'
  },
  closeButton: {
    marginTop: '2px',
    padding: '9px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-small)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease'
  }
}