import ChevronIcon from './ChevronIcon'
import { haptic } from '../lib/telegram'

/**
 * Пара круглых стрелок «‹ ›» для листания периодов — ОДНА на проект.
 *
 * Стоят вместе у ПРАВОГО края своей строки (слева в той же строке — название
 * периода), как в календарях-референсах: два действия рядом читаются как один
 * переключатель, а разнесённые по краям заставляют искать вторую стрелку.
 *
 * Кружок 36px в общем стиле икон-кнопок проекта, хит-зона 44px (зал, потные
 * пальцы). Недоступное направление гаснет и не тапается — вместо него ничего
 * не подставляем, ряд не прыгает.
 *
 * <PagerArrows onPrev={} onNext={} canPrev={} canNext={} prevLabel="" nextLabel="" />
 */
export default function PagerArrows({
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  prevLabel = 'Назад',
  nextLabel = 'Вперёд'
}) {
  return (
    <div style={styles.row}>
      <Arrow dir="prev" enabled={canPrev} onTap={onPrev} label={prevLabel} />
      <Arrow dir="next" enabled={canNext} onTap={onNext} label={nextLabel} />
    </div>
  )
}

function Arrow({ dir, enabled, onTap, label }) {
  const prev = dir === 'prev'
  return (
    <button
      type="button"
      className="press-tile"
      style={styles.hit}
      disabled={!enabled}
      aria-label={label}
      onClick={() => { if (!enabled) return; haptic.selection(); onTap?.() }}
    >
      <span style={{ ...styles.circle, opacity: enabled ? 1 : 0.35 }}>
        {/* Шеврон проекта смотрит ВНИЗ — доворачиваем влево/вправо. */}
        <span style={{ display: 'inline-flex', transform: `rotate(${prev ? 90 : -90}deg)` }}>
          <ChevronIcon size={18} width={2.4} />
        </span>
      </span>
    </button>
  )
}

const styles = {
  row: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 },
  // Прозрачная зона тапа вокруг видимого кружка — правило проекта (≥44px).
  hit: {
    width: '44px', height: '44px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent'
  },
  circle: {
    width: '36px', height: '36px', borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--layer-2)', color: 'var(--color-text)',
    transition: 'opacity 0.18s ease'
  }
}
