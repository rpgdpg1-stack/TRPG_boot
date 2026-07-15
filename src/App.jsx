import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import Loader from './components/layout/Loader'
import ErrorBoundary from './components/layout/ErrorBoundary'
import TabBar from './components/TabBar'

import Home from './pages/Home'
import Category from './pages/Category'
import WorkoutDay from './pages/WorkoutDay'
import SwapExercise from './pages/SwapExercise'
import Recovery from './pages/Recovery'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import FavoriteExercises from './pages/FavoriteExercises'
import Privacy from './pages/Privacy'
import DailyBoost from './pages/DailyBoost'
import Activities from './pages/Activities'
import Friends from './pages/Friends'
import History from './pages/History'
import ExerciseInfo from './pages/ExerciseInfo'
import SwimWorkout from './pages/SwimWorkout'
import ProgramConstructor from './pages/ProgramConstructor'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth, getCurrentUser } from './lib/auth'
import { getRecentWorkouts } from './lib/storage'
import { HISTORY_FETCH_LIMIT } from './utils/history'
import { getFriendsList } from './lib/friends-list'
import { getFavoriteExercises } from './lib/favorite-exercises'
import { getProgramBySlug } from './features/programs/registry'
import { loadMyPrograms, hydrateUserProgramsFromCache, getSharedProgram, getStartParamShareToken } from './features/programs/customProgram'
import SaveFriendProgramModal from './components/SaveFriendProgramModal'
import { EVENTS, on } from './lib/events'
import { startNetworkMonitor, onNetworkChange } from './lib/network-status'
import { startVersionWatch } from './lib/version-check'
import { syncQueue } from './lib/sync-engine'
import { syncAccentFromCloud } from './lib/accent'
import OfflineBanner from './components/OfflineBanner'

export default function App() {
  const [loading, setLoading] = useState(true)

  const authPromiseRef = useRef(null)
  if (authPromiseRef.current === null) {
    initTelegram()
    startNetworkMonitor() // запускаем детектор сети как можно раньше
    startVersionWatch()   // вахтёр версии: пробуждение из фона → сверка сборки с сервером
    hydrateUserProgramsFromCache() // свои программы из кэша — доступны сразу, в т.ч. оффлайн
    authPromiseRef.current = ensureAuth().catch(err => {
      console.error('[App] ensureAuth failed:', err)
      return null
    })
  }

  useEffect(() => {
    let cancelled = false
    authPromiseRef.current?.then(async user => {
      if (cancelled || !user) return
      // Догоняем выбранный акцент с другого устройства (Telegram CloudStorage).
      syncAccentFromCloud()
      // После авторизации — пробуем разгрести очередь (вдруг с прошлого
      // раза остались несинканутые операции и сеть уже есть).
      syncQueue()
      // Свои программы (своя + от друга) из БД → в реестр, ДО сборки избранного,
      await loadMyPrograms()
      if (cancelled) return
      // Прогреваем кеши, чтобы страницы открывались сразу своими данными:
      // история (Статистика/Главная/Профиль), список друзей, любимые упражнения.
      getRecentWorkouts(HISTORY_FETCH_LIMIT).catch(() => {})
      getFriendsList().catch(() => {})
      getFavoriteExercises().catch(() => {})
    })

    // Глобальный детектор клавиатуры: вешаем body.keyboard-open пока она открыта.
    // По нему CSS гасит нижний fade-scrim (.app::after), который на iOS иначе
    // «прилипает» к клавиатуре сверху (затемнение над клавишами).
    const vv = window.visualViewport
    let kbCleanup = () => {}
    if (vv) {
      const onResize = () => {
        const open = (window.innerHeight - vv.height) > 150
        document.body.classList.toggle('keyboard-open', open)
      }
      vv.addEventListener('resize', onResize)
      onResize()
      kbCleanup = () => {
        vv.removeEventListener('resize', onResize)
        document.body.classList.remove('keyboard-open')
      }
    }

    // Когда сеть возвращается — запускаем синк очереди.
    const offNet = onNetworkChange((isOnline) => {
      if (isOnline) {
        console.log('[App] сеть вернулась → запускаем syncQueue')
        syncQueue()
      }
    })

    return () => {
      cancelled = true
      offNet()
      kbCleanup()
    }
  }, [])

  // Сигнал загрузочному «сторожу» в index.html: приложение прошло загрузчик и
  // живо. Пока флаг не встал, сторож через 15с покажет экран-спасатель с кнопкой
  // «Перезапустить» (белый экран / повисший лоадер / старый чанк из кеша Telegram).
  useEffect(() => {
    if (!loading) window.__APP_BOOTED__ = true
  }, [loading])

  if (loading) {
    return (
      <Loader
        readyPromise={authPromiseRef.current}
        onFinish={() => setLoading(false)}
      />
    )
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <ScrollToTopOnNavigate />
        <OfflineBanner />

        <SettingsButtonController />
        <ShareImportController />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
          <Route path="/swim/:programId" element={<SwimWorkout />} />
          <Route path="/constructor" element={<ProgramConstructor />} />
          <Route path="/swap/:programId/:day/:orderNum" element={<SwapExercise />} />
          
          <Route path="/profile" element={<Profile />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/history" element={<History />} />
          <Route path="/favorite-exercises" element={<FavoriteExercises />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/daily-boost" element={<Activities />} />
          <Route path="/daily-boost/edit" element={<DailyBoost />} />
          <Route path="/exercise/:id" element={<ExerciseInfo />} />
        </Routes>

        <BottomTabBar />
      </div>
    </ErrorBoundary>
  )
}

/**
 * Сброс скролла на верх при смене страницы — чтобы новый экран не «наследовал»
 * позицию прокрутки предыдущего (баг: с прокрученной вниз главной заходишь в
 * настройки — и они открыты внизу). Экран дня (/workout/) исключён: он сам
 * управляет скроллом (восстановление позиции при возврате со «Сменить»/«Инфо»,
 * скролл-на-верх при смене дня).
 */
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    if (pathname.startsWith('/workout/')) return
    window.scrollTo(0, 0)
    document.scrollingElement?.scrollTo(0, 0)
  }, [pathname])
  return null
}

function SettingsButtonController() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/settings') {
      settingsButton.hide()
    } else {
      settingsButton.show(() => navigate('/settings'))
    }
  }, [location.pathname, navigate])

  return null
}

function BottomTabBar() {
  const location = useLocation()
  // Экраны со своей прибитой кнопкой-доком внизу — таб-бар не показываем.
  if (location.pathname.startsWith('/constructor')) return null
  if (location.pathname.startsWith('/swim/')) return null
  return <TabBar />
}

/**
 * Приём программы по ссылке. Читает start_param ('share_<токен>'), тянет снимок
 * и показывает модалку сохранения. Если автор — сам пользователь, не предлагаем.
 */
function ShareImportController() {
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const token = getStartParamShareToken()
      if (!token) return
      const user = getCurrentUser()
      if (!user) return
      const snap = await getSharedProgram(token)
      if (cancelled || !snap) return
      if (snap.author_id === user.id) return // своя же программа
      setSnapshot({ ...snap, token })
    }

    if (getCurrentUser()) run()
    const off = on(EVENTS.USER_READY, run)
    return () => { cancelled = true; off() }
  }, [])

  if (!snapshot) return null

  const replacing = !!getProgramBySlug('friend')

  return (
    <SaveFriendProgramModal
      snapshot={snapshot}
      replacing={replacing}
      onClose={() => setSnapshot(null)}
      onSaved={() => { setSnapshot(null); navigate('/category/gym') }}
    />
  )
}