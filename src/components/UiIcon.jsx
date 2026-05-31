/**
 * Универсальный рендер UI-иконок из src/assets/ui/.
 *
 * Иконки лежат как SVG с currentColor / монохромные. Чтобы красить их в
 * произвольный цвет без правки самого файла — используем CSS-маску:
 * SVG подгружается как URL и применяется как mask-image к div'у.
 * Цвет берётся из background-color → можно красить через color prop.
 *
 * Размер по умолчанию 22px (как у эмодзи которые они заменяют — те шли
 * fontSize: 22px в Profile/Settings). Можно переопределить через size.
 *
 * Использование:
 *   <UiIcon name="settings" size={22} color="var(--color-primary)" />
 *
 * Если иконка name не найдена — рендерится пустой span (не падаем).
 */

import inviteUrl     from '../assets/ui/invite.svg'
import settingsUrl   from '../assets/ui/settings.svg'
import rewardsUrl    from '../assets/ui/rewards.svg'
import leaderboardUrl from '../assets/ui/leaderboard.svg'

const ICONS = {
  invite:      inviteUrl,
  settings:    settingsUrl,
  rewards:     rewardsUrl,
  leaderboard: leaderboardUrl
}

export default function UiIcon({ name, size = 22, color = 'currentColor', style }) {
  const url = ICONS[name]
  if (!url) return <span style={{ width: size, height: size, display: 'inline-block', ...style }} />

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