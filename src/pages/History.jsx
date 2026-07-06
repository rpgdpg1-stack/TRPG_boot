import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import ScreenTitle from '../components/ScreenTitle'
import HistoryCalendar from '../components/HistoryCalendar'

/**
 * История тренировок — месячный календарь (компонент HistoryCalendar,
 * тот же, что встроен на главной внизу).
 */
export default function History() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  return (
    <div className="page page-fade">
      <ScreenTitle>История</ScreenTitle>
      <HistoryCalendar />
    </div>
  )
}
