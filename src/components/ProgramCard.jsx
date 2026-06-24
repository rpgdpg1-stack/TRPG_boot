import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, confirm } from '../lib/telegram'
import { getActiveDay } from '../lib/storage'
import { localGet } from '../utils/storage'
import { CATEGORY_META } from '../features/programs/categories'
import { deleteMyProgram, shareProgramLink } from '../features/programs/customProgram'
import { formatRelative } from '../utils/history'
import FavCardBody from './FavCardBody'
import ProgramActionMenu from './ProgramActionMenu'
import PixelHeart from './PixelHeart'

/**
 * Единая карточка программы — используется на Главной, в Избранном и в Разделе.
 * Один компонент, поведение и размеры одинаковы везде; различия — пропсами:
 *
 *  - glow        — обводка раздела со свечением (только Главная). Без него —
 *                  та же обводка-«нитка», но без свечения.
 *  - heart       — 'none' | 'center' — сердечко избранного по центру справа.
 *  - dots        — «⋯» в правом верхнем углу + long-press → меню программы.
 *  - lastTrained — серая надпись «последняя тренировка N дней назад» (только Главная).
 *  - isFav/onToggleFav — состояние и переключение избранного (сердечко + меню).
 *  - onOpen      — тап по карточке (переход на тренировку), задаёт вызывающий.
 *  - onDeleted   — после удаления своей программы (обновить список).
 */
export default function ProgramCard({
  prog,
  isFav = false,
  onToggleFav,
  onOpen,
  onDeleted,
  glow = false,
  heart = 'none',
  dots = false,
  lastTrained = false
}) {
  const navigate = useNavigate()
  const [activeDay, setActiveDay] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const lpTimer = useRef(null)
  const lpFired = useRef(false)
  const lpStart = useRef({ x: 0, y: 0 })

  const available = prog.available !== false
  const accent = CATEGORY_META[prog.category]?.color || 'var(--color-primary)'

  useEffect(() => {
    if (!available) return
    let cancelled = false
    getActiveDay(prog.slug).then(d => { if (!cancelled) setActiveDay(d) })
    return () => { cancelled = true }
  }, [prog.slug, available])

  // Long-press по карточке → меню программы (как в дне тренировки).
  const handleLPDown = (e) => {
    if (!available || !dots || menuOpen) return
    lpFired.current = false
    lpStart.current = { x: e.clientX, y: e.clientY }
    if (lpTimer.current) clearTimeout(lpTimer.current)
    lpTimer.current = setTimeout(() => {
      lpFired.current = true
      haptic.medium()
      setMenuOpen(true)
    }, 450)
  }
  const handleLPMove = (e) => {
    if (!lpTimer.current) return
    if (Math.abs(e.clientX - lpStart.current.x) > 10 || Math.abs(e.clientY - lpStart.current.y) > 10) {
      clearTimeout(lpTimer.current); lpTimer.current = null
    }
  }
  const handleLPUp = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null } }

  const handleTap = () => {
    if (lpFired.current) { lpFired.current = false; return }
    if (menuOpen || !available) return
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

  const handleDotsTap = (e) => { e.stopPropagation(); haptic.light(); setMenuOpen(true) }
  const handleHeartTap = (e) => { e.stopPropagation(); haptic.medium(); onToggleFav?.() }

  // Действия меню для своей программы.
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

  const padRight = lastTrained ? 96 : (heart === 'center' || dots) ? 48 : 18
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
      onPointerDown={handleLPDown}
      onPointerMove={handleLPMove}
      onPointerUp={handleLPUp}
      onPointerLeave={handleLPUp}
      onPointerCancel={handleLPUp}
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

      {heart === 'center' && available && (
        <button
          onClick={handleHeartTap}
          style={styles.heartCenter}
          aria-label={isFav ? 'Убрать из избранного' : 'В избранное'}
        >
          <PixelHeart filled={isFav} size={22} />
        </button>
      )}

      {dots && available && (
        <button onClick={handleDotsTap} style={styles.dotsBtn} aria-label="Меню программы">⋯</button>
      )}

      {menuOpen && (
        <ProgramActionMenu
          prog={prog}
          activeDay={activeDay}
          accent={accent}
          isFav={isFav}
          onToggleFav={onToggleFav}
          editable={prog.editable}
          onEdit={() => { setMenuOpen(false); handleEdit() }}
          onShare={() => { setMenuOpen(false); handleShare() }}
          onDelete={() => { setMenuOpen(false); handleDelete() }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
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
  heartCenter: {
    position: 'absolute',
    bottom: '10px',
    right: '12px',
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
