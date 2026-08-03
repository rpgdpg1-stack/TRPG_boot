import { useNetworkBadge } from '../lib/use-network-badge'
import UiIcon from './UiIcon'

/**
 * Пилюля статуса сети и синхронизации.
 *
 * Стоит НА МЕСТЕ ЗАГОЛОВКА экрана — на линии системных кнопок Telegram, там же,
 * где «Тренировки» / «Сплит 2» / «Друзья». Пока статус есть, `ScreenTitle`
 * затухает (оба читают один `useNetworkBadge`), поэтому подмена выглядит как
 * замена одного другим, а не как два элемента внахлёст. Раньше пилюля висела
 * отдельной строкой выше и отжимала контент.
 *
 * Состояния (приоритет сверху вниз):
 *  - syncing    → cloud_sync,  иконка синяя,    «Синхронизация»
 *  - justSynced → cloud_done,  иконка зелёная,  «Синхронизировано: N» (~2.5с)
 *  - offline    → network_off, иконка красная,  «Офлайн» (+ счётчик очереди)
 *  - online + пустая очередь → ничего
 *
 * zIndex выше модалок: под модалкой заголовок и так скрыт её оверлеем, а статус
 * сети важен именно там — без него непонятно, почему не сохраняется.
 */
export default function OfflineBanner() {
  const badge = useNetworkBadge()
  if (!badge) return null

  return (
    <div style={styles.wrap} aria-live="polite">
      <div style={styles.pill}>
        <span style={{
          ...styles.iconWrap,
          animation: badge.spin ? 'offlineIconSpin 1.2s linear infinite' : 'none'
        }}>
          <UiIcon name={badge.iconName} size={16} color={badge.iconColor} />
        </span>
        <span style={styles.text}>{badge.text}</span>
      </div>

      <style>{`
        @keyframes offlinePillIn {
          0%   { opacity: 0; transform: translateY(-6px) scale(0.94); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes offlineIconSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  // Та же геометрия, что у ScreenTitle: полоса по центру системных кнопок.
  // Пилюля встаёт ровно туда, откуда ушёл заголовок.
  wrap: {
    position: 'fixed',
    top: 'var(--tg-nav-top, 56px)',
    left: 0,
    right: 0,
    height: 'var(--tg-nav-height, 44px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 var(--space-12)',
    pointerEvents: 'none',  // пилюля не перехватывает тапы по контенту под ней
    zIndex: 10002
  },
  // Сама пилюля — стеклянная (прозрачный surface-dim + blur+saturate как у
  // кнопок/переключателей), цветная только иконка.
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    maxWidth: '100%',
    // Вертикаль — полушаг 6px (между 4 и 8): пилюля ≈32px, в полосе навигации
    // 44px остаётся по 6px сверху и снизу. Горизонталь — прежняя, по шкале:
    // слева меньше, чем справа, потому что у иконки есть свои пустые поля
    // внутри её квадрата 16px и левый отступ кажется больше реального.
    padding: 'var(--space-15) var(--space-4) var(--space-15) var(--space-3)',
    background: 'var(--color-surface-dim)',
    backdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    WebkitBackdropFilter: 'blur(var(--blur-sm)) saturate(180%)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
    // Мягкое проявление ~350мс — в такт затуханию заголовка под ним.
    animation: 'offlinePillIn 0.35s var(--ease-ios) forwards'
  },
  iconWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    flexShrink: 0
  },
  text: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  }
}
