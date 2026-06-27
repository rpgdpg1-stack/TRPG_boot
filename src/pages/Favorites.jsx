import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import FavoritesList from '../components/FavoritesList'
import PixelHeart from '../components/PixelHeart'
import ScreenTitle from '../components/ScreenTitle'

/**
 * Страница «Избранное» (открывается тапом по заголовку ИЗБРАННОЕ на главной).
 * Контент — общий компонент FavoritesList (тот же, что встроен в профиль).
 */
export default function Favorites() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade" style={{}}>
      <header style={styles.header}>
        <ScreenTitle>Избранное</ScreenTitle>
        <span style={styles.headerIcon}><PixelHeart filled size={26} /></span>
      </header>

      <FavoritesList />
    </div>
  )
}

const styles = {
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '20px'
  },
  headerIcon: { display: 'inline-flex', marginTop: '16px' },
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
