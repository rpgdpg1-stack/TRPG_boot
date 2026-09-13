/**
 * Статистика — график в рамке. Часть НОВОГО НАБОРА ДВУХЦВЕТНЫХ ИКОНОК:
 * контур серый (вторичный текст), смысловая часть внутри — акцентная зелёная.
 *
 * Почему не одноцветная, как остальные в `assets/ui`. Те наследуют currentColor
 * и красятся целиком одним цветом — на карточке-входе такая иконка либо вся
 * зелёная (кричит громче заголовка), либо вся серая (не видно, что это вход).
 * Здесь роли разведены: рамка — оболочка, линия — то, ради чего заходят.
 *
 * Сетка 24×24, толщина 2, скругления на стыках — единая для всего набора.
 */
export default function StatsIcon({
  size = 22,
  accent = 'var(--color-primary)',
  muted = 'var(--color-text-secondary)'
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5.5"
        stroke={muted} strokeWidth="2" />
      <path d="M7.2 14.6 L10.4 11 L12.9 13.3 L16.8 8.8"
        stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
