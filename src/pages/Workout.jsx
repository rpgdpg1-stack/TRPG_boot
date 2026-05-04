export default function Workout() {
  return (
    <div className="page page-enter" style={styles.page}>
      <div style={styles.placeholder}>
        <div style={styles.icon}>💪</div>
        <h2 style={styles.title}>Тренировка</h2>
        <p style={styles.text}>
          Здесь появятся упражнения дня.<br/>
          Скоро подключим Google Sheets.
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    padding: '32px 16px',
    minHeight: '70vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  placeholder: {
    textAlign: 'center'
  },
  icon: {
    fontSize: '64px',
    marginBottom: '16px'
  },
  title: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '32px',
    color: 'var(--color-primary)',
    marginBottom: '12px',
    letterSpacing: '2px'
  },
  text: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  }
}
