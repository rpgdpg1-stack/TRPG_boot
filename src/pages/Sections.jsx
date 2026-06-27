import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import CategoryList from '../components/CategoryList'
import ScreenTitle from '../components/ScreenTitle'

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
      <ScreenTitle>Разделы</ScreenTitle>
      <CategoryList />
    </div>
  )
}
