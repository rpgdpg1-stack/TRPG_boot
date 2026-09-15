import { haptic } from '../lib/telegram'
import ModalShell from './ModalShell'
import CloseCross from './CloseCross'
import PlaceSegment from './PlaceSegment'

/**
 * Выбор места тренировки (Зал/Дом/Улица) для программы.
 *
 * Открывается из меню долгого нажатия карточки программы — пунктом
 * «Место тренировки: Зал». На самой карточке и в шапке дня места НЕТ: его
 * меняют редко, и каждый день видеть «Зал» незачем.
 *
 * Кнопки «Сохранить» нет: тап по месту и есть выбор — он сразу сохраняется,
 * а окно остаётся открытым, чтобы было видно, как подсветка переехала на новое
 * место. Закрывают крестиком или тапом мимо. Вид — общий сегмент мест, как в
 * конструкторе, с хайрлайном: без него контейнер сливался с панелью.
 *
 * @param places  — доступные места программы (getProgramPlaces).
 * @param value   — выбранное сейчас.
 * @param onPick  — выбрать место (запись делает вызывающий).
 * @param onClose — закрыть (крестик / тап мимо).
 */
export default function PlacePickerModal({ places, value, onPick, onClose }) {
  const pick = (loc) => {
    if (loc === value) return
    haptic.selection()
    onPick(loc)
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
          <PlaceSegment places={places} value={value} onPick={pick} stretch />
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
  row: { display: 'flex', marginTop: 'var(--space-4)' }
}
