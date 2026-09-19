/**
 * Крестик закрытия — обёртка над IconButton (variant 'close'). В Figma — Close Button.
 *
 * Поведение общее для всех оверлеев: тап — кружок растёт и светлеет, крестик белеет;
 * увёл палец — вернулся, действие НЕ срабатывает; отпустил на крестике — onClose().
 * Закрытие по pointerUp, поэтому следующий click гасится (swallowClick): иначе он попал бы
 * на элемент ПОД снятой модалкой.
 *
 * Размер кружка — по шкале круглых кнопок (19.09.2026): bubbleSize ≥ 44 → Large 52,
 * ≥ 34 → Medium 36, меньше → Small 30; иконка 28 / 24 / 20 (iconSize больше не нужен).
 * glass — крестик висит НАД контентом (шапка дня/заплыва): стекло + волосок.
 * bubbleStyle — доводка кружка, когда он стоит в ряд с другими контролами (поиск в пикере).
 */
import IconButton from './IconButton'

export default function CloseCross({ onClose, hitSize = 56, bubbleSize = 46, pulse = false, glass = false, style, bubbleStyle }) {
  const size = bubbleSize >= 44 ? 'large' : bubbleSize >= 34 ? 'medium' : 'small'
  return (
    <IconButton
      icon="close"
      variant="close"
      size={size}
      glass={glass}
      pulse={pulse}
      hitSize={hitSize}
      onPress={onClose}
      ariaLabel="Закрыть"
      swallowClick
      style={style}
      bubbleStyle={bubbleStyle}
    />
  )
}
