import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/telegram'
import { getDailyQuests, getDailyQuestsSync, completeQuest } from '../lib/storage'
import { EVENTS, on } from '../lib/events'
import {
  WINDOWS, SLOT_XP,
  getActivitiesConfigSync, fetchActivitiesConfig, saveActivitiesConfig,
  getCurrentWindowIndex, isWindowOpen, windowOpenLabel,
  getRecommendedForWindow, getCustomDone, setCustomDone
} from '../lib/activities'
import AnchorMenu from './AnchorMenu'
import UiIcon from './UiIcon'
import MuscleIcon from './MuscleIcon'

/**
 * Виджет «Активности» на главной — ОДНА карточка текущего окна (утро/день/вечер),
 * листается свайпом влево/вправо. В окне: рекомендуемая активность (если включены
 * рекомендации) и/или своя (если включены и заданы). Тап по строке — выполнено:
 * чистая зелёная галочка + строка гаснет в серый. За рекомендуемую — награда через
 * completeQuest; за свою баллов нет. ⋯ справа — показать/скрыть рекомендации и
 * добавить свою (→ страница конструктора /daily-boost).
 *
 * Прошлые/будущие окна доступны свайпом: будущее (по времени) — под блюром с
 * подписью «Откроется в HH:00».
 */
const TAP_THRESHOLD_PX = 8

