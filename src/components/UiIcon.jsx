/**
 * Универсальный рендер UI-иконок из src/assets/ui/.
 *
 * Использует ТОТ ЖЕ подход что и RankIcon.jsx — Vite загружает SVG как сырые
 * строки (?raw), компонент вставляет содержимое инлайн через
 * dangerouslySetInnerHTML, а CSS-переменная color из обёртки подхватывается
 * через fill="currentColor" внутри SVG.
 *
 * Почему не CSS-маска: маска работает только когда SVG нарисован сплошной
 * заливкой непрозрачных пикселей. У наших иконок (как и у рангов) — обводки
 * через stroke / тонкие линии. Они корректно рендерятся как обычные SVG,
 * а маска видит их как пустые места и красит весь квадрат.
 *
 * Использование:
 *   <UiIcon name="invite-friend" size={22} color="var(--color-primary)" />
 *
 * Параметры:
 *  - name  — имя файла без .svg (например 'leaderboard' для leaderboard.svg)
 *  - size  — px, квадрат. По умолчанию 22 (под прежний fontSize эмодзи)
 *  - color — CSS-цвет. По умолчанию currentColor (берётся от родителя)
 *  - style — дополнительные стили обёртки
 */

// Грузим все SVG как сырые строки. Ключи: '/src/assets/ui/invite-friend.svg'
const uiSvgs = import.meta.glob('../assets/ui/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
})

function getSvgByName(name) {
  if (!name) return null
  const key = Object.keys(uiSvgs).find(k => k.endsWith(`/${name}.svg`))
  return key ? uiSvgs[key] : null
}

export default function UiIcon({ name, size = 22, color = 'currentColor', style }) {
  const svgRaw = getSvgByName(name)

  if (!svgRaw) {
    if (import.meta.env.DEV) {
      console.warn(
        `[UiIcon] icon "${name}" not found. Available:`,
        Object.keys(uiSvgs).map(k => k.split('/').pop().replace(/\.svg$/i, ''))
      )
    }
    return <span style={{ width: size, height: size, display: 'inline-block', ...style }} />
  }

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color,             // currentColor внутри svg возьмёт это значение
        flexShrink: 0,
        lineHeight: 0,
        ...style
      }}
      // Форсируем размер вложенного <svg> через CSS — иначе он может иметь
      // свои width/height из файла и вылезти за размеры обёртки.
      ref={(el) => {
        if (el) {
          const svg = el.querySelector('svg')
          if (svg) {
            svg.setAttribute('width', size)
            svg.setAttribute('height', size)
            svg.style.display = 'block'
          }
        }
      }}
      dangerouslySetInnerHTML={{ __html: svgRaw }}
    />
  )
}