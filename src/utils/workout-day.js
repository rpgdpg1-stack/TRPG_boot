/**
 * Мелкие помощники экрана дня тренировки.
 */
export function getRealScrollY() {
  const top = document.body.style.top
  if (document.body.style.position === 'fixed' && top) {
    return -parseInt(top, 10) || 0
  }
  return window.scrollY
}

export function groupByMuscleGroup(slots) {
  if (!slots.length) return []
  const sections = []
  let current = null
  for (const slot of slots) {
    if (!current || current.muscleGroup !== slot.muscle_group) {
      current = { muscleGroup: slot.muscle_group, slots: [] }
      sections.push(current)
    }
    current.slots.push(slot)
  }
  return sections
}

/**
 * Пикер дней — стеклянная мини-модалка, выскакивает из ЦЕНТРА буквы дня (растёт
 * из неё, перекрывает её). Показывает все дни программы (A/B/C) по порядку:
 * «фокусный» день зелёный (рекомендованный/активный), текущий — подсвечен. Тап по
 * дню — переключение; тап по фону — закрытие (уезжает обратно в центр). Портал
 * в body; позиция fixed по центру буквы (anchorRect).
 */
