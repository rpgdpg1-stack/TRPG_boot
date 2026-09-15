import { getPlaceMeta } from '../features/programs/registry'
import { haptic } from '../lib/telegram'
import ModalShell from './ModalShell'
import CloseCross from './CloseCross'
import UiIcon from './UiIcon'

/**
 * Выбор места тренировки (Зал/Дом/Улица) для программы.
 *
 * Открывается из меню долгого нажатия карточки программы — пунктом
 * «Место тренировки: Зал». На самой карточке и в шапке дня места НЕТ: его
 * меняют редко, и каждый день видеть «Зал» незачем.
 *
 * Кнопки «Сохранить» нет: тап по месту и есть выбор — он сразу применяется,
 * окно закрывается. Выбранное место залито акцентом, остальные — тегами.
 *
 * @param places  — доступные места программы (getProgramPlaces).
 * @param value   — выбранное сейчас.
 * @param onPick  — выбрать место (запись делает вызывающий).
 * @param onClose — закрыть без выбора.
 */
export default function PlacePickerModal({ places, value, onPick, onClose }) {
  const pick = (loc) => {
    if (loc !== value) {
      haptic.selection()
      onPick(loc)
    }
    onClose()
  }

  return (
    <ModalShell onClose={onClose}>
      <div style={styles.panel}>
        <CloseCross
          onClose={onClose}
          hitSize={44}
          bubbleSize={32}
          iconSize={16}
          style={{ position: 'absolute', top: '6px', right: '6px', zIndex: 5 }}
        />
        <div style={styles.title}>Место тренировки</div>
        <div style={styles.hint}>Упражнения дней подберутся под это место</div>
        <div style={styles.row}>
          {places.map(loc => {
            const meta = getPlaceMeta(loc)
            const on = loc === value
            return (
              <button
                key={loc}
                onClick={() => pick(loc)}
                className="press-tile"
                style={{
                  ...styles.pill,
                  background: on ? 'var(--color-primary)' : 'var(--color-surface-active)',
                  color: on ? 'var(--accent-on)' : 'var(--color-text)'
                }}
              >
                <UiIcon name={meta.icon} size={18} />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>
    </ModalShell>
  )
}

const styles = {
  // Панель — по значениям модалок проекта (trpg-ui/reference/modals.md).
  panel: {
    position: 'relative',
    width: 'min(360px, calc(100vw - 40px))',
    background: 'var(--surface-raised)',
    border: '1px solid var(--layer-2)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-modal)',
    padding: 'var(--space-5)'
  },
  title: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-title-size)', fontWeight: 800,
    color: 'var(--color-text)', paddingRight: 'var(--space-8)'
  },
  hint: {
    marginTop: 'var(--space-1)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)'
  },
  row: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-4)' },
  // Тот же тег места, что был на карточке, но крупнее: это цель для пальца
  // (≥36 высотой), а не подпись.
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-15)',
    minHeight: '40px', padding: '0 var(--space-4)',
    border: 'none', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-body-size)', letterSpacing: '0.5px',
    whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.18s ease, color 0.18s ease'
  }
}
