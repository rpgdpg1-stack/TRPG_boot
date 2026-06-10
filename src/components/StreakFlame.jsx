/**
 * Огонёк серии с динамическим размером и поведением.
 * Вынесен из PlayerCard, чтобы переиспользовать в профиле (попап серии).
 *
 *  - x0: серый контур, маленький, без анимаций
 *  - x1: загорается, маленький
 *  - x2: средний
 *  - x3: больше + мерцание + искорка
 *  - x4..x7: максимальный размер + две искорки (дальше не растёт —
 *    стрик копится до 7, но визуал замирает на уровне x4)
 *
 * Свои keyframes (flameIdleFlicker, flameSparkRise) держит при себе,
 * чтобы анимации работали в любом месте где компонент используется.
 */
export default function StreakFlame({ streak }) {
  const size = streak >= 4 ? 32
             : streak >= 3 ? 28
             : streak >= 2 ? 24
             : streak >= 1 ? 22
             : 20

  const lit = streak >= 1
  const animated = streak >= 3
  const showSparks = streak >= 3

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
      {lit ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            filter: 'drop-shadow(0 0 4px rgba(255, 140, 66, 0.6))',
            animation: animated ? 'flameIdleFlicker 1.4s ease-in-out infinite' : 'none',
            transformOrigin: 'center bottom'
          }}
        >
          <defs>
            <linearGradient id="flameGradHeader" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="50%" stopColor="#FF8C42" />
              <stop offset="100%" stopColor="#E84545" />
            </linearGradient>
          </defs>
          <path
            d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z"
            fill="url(#flameGradHeader)"
          />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2 C 8 6, 6 9, 6 13 C 6 17, 9 21, 12 21 C 15 21, 18 17, 18 13 C 18 10, 16 8, 14 7 C 14 9, 13 10, 12 10 C 12 7, 13 5, 12 2 Z"
            fill="none"
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth="1.5"
          />
        </svg>
      )}

      {showSparks && (
        <>
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: 3,
              height: 3,
              background: '#FFD700',
              boxShadow: '0 0 4px #FFD700',
              borderRadius: 1,
              pointerEvents: 'none',
              '--sx': '-3px',
              '--sy': '-16px',
              animation: 'flameSparkRise 1.6s ease-out infinite'
            }}
          />
          {streak >= 4 && (
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                width: 2,
                height: 2,
                background: '#FF8C42',
                boxShadow: '0 0 3px #FF8C42',
                borderRadius: 1,
                pointerEvents: 'none',
                '--sx': '4px',
                '--sy': '-14px',
                animation: 'flameSparkRise 1.4s ease-out 0.6s infinite'
              }}
            />
          )}
        </>
      )}

      <style>{`
        @keyframes flameIdleFlicker {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
        @keyframes flameSparkRise {
          0%   { opacity: 0; transform: translate(-50%, 0) scale(0.6); }
          20%  { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--sx, 0px)), var(--sy, -14px)) scale(0.4); }
        }
      `}</style>
    </div>
  )
}