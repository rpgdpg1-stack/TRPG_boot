/**
 * Метаданные разделов (категорий) для отображения: название, иконка, цвет.
 * Единый источник для экранов, где нужно показать раздел с иконкой
 * (страница избранного и т.п.). iconName — имя SVG из assets/ui (через UiIcon).
 */

export const CATEGORY_META = {
  gym:     { title: 'Силовая',  iconName: 'power',      color: 'var(--cat-gym)' },
  pool:    { title: 'Плавание', iconName: 'swimming',   color: 'var(--cat-pool)' },
  cardio:  { title: 'Кардио',   iconName: 'cardio',     color: 'var(--cat-cardio)' },
  stretch: { title: 'Растяжка', iconName: 'stretching', color: 'var(--cat-stretch)' }
}

export const CATEGORY_ORDER = ['gym', 'pool', 'cardio', 'stretch']
