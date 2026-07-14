/**
 * Эмблема программы — первая буква/цифра названия в скруглённом квадрате,
 * залитом цветом раздела (силовая — зелёный, плавание — cat-pool и т.д.),
 * буква чёрная. Единый визуальный язык с бейджами календаря.
 *
 * Букву берём как первый буквенно-цифровой символ названия, пропуская эмодзи,
 * пробелы и символы: «🏋️ Сплит» → «С», «Full Body» → «F», «5×5» → «5».
 * Для своей программы меняется автоматически вместе с названием.
 */

// Цвет раздела — зеркалит workoutCategoryMeta (utils/history), чтобы эмблема и
// метки календаря были одного цвета.
function categoryColor(category, kind) {
  if (kind === 'swim' || category === 'pool') return 'var(--cat-pool)'
  if (category === 'cardio') return 'var(--cat-cardio)'
  if (category === 'stretch') return 'var(--cat-stretch)'
  return 'var(--cat-gym)' // gym / силовая — графитовый серый
}

// Первый буквенно-цифровой символ (по кодпоинтам, чтобы корректно пропускать эмодзи).
function emblemChar(title) {
  if (!title) return '?'
  for (const ch of title) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase()
  }
  return '?'
}

export default function ProgramEmblem({ program, size = 44 }) {
  const color = categoryColor(program?.category, program?.kind)
  const ch = emblemChar(program?.title)
  // «Скоро»/недоступная программа — эмблема чуть приглушена.
  const dim = program?.comingSoon || program?.available === false
  return (
    <span
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.3)}px`,
        background: color,
        opacity: dim ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
    >
      <span style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: `${Math.round(size * 0.5)}px`,
        color: '#0D0C0C',
        lineHeight: 1
      }}>{ch}</span>
    </span>
  )
}