/** Звёздочка — маркер СВОЕЙ активности. */
function StarIcon({ size = 18, color = '#FFD25A' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L14.6 8.6 L20.7 9.3 L16.2 13.5 L17.4 19.5 L12 16.5 L6.6 19.5 L7.8 13.5 L3.3 9.3 L9.4 8.6 Z"
        fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

export default function DailyQuests() {
  const navigate = useNavigate()

  const [config, setConfig] = useState(getActivitiesConfigSync)
  const [completed, setCompleted] = useState(() => getDailyQuestsSync())
  const [customDone, setCustomDoneState] = useState(() => getCustomDone())
  const [winIdx, setWinIdx] = useState(() => getCurrentWindowIndex())
  const [slideDir, setSlideDir] = useState(null)
  const [animating, setAnimating] = useState(null)
  const [floatingRewards, setFloatingRewards] = useState([])
  const [menuAnchor, setMenuAnchor] = useState(null)

  const swipe = useRef({ x: null })
  const menuBtnRef = useRef(null)

  // Рекомендуемые дня — по одной на окно (детерминированно).
  const recByWindow = WINDOWS.map(w => getRecommendedForWindow(w.id))

  // Прогресс рекомендуемых (сервер/локально) — как раньше.
  useEffect(() => {
    const load = () => {
      getDailyQuests().then(result => {
        setCompleted(prev => {
          const prevDone = Object.keys(prev).length
          const nextDone = Object.keys(result).length
          if (nextDone === 0 && prevDone > 0) return prev
          return result
        })
      })
    }
    load()
    const offReady = on(EVENTS.USER_READY, load)
    const offChanged = on(EVENTS.USER_CHANGED, load)
    return () => { offReady(); offChanged() }
  }, [])

  // Догоняем конфиг из облака + слушаем изменения из конструктора.
  useEffect(() => {
    fetchActivitiesConfig().then(cfg => { if (cfg) setConfig(cfg) })
    const onCfg = () => setConfig(getActivitiesConfigSync())
    window.addEventListener('activities-changed', onCfg)
    return () => window.removeEventListener('activities-changed', onCfg)
  }, [])

  const goWindow = (idx) => {
    const clamped = Math.max(0, Math.min(WINDOWS.length - 1, idx))
    if (clamped === winIdx) return
    setSlideDir(clamped > winIdx ? 'right' : 'left')
    setWinIdx(clamped)
    haptic.light()
  }

  const onTouchStart = (e) => { swipe.current.x = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    const startX = swipe.current.x
    swipe.current.x = null
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) < 45) return
    if (dx < 0) goWindow(winIdx + 1)
    else goWindow(winIdx - 1)
  }

  // Тап по рекомендуемой — выполнить (награда через completeQuest).
  const tapRecommended = async (rec, win) => {
    if (!rec || completed[rec.id] || animating || !isWindowOpen(win)) return
    haptic.success()
    setAnimating(rec.id)
    const result = await completeQuest(rec.id, SLOT_XP)
    setCompleted(result.completed)
    if (result.wasNew) {
      const key = Date.now()
      setFloatingRewards(prev => [...prev, { id: rec.id, xp: SLOT_XP, key }])
      setTimeout(() => setFloatingRewards(prev => prev.filter(r => r.key !== key)), 1100)
    }
    setTimeout(() => setAnimating(null), 600)
  }

  // Тап по своей — просто отметить (баллов нет).
  const tapCustom = (win) => {
    if (customDone[win.id] || !isWindowOpen(win)) return
    haptic.success()
    setCustomDoneState(setCustomDone(win.id, true))
  }

  const toggleRecommended = () => {
    setMenuAnchor(null)
    setConfig(saveActivitiesConfig({ ...config, showRecommended: !config.showRecommended }))
    haptic.light()
  }

  const win = WINDOWS[winIdx]
  const rec = recByWindow[winIdx]
  const custom = config.showCustom ? config.custom[win.id] : null
  const open = isWindowOpen(win)
  const showRec = config.showRecommended && rec
  const nothing = !showRec && !custom

  const slideClass = slideDir === 'right' ? 'hslide-in-right' : slideDir === 'left' ? 'hslide-in-left' : undefined

  return (
    <div style={styles.container}>
      {/* ⋯ меню справа сверху. */}
      <button
        ref={menuBtnRef}
        onClick={() => setMenuAnchor(menuBtnRef.current?.getBoundingClientRect() || null)}
        style={styles.menuBtn}
        aria-label="Меню активностей"
      >⋯</button>

      <div style={styles.swipeArea} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div key={winIdx} className={slideClass}>
          {/* Шапка окна: эмодзи + название + (закрыто → время открытия). */}
          <div style={styles.winHeader}>
            <span style={styles.winEmoji}>{win.emoji}</span>
            <span style={styles.winLabel}>{win.label}</span>
            {!open && <span style={styles.winLocked}>· откроется в {windowOpenLabel(win)}</span>}
          </div>

          {nothing ? (
            <div style={styles.emptyHint}>
              {config.showRecommended ? 'Пусто — добавь свою активность' : 'Активности скрыты'}
            </div>
          ) : (
            <div style={{ ...styles.rows, filter: open ? 'none' : 'blur(3px)', opacity: open ? 1 : 0.55 }}>
              {showRec && (
                <Row
                  emoji={rec.emoji}
                  title={rec.title}
                  benefit={rec.benefit}
                  done={!!completed[rec.id]}
                  scale={animating === rec.id}
                  reward={floatingRewards.find(r => r.id === rec.id)}
                  onTap={() => tapRecommended(rec, win)}
                />
              )}
              {custom && (
                <Row
                  star
                  title={custom.title}
                  benefit={custom.benefit}
                  done={!!customDone[win.id]}
                  onTap={() => tapCustom(win)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {menuAnchor && (
        <AnchorMenu
          anchorRect={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          items={[
            {
              key: 'toggle',
              icon: <UiIcon name={config.showRecommended ? 'info' : 'power'} size={18} color="var(--color-text-secondary)" />,
              label: config.showRecommended ? 'Скрыть рекомендации' : 'Показать рекомендации',
              onClick: toggleRecommended
            },
            {
              key: 'add',
              icon: <StarIcon size={16} />,
              label: 'Добавить свою активность',
              onClick: () => { setMenuAnchor(null); navigate('/daily-boost') }
            }
          ]}
        />
      )}
    </div>
  )
}

/** Строка активности: слева слот галочки (пуст → зелёная галочка), эмодзи/звезда,
    текст (название + польза), справа — награда (только у рекомендуемой). */
function Row({ emoji, star, title, benefit, done, scale, reward, onTap }) {
  const startRef = useRef(null)
  const onDown = (e) => { startRef.current = { x: e.clientX, y: e.clientY } }
  const onUp = (e) => {
    const s = startRef.current; startRef.current = null
    if (!s) return
    if (Math.abs(e.clientX - s.x) > TAP_THRESHOLD_PX || Math.abs(e.clientY - s.y) > TAP_THRESHOLD_PX) return
    if (!done) onTap?.()
  }
  return (
    <button
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => { startRef.current = null }}
      disabled={done}
      style={{
        ...styles.row,
        opacity: done ? 0.5 : 1,
        cursor: done ? 'default' : 'pointer',
        transform: scale ? 'scale(0.97)' : 'scale(1)'
      }}
    >
      <div style={styles.checkWrap}>
        {done && <UiIcon name="check" size={20} color="var(--color-primary)" />}
      </div>
      <span style={styles.rowIcon}>
        {star ? <StarIcon size={20} /> : emoji}
      </span>
      <div style={styles.textCol}>
        <span style={{ ...styles.title, color: done ? 'var(--color-text-secondary)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}>
          {title}
        </span>
        {benefit && <span style={{ ...styles.benefit, opacity: done ? 0.5 : 1 }}>{benefit}</span>}
      </div>
      {!star && (
        <div style={styles.rewardWrap}>
          <span style={{ ...styles.reward, opacity: done ? 0.5 : 1, textDecoration: done ? 'line-through' : 'none' }}>
            +{SLOT_XP} <MuscleIcon size={18} earned={done} />
          </span>
          {reward && (
            <span key={reward.key} style={styles.floatingReward}>
              +{reward.xp} <MuscleIcon size={18} earned={true} />
            </span>
          )}
        </div>
      )}
    </button>
  )
}

const styles = {
  container: {
    position: 'relative',
    padding: '10px 14px 12px',
    background: 'var(--surface)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)'
  },
  menuBtn: {
    position: 'absolute',
    top: '4px',
    right: '10px',
    width: '34px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: '20px',
    lineHeight: 1,
    cursor: 'pointer',
    zIndex: 2,
    WebkitTapHighlightColor: 'transparent'
  },
  swipeArea: { touchAction: 'pan-y' },
  winHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '2px 4px 8px'
  },
  winEmoji: { fontSize: '17px', lineHeight: 1 },
  winLabel: {
    fontFamily: 'var(--font-manrope)',
    fontWeight: 700,
    fontSize: '15px',
    color: 'var(--color-text)',
    letterSpacing: '0.2px'
  },
  winLocked: {
    fontFamily: 'var(--font-manrope)',
    fontWeight: 500,
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    transition: 'filter 0.3s ease, opacity 0.3s ease'
  },
  emptyHint: {
    padding: '16px 6px',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    color: 'var(--color-text-secondary)'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 6px',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderRadius: 'var(--radius-medium)',
    transition: 'transform 90ms cubic-bezier(0.4, 0, 0.6, 1), opacity 0.3s ease'
  },
  checkWrap: {
    position: 'relative',
    flexShrink: 0,
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  rowIcon: {
    fontSize: '24px',
    lineHeight: 1,
    flexShrink: 0,
    width: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  textCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' },
  title: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1.2
  },
  benefit: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: 1.2,
    color: 'var(--color-text-secondary)'
  },
  rewardWrap: { position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' },
  reward: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '12px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px'
  },
  floatingReward: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--color-primary)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    textShadow: '0 0 8px rgba(158, 209, 83, 0.7)',
    animation: 'rewardFloatUp 1.1s ease-out forwards'
  }
}
