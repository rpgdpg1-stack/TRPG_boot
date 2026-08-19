/**
 * Звёздочка — маркер СВОЕЙ активности (в отличие от рекомендованных приложением).
 *
 * Один компонент на «Дневной буст» и список активностей: раньше был двумя
 * побайтово одинаковыми копиями в DailyQuests и DailyBoost.
 */
export default function StarIcon({ size = 18, color = 'var(--color-warning)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L14.6 8.6 L20.7 9.3 L16.2 13.5 L17.4 19.5 L12 16.5 L6.6 19.5 L7.8 13.5 L3.3 9.3 L9.4 8.6 Z"
        fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}
