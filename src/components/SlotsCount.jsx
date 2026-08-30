/**
 * Счётчик занятых слотов из лимита: «3/12».
 *
 * Читается как «сколько уже набрал» + «сколько всего можно». Поэтому и цвета
 * разные: набранное — акцентом (это результат человека), знаменатель — серым
 * (это рамка, а не достижение). Пока не набрано ничего, зелёному взяться
 * неоткуда — ноль такой же серый, как и лимит.
 *
 * Живёт в кнопках «Добавить» конструктора программы и пикера упражнений —
 * отсюда и отдельный компонент: один смысл в двух местах, разъезжаться им
 * нельзя (см. trpg-ui «Не заводи вторую копию»).
 *
 * Размер шрифта и начертание НЕ задаёт — наследует от кнопки, в которой стоит.
 */
export default function SlotsCount({ value, max }) {
  return (
    <span style={styles.wrap}>
      <span style={value > 0 ? styles.valueActive : styles.valueEmpty}>{value}</span>
      <span style={styles.max}>/{max}</span>
    </span>
  )
}

const styles = {
  // Внутри — без зазора: «3/12» это одно число-дробь, а не три элемента.
  wrap: { display: 'inline-flex', alignItems: 'baseline' },
  valueActive: { color: 'var(--color-primary)' },
  valueEmpty: { color: 'var(--color-text-secondary)' },
  max: { color: 'var(--color-text-secondary)' }
}
