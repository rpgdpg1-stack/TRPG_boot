import { useEffect } from 'react'
import { pluralizeWorkouts } from '../utils/plural'

/**
 * Поп-ап-пояснение к огоньку серии.
 *
 * Один компонент на все места, где показан огонёк с числом: шапка профиля
 * и строка-информер на главной. Раньше он жил вёрсткой внутри ProfileHeader,
 * и на главной такого объяснения не было вовсе — хотя именно там человек
 * впервые видит огонёк и не понимает, что это за цифра.
 *
 * Сам держит своё закрытие: тап мимо, Esc и автоскрытие. Так место вызова
 * знает только «открыт/закрыт», и три копии одной логики не расходятся.
 *
 * ПОЗИЦИЯ. Родитель обязан быть `position: relative` — поп-ап absolute внутри
 * него. `align='right'` прижимает к правому краю якоря (профиль, огонёк справа),
 * `align='center'` центрирует (главная, строка по центру экрана).
 *
 * @param anchorRef — ref якоря: тап внутри него не считается «мимо», иначе
 *   повторный тап по огоньку закрывал бы и тут же открывал поп-ап заново.
 */
export default function StreakInfoPopup({ streak = 0, open, onClose, align = 'right', anchorRef }) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => onClose?.(), AUTO_CLOSE_MS)
    const onOutside = (e) => {
      if (anchorRef?.current?.contains(e.target)) return
      onClose?.()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const n = streak || 0

  return (
    <div
      role="status"
      onClick={(e) => e.stopPropagation()}
      style={{ ...styles.popup, ...(align === 'center' ? styles.alignCenter : styles.alignRight) }}
    >
      <div style={styles.title}>Серия за неделю</div>
      <div style={styles.body}>
        {n >= 1 ? (
          <>
            <b style={styles.num}>{n}</b> {pluralizeWorkouts(n)} с начала недели.
            В понедельник счёт начинается заново.
          </>
        ) : (
          'На этой неделе тренировок ещё нет. Заверши первую — огонёк загорится.'
        )}
      </div>
    </div>
  )
}

// 6 секунд: короткая фраза читается за 3–4, остаток — запас на «отвлёкся».
// Дольше держать нельзя, поп-ап перекрывает контент под собой.
const AUTO_CLOSE_MS = 6000

const styles = {
  popup: {
    position: 'absolute',
    top: 'calc(100% + var(--space-2))',
    // Ширина по содержимому, но не шире экрана с полями: на узких телефонах
    // жёсткие 230px упирались в край и обрезались.
    width: 'max-content',
    maxWidth: 'min(260px, calc(100vw - var(--space-8)))',
    background: 'var(--surface-raised)',
    backdropFilter: 'blur(var(--blur-md))',
    WebkitBackdropFilter: 'blur(var(--blur-md))',
    // Обводка в цвет серии — поп-ап читается как продолжение огонька, а не как
    // случайное окно. Раньше цвет был вписан числом мимо токенов.
    border: '1px solid color-mix(in srgb, var(--color-streak) 35%, transparent)',
    borderRadius: 'var(--radius-medium)',
    padding: 'var(--space-3) var(--space-4)',
    boxShadow: 'var(--shadow-modal)',
    zIndex: 50,
    // Выезд сверху вниз — тот же жест подачи, что у меню долгого нажатия.
    animation: 'popupDrop 0.2s var(--ease-ios)'
  },
  alignRight: { right: 0 },
  // Центрируем сдвигом ЛЕВОГО края, а не translateX: transform занят анимацией
  // выезда, и два правила боролись бы за одно свойство.
  alignCenter: { left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto' },
  title: {
    fontFamily: 'var(--font-display)', fontWeight: 700,
    fontSize: 'var(--text-label-size)', color: 'var(--color-text)',
    marginBottom: 'var(--space-1)'
  },
  body: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)', lineHeight: 1.5
  },
  num: { color: 'var(--color-streak)', fontWeight: 800 }
}
