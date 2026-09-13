/**
 * Каталог программ — три строки списка. Из того же двухцветного набора, что и
 * StatsIcon: верхняя строка акцентная (та, что человек выберет), остальные
 * серые (всё, что ещё лежит в каталоге).
 *
 * Раньше здесь были две карточки одна под другой (Material view_agenda) —
 * одноцветные и потому неотличимые по смыслу от соседних значков.
 *
 * Сетка 24×24, те же пропорции, что у остальных иконок набора.
 */
export default function ProgramsIcon({
  size = 22,
  accent = 'var(--color-primary)',
  muted = 'var(--color-text-secondary)'
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4.6" rx="2.3" fill={accent} />
      <rect x="3" y="9.7" width="18" height="4.6" rx="2.3" fill={muted} />
      <rect x="3" y="15.4" width="18" height="4.6" rx="2.3" fill={muted} />
    </svg>
  )
}
