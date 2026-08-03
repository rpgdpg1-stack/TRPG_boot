import { createPortal } from 'react-dom'
import { useNetworkBadge } from '../lib/use-network-badge'

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
  // Пока есть статус сети, его пилюля занимает это же место (OfflineBanner) —
  // заголовок уходит, чтобы они не наложились. Не размонтируем, а гасим
  // прозрачностью: так подмена читается как переход, а не как рывок, и высота
  // полосы не скачет.
  const badge = useNetworkBadge()

  return createPortal(
    <div style={styles.bar}>
      <h1 style={{
        ...styles.title,
        opacity: badge ? 0 : 1,
        transform: badge ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'opacity 0.35s var(--ease-ios), transform 0.35s var(--ease-ios)'
      }}>
        {children}
      </h1>
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
    padding: '0 var(--space-12)',
    pointerEvents: 'none',
    zIndex: 95
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-body-size)',
    fontWeight: 700,
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
