/**
 * Шапка главной страницы — RPG TRAINING APP в верхней зоне.
 * Располагается на уровне нативной кнопки закрытия Telegram (справа).
 * Логотип по центру, мелким кеглем (не такой крупный как в старом дизайне).
 */
export default function HomeHeader() {
  return (
    <div style={styles.container}>
      <div style={styles.logoBlock}>
        <span style={styles.logo}>RPG</span>
        <span style={styles.logoSubtitle}>TRAINING APP</span>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    // На уровне TG nav (примерно 18-22px от верха окна Mini App)
    top: '20px',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none', // чтоб не перехватывал клики
    zIndex: 5
  },
  logoBlock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px'
  },
  logo: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '18px',
    color: 'var(--color-primary)',
    letterSpacing: '2px',
    lineHeight: 1
  },
  logoSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '9px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px'
  }
}
