import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, confirm } from '../lib/telegram'
import { getActiveDay } from '../lib/storage'
import { localGet } from '../utils/storage'
import { CATEGORY_META } from '../features/programs/categories'
import { deleteMyProgram, shareProgramLink } from '../features/programs/customProgram'
import { formatRelative } from '../utils/history'
import FavCardBody from './FavCardBody'
import AnchorMenu from './AnchorMenu'
import UiIcon from './UiIcon'
import PixelHeart from './PixelHeart'

/**
 * Единая карточка программы — Главная / Избранное / Раздел.
 * Различия пропсами:
 *  - glow        — обводка раздела со свечением (только Главная). Иначе — та же
 *                  обводка-«нитка» без свечения.
 *  - dots        — «⋯» в правом верхнем углу → компактное меню программы
 *                  (избранное / редактировать / поделиться / удалить).
 *  - lastTrained — серая надпись «последняя тренировка N дней назад» (Главная).
 *  - isFav/onToggleFav — состояние и переключение избранного (только из меню).
 *  - onOpen      — тап по карточке (переход на тренировку), задаёт вызывающий.
 *  - onDeleted   — после удаления своей программы (обновить список).
 *
 * Сердечка на самой карточке нет — избранное только через «⋯».
 */
export default function ProgramCard({
  prog,
  isFav = false,
  onToggleFav,
  onOpen,
  onDeleted,
  glow = false,
  dots = false,
  lastTrained = false
}) {
  const navigate = useNavigate()
  const [activeDay, setActiveDay] = useState(null)
  const [anchorRect, setAnchorRect] = useState(null) // null = меню закрыто
  const dotsRef = useRef(null)

  const available = prog.available !== false
  const accent = CATEGORY_META[prog.category]?.color || 'var(--color-primary)'

  useEffect(() => {
    if (!available) return
    let cancelled = false
    getActiveDay(prog.slug).then(d => { if (!cancelled) setActiveDay(d) })
    return () => { cancelled = true }
  }, [prog.slug, available])

  const handleTap = () => {
    if (anchorRect || !available) return
    // Главная передаёт свой onOpen (свайп-гард + state fromHome). Остальные —
    // дефолтная навигация на тренировку/заплыв.
    if (onOpen) { onOpen(); return }
    haptic.light()
    if (prog.kind === 'swim') {
      setTimeout(() => navigate(`/swim/${prog.slug}`), 80)
      return
    }
    const firstDay = prog.data?.days ? Object.keys(prog.data.days)[0] : 'A'
    setTimeout(() => navigate(`/workout/${prog.slug}/${activeDay || firstDay}`), 80)
  }

  const handleDotsTap = (e) => {
    e.stopPropagation()
    haptic.light()
    setAnchorRect(dotsRef.current?.getBoundingClientRect() || null)
  }
  const closeMenu = () => setAnchorRect(null)

  const handleEdit = () => { haptic.light(); navigate('/constructor') }
  const handleShare = async () => { haptic.light(); await shareProgramLink(prog.dbId) }
  const handleDelete = async () => {
    const ok = await confirm('Удалить эту программу?')
    if (!ok) return
    haptic.medium()
    const success = await deleteMyProgram(prog.dbId)
    if (success && onDeleted) onDeleted()
  }

  const lastDate = lastTrained && available ? localGet(`program:${prog.slug}:last_day_date`) : null
  const padRight = lastTrained ? 96 : dots ? 48 : 18

  const cardStyle = {
    ...styles.card,
    paddingRight: `${padRight}px`,
    opacity: available ? 1 : 0.55,
    cursor: available ? 'pointer' : 'default',
    border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
    ...(glow ? {
      boxShadow: `0 0 20px color-mix(in srgb, ${accent} 20%, transparent), inset 0 0 30px color-mix(in srgb, ${accent} 6%, transparent)`
    } : {})
  }

  return (
    <div
      onClick={handleTap}
      className={available ? 'press-tile' : ''}
      style={cardStyle}
    >
      <FavCardBody entry={{ prog, activeDay }} accent={accent} />

      {lastTrained && available && (
        <div style={styles.lastTrained}>
          {lastDate ? (
            <>
              <span style={styles.ltLabel}>ПОСЛЕДНЯЯ</span>
              <span style={styles.ltValue}>{formatRelative(lastDate)}</span>
            </>
          ) : (
            <span style={styles.ltValue}>Ещё не начинали</span>
          )}
        </div>
      )}

      {dots && available && (
        <button ref={dotsRef} onClick={handleDotsTap} style={styles.dotsBtn} aria-label="Меню программы">⋯</button>
      )}

      {anchorRect && (
        <AnchorMenu
          anchorRect={anchorRect}
          onClose={closeMenu}
          items={[
            {
              key: 'fav',
              icon: <PixelHeart filled={isFav} size={20} />,
              label: isFav ? 'Убрать из избранного' : 'Добавить в избранное',
              haptic: 'medium',
              onClick: () => onToggleFav?.()
            },
            ...(prog.editable ? [
              { divider: true },
              { key: 'edit', icon: <UiIcon name="change" size={20} color="#3FA2F7" />, label: 'Редактировать', onClick: handleEdit },
              { key: 'share', icon: <UiIcon name="invite-friend" size={20} color="#9ED153" />, label: 'Поделиться', onClick: handleShare },
              { key: 'delete', icon: <TrashIcon />, label: 'Удалить', labelColor: '#E84545', onClick: handleDelete }
            ] : [])
          ]}
        />
      )}
    </div>
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
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 18px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    width: '100%',
    minHeight: '130px',
    textAlign: 'left'
  },
  lastTrained: {
    position: 'absolute',
    top: '50%',
    right: '14px',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '3px',
    textAlign: 'right',
    maxWidth: '90px'
  },
  ltLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '9px',
    letterSpacing: '1.5px',
    color: 'rgba(255,255,255,0.32)'
  },
  ltValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    lineHeight: 1.25,
    color: 'var(--color-text-secondary)'
  },
  dotsBtn: {
    position: 'absolute',
    top: '8px',
    right: '12px',
    width: '34px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: '#9A9A9A',
    fontSize: '22px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '1px',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    zIndex: 2
  }
}
