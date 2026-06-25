/**
 * Кнопка для модалок/диалогов в нативном стиле (серая «пилюля», как кнопки
 * iOS-алерта «Понятно / ОК / Отмена»). НЕ акцентная — для дисмисса инфо-попапов
 * и нейтральных выборов (в отличие от зелёной ActionButton accent для основных
 * действий вроде «Завершить»/«Сохранить программу»).
 *
 * Фон и подсветка нажатия — в классе `.modal-btn` (index.css): при нажатии серый
 * становится ярче (как строки меню), без scale.
 *
 * По умолчанию во всю ширину; в ряд (две кнопки) — обернуть в flex и передать
 * style={{ flex: 1 }} каждой.
 */
export default function ModalButton({ onClick, children, style, className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`modal-btn ${className}`.trim()}
      style={{ ...styles.btn, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}

const styles = {
  btn: {
    width: '100%',
    padding: '15px 18px',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    borderRadius: 'var(--radius-pill)',
    border: 'none',
    cursor: 'pointer'
  }
}
