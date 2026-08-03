import { useEffect } from 'react'

/**
 * Блокировка прокрутки страницы под модалкой — надёжно, без `position:fixed` на body
 * (он ломает закреплённую шапку дня) и без надежды на `overscroll-behavior`.
 *
 * Почему CSS недостаточно: `overscroll-behavior:contain` действует только на РЕАЛЬНО
 * прокручиваемом контейнере. Когда контент модалки влезает в экран, прокручивать
 * внутри нечего — и браузер отдаёт жест странице под ней (фон уезжает).
 *
 * Хук вешает на оверлей `touchmove` с `passive:false` и гасит жест, если прокрутка
 * внутри невозможна ИЛИ уже упёрлась в край. Если под пальцем есть прокручиваемый
 * блок с запасом хода — не мешаем, он скроллится как обычно.
 *
 * Использование: `const ref = useRef(null); useScrollLock(ref)` и `ref` на оверлей.
 *
 * Слушатели висят на `document`, а не на самом оверлее, и каждый раз сверяются с
 * `ref.current`. Это принципиально: модалка часто рендерится УСЛОВНО внутри
 * страницы, и на момент монтирования компонента оверлея ещё нет — привязка к
 * элементу тогда молча не срабатывала бы (эффект отработал бы один раз с null).
 * Пока оверлея нет, обработчик выходит на первой строке и ничего не стоит.
 */
export function useScrollLock(overlayRef) {
  useEffect(() => {
    let startY = 0
    let startX = 0
    const onStart = (e) => {
      startY = e.touches[0]?.clientY ?? 0
      startX = e.touches[0]?.clientX ?? 0
    }

    const onMove = (e) => {
      const el = overlayRef.current
      if (!el || !el.contains(e.target)) return
      if (e.touches.length > 1) return
      const dy = (e.touches[0]?.clientY ?? 0) - startY
      const dx = (e.touches[0]?.clientX ?? 0) - startX

      // Горизонтальный жест не трогаем вовсе: страница под модалкой прокручивается
      // по вертикали, увести её вбок он не может — зато внутри модалок живут
      // горизонтальные ленты (пилюли групп и подгрупп в пикере упражнений), и
      // раньше их свайп гасился здесь вместе со всем остальным.
      if (Math.abs(dx) > Math.abs(dy)) return

      // Ищем прокручиваемого предка под пальцем — в пределах оверлея.
      let node = e.target
      while (node && node !== el && node.nodeType === 1) {
        const oy = getComputedStyle(node).overflowY
        const scrollable = (oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1
        if (scrollable) {
          const atTop = node.scrollTop <= 0
          const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1
          // Есть куда скроллить в нужную сторону — отдаём жест ему.
          if (!((atTop && dy > 0) || (atBottom && dy < 0))) return
          break
        }
        node = node.parentElement
      }

      e.preventDefault()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
    }
  }, [overlayRef])
}
