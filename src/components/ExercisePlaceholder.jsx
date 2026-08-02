import UiIcon from './UiIcon'

/**
 * Заглушка превью упражнения — когда у упражнения нет картинки.
 *
 * Раньше в семи местах стояло эмодзи 💪 разного кегля (22/28/34/40/64px).
 * Эмодзи рендерится системным шрифтом: на разных Android оно другой формы и
 * цвета, ломает ритм и не подчиняется теме. Заменено на свой `muscles.svg`.
 *
 * Плашка превью всегда белая, поэтому иконка тёмная и приглушённая — читается
 * как «здесь будет картинка», а не как самостоятельный элемент.
 */
export default function ExercisePlaceholder({ size = 24 }) {
  return (
    <span style={{ ...s.wrap, opacity: 0.35 }}>
      <UiIcon name="muscles" size={size} color="var(--bg-base)" />
    </span>
  )
}

const s = {
  wrap: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
}
