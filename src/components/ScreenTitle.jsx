/**
 * Единый заголовок экрана — в стиле навигейшн-бара iOS/Telegram.
 *
 * Тонкий, без капса, по центру, чуть приглушённый белый. Один компонент на все
 * экраны, чтобы заголовки были одинаковые (раньше были крупные капсом, у каждого
 * экрана свой размер/цвет). Размер/вес/цвет правятся здесь — сразу во всех местах.
 *
 * Отступы вокруг задаёт сам экран (его header-контейнер) — компонент только текст.
 */
export default function ScreenTitle({ children, style }) {
  return <h1 style={{ ...styles.title, ...style }}>{children}</h1>
}

const styles = {
  title: {
    margin: 0,
    fontFamily: 'var(--font-manrope)',
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '0.2px',
    lineHeight: 1.2,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center'
  }
}
