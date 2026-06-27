import { createPortal } from 'react-dom'

/**
 * Единый заголовок экрана — навигейшн-бар в стиле iOS/Telegram.
 *
 * Рендерится как ФИКСИРОВАННАЯ полоса по центру системных кнопок Telegram
 * (Назад слева, «…» справа) — заголовок встаёт в одну линию с ними. Позиция —
 * из переменных --tg-nav-top / --tg-nav-height (их задаёт bindSafeArea по
 * safeAreaInset + contentSafeAreaInset; фолбэк в index.css).
 *
 * Через портал в document.body — иначе анимации страниц (.page-enter/.page-fade
 * оставляют transform с fill-mode both) создавали бы контейнер для fixed и
 * сбивали позицию. Из потока заголовок ВЫНЕСЕН: контент страницы начинается на
 * 16px ниже кнопок (paddingTop: var(--tg-safe-top)), без строки под заголовок.
 *
 * Тонкий, без капса, по центру, чуть приглушённый белый. Размер/вес/цвет — здесь,
 * сразу во всех экранах.
 */
export default function ScreenTitle({ children }) {
  return createPortal(
    <div style={styles.bar}>
      <h1 style={styles.title}>{children}</h1>
    </div>,
    document.body
  )
}

const styles = {
  // Полоса по центру системных кнопок; не перехватывает тапы (кнопки Telegram
  // системные, под нами их нет — но на всякий случай pointer-events: none).
  // Боковые отступы — чтобы длинный заголовок не залезал под Назад / «…».
  bar: {
    position: 'fixed',
    top: 'var(--tg-nav-top, 56px)',
    left: 0,
    right: 0,
    height: 'var(--tg-nav-height, 44px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 56px',
    pointerEvents: 'none',
    zIndex: 90
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '0.2px',
    lineHeight: 1.2,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%'
  }
}
