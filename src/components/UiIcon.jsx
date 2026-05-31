/**
 * Универсальный рендер UI-иконок из src/assets/ui/.
 *
 * Иконки — SVG с currentColor / монохромные. Красим через CSS-маску:
 * SVG подгружается как URL и применяется как mask-image. Цвет берётся
 * из background-color → можно перекрашивать через color prop.
 *
 * Размер по умолчанию 22px (как у эмодзи которые они заменяют).
 *
 * ВАЖНО: используем import.meta.glob('eager: true') чтобы Vite собрал
 * все SVG в папке assets/ui/ автоматически. Так если какой-то файл
 * переименовали или забыли — билд не падает, просто иконка не покажется.
 *
 * Использование:
 *   <UiIcon name="settings" size={22} color="var(--color-primary)" />
 */

// import.meta.glob возвращает объект { '/src/assets/ui/invite.svg': '/assets/invite-abc123.svg', ... }
// eager: true — модули резолвятся сразу, не лениво (нам нужны URL сразу при рендере).
// query: '?url' — Vite вернёт URL файла, а не его содержимое.
const ICON_MODULES = import.meta.glob('../assets/ui/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
})

// Превращаем { '/src/assets/ui/invite.svg': '/assets/invite-abc123.svg' }
// в { invite: '/assets/invite-abc123.svg' } — удобный поиск по короткому имени.
const ICONS = {}
for (const path in ICON_MODULES) {
  const filename = path.split('/').pop()           // 'invite.svg'
  const name = filename.replace(/\.svg$/i, '')     // 'invite'
  ICONS[name] = ICON_MODULES[path]
}

export default function UiIcon({ name, size = 22, color = 'currentColor', style }) {
  const url = ICONS[name]

  if (!url) {
    // Иконка не найдена — рендерим пустой spacer того же размера, чтобы
    // вёрстка не прыгала. В консоли пишем предупреждение для отладки.
    if (import.meta.env.DEV) {
      console.warn(`[UiIcon] icon "${name}" not found. Available: ${Object.keys(ICONS).join(', ')}`)
    }
    return <span style={{ width: size, height: size, display: 'inline-block', ...style }} />
  }

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        flexShrink: 0,
        ...style
      }}
    />
  )
}