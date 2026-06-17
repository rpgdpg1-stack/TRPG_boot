import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import CategoryList from '../components/CategoryList'

/**
 * Страница «Разделы» — полный список разделов (категорий).
 * Открывается тапом по заголовку РАЗДЕЛЫ на главной и живёт в профиле.
 * Контент — общий компонент CategoryList (тот же, что на главной).
 */
export default function Sections() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade" style={{}}>
      <header style={styles.header}>
        <h1 style={styles.title}>РАЗДЕЛЫ</h1>
      </header>
      <CategoryList />
    </div>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '8px',
    marginBottom: '20px'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '26px',
    color: 'var(--color-text)',
    letterSpacing: '2px',
    lineHeight: 1,
    margin: 0
  }
}
