/**
 * Иконка часов (тонкий контур, currentColor). Единый источник для оценки
 * длительности и таймера (шапка дня, карточки главной/избранного).
 */
export default function ClockIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.6 V8 L10.4 9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
