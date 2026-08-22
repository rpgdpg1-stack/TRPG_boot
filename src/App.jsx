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
import PersonalData from './pages/PersonalData'
import BodyMeasurements from './pages/BodyMeasurements'
import Goal from './pages/Goal'
import Notifications from './pages/Notifications'
import About from './pages/About'
import Support from './pages/Support'
import Feedback from './pages/Feedback'
import Gift from './pages/Gift'
import DailyBoost from './pages/DailyBoost'
import Activities from './pages/Activities'
import Friends from './pages/Friends'
import History from './pages/History'
import ExerciseInfo from './pages/ExerciseInfo'
import SwimWorkout from './pages/SwimWorkout'
import ProgramConstructor from './pages/ProgramConstructor'
import QuickWorkout from './pages/QuickWorkout'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth, getCurrentUser } from './lib/auth'
import { isTelegramEnv } from './lib/telegram'
import EmailLogin from './components/EmailLogin'
import { loadPrefs, migrateFromCloud } from './lib/prefs'
import BrowserNavButton from './components/BrowserNavButton'
import BrowserMenuButton from './components/BrowserMenuButton'
import FriendInviteModal from './components/FriendInviteModal'
import { acceptReferral } from './lib/friends'
import AccountAccess from './pages/AccountAccess'
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
import OfflineBanner from './components/OfflineBanner'
import { debug } from './lib/debug'

export default function App() {
  const [loading, setLoading] = useState(true)
  // Кто вошёл. Нужно ровно для одного решения: показывать приложение или экран
  // входа по почте. Внутри Telegram сюда всегда приезжает человек, снаружи —
  // только если он уже входил раньше и сессия жива.
  const [user, setUser] = useState(() => getCurrentUser())
  // Результат перехода по ссылке-приглашению: { name, already } либо null.
  const [invite, setInvite] = useState(null)

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
      if (cancelled) return
      setUser(user)
      if (!user) return
      // После авторизации — пробуем разгрести очередь (вдруг с прошлого
      // раза остались несинканутые операции и сеть уже есть).
      syncQueue()
      // Настройки аккаунта (закрепы и прочее) — до отрисовки главной, чтобы
      // закреплённая программа не появлялась рывком вторым кадром.
      // Сначала разовый переезд старых данных из облака Telegram, потом чтение:
      // порядок важен, иначе первое чтение вернёт пусто и запишет пустоту в кеш.
      migrateFromCloud().catch(() => {}).finally(() => { loadPrefs().catch(() => {}) })

      // Пришли по ссылке-приглашению, УЖЕ имея аккаунт. Отдельный случай:
      // у новичка приглашение обрабатывается при входе по коду из письма,
      // а вошедшего приложение просто открывало на главной, молча заводя
      // дружбу в базе. Молчание тут читается как «ссылка не сработала».
      const refFromUrl = new URLSearchParams(window.location.search).get('ref')
      if (refFromUrl) {
        // Код убираем из адреса сразу: иначе он переживёт перезагрузку и
        // приглашение всплывёт второй раз на пустом месте.
        window.history.replaceState({}, '', window.location.pathname)
        acceptReferral(refFromUrl).then(res => {
          if (cancelled) return
          if (res?.success) setInvite({ name: res.friend_name, already: res.already })
          getFriendsList().catch(() => {})
        }).catch(() => {})
      }
      // Свои программы (своя + от друга) из БД → в реестр, ДО сборки избранного,
      await loadMyPrograms()
      if (cancelled) return
      // Прогреваем кеши, чтобы страницы открывались сразу своими данными:
      // история (Статистика/Главная/Профиль), список друзей, любимые упражнения.
      getRecentWorkouts(HISTORY_FETCH_LIMIT).catch(() => {})
      getFriendsList().catch(() => {})
      getFavoriteExercises().catch(() => {})
    })

    // ПЕРВЫЙ КАДР В БРАУЗЕРЕ: заставляем Safari пересчитать высоту экрана.
    //
    // Открытое из ярлыка на домашнем экране приложение показывает таб-бар
    // приподнятым — Safari при первом кадре считает высоту по «свёрнутому»
    // состоянию, будто снизу есть его панель, и прижатые к низу элементы
    // встают выше. Пересчитывает он это только после первого касания, отчего
    // таб-бар на глазах опускается на место.
    //
    // Прокруткой это не лечится: на главной она и так в нуле, а сдвиг ВНИЗ
    // (единственный доступный оттуда) Safari за повод пересчитать не считает —
    // помогает противоположный жест, которого из кода не изобразить.
    //
    // Зато пересчёт вызывает изменение самой раскладки. Подрастив страницу на
    // пиксель и вернув обратно в следующем кадре, получаем тот же результат
    // без всякой прокрутки: Safari пересобирает геометрию и прижатые к низу
    // элементы встают на настоящий край.
    //
    // Только в браузере: в Telegram высоту сообщает сам Telegram, и трогать
    // раскладку там незачем.
    if (!isTelegramEnv()) {
      requestAnimationFrame(() => {
        const el = document.documentElement
        const prev = el.style.minHeight
        el.style.minHeight = 'calc(100dvh + 1px)'
        requestAnimationFrame(() => { el.style.minHeight = prev })
      })
    }

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

    // Приглашение может прийти и из Telegram (там код лежит в параметрах
    // запуска, а не в адресе страницы) — обрабатывает его авторизация,
    // а показываем мы, одинаково в обеих версиях.
    const offInvite = on(EVENTS.FRIEND_INVITE, (evt) => {
      setInvite(evt.detail || { name: null, already: false })
      getFriendsList().catch(() => {})
    })

    // Когда сеть возвращается — запускаем синк очереди.
    const offNet = onNetworkChange((isOnline) => {
      if (isOnline) {
        debug('[App] сеть вернулась → запускаем syncQueue')
        syncQueue()
      }
    })

    return () => {
      cancelled = true
      offNet()
      offInvite()
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

  // Не вошли и мы не в Telegram — значит человек открыл приложение в браузере.
  // Там подтвердить личность нечем, кроме письма: показываем вход по почте.
  //
  // Признак Telegram двойной. Одного initData мало: внутри Telegram он бывает
  // пустым, если его скрипт не успел загрузиться на плохой связи, — и тогда мы
  // подсунули бы форму входа человеку, который и так уже вошёл. Второй признак
  // надёжнее: открывая мини-приложение, Telegram дописывает свои параметры
  // прямо в адрес, и они на месте, даже когда скрипт не доехал.
  const insideTelegram = !!window.Telegram?.WebApp?.initData ||
    String(window.location.href || '').indexOf('tgWebApp') !== -1

  if (!user && !insideTelegram) {
    return (
      <EmailLogin
        onSuccess={() => {
          // Перезагрузка, а не переключение состояния: за стартом приложения
          // стоит целая цепочка (программы, история, друзья, любимые), и
          // повторять её вручную из экрана входа значит однажды забыть звено.
          // Заодно из адреса уходит код приглашения — он уже отработал.
          window.location.replace(window.location.pathname)
        }}
      />
    )
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <ScrollToTopOnNavigate />
        <OfflineBanner />
        {!insideTelegram && <BrowserNavButton />}
        {!insideTelegram && <BrowserMenuButton />}
        {invite && <FriendInviteModal {...invite} onClose={() => setInvite(null)} />}

        <SettingsButtonController />
        <ShareImportController />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
          <Route path="/swim/:programId" element={<SwimWorkout />} />
          <Route path="/constructor" element={<ProgramConstructor />} />
          <Route path="/quick/:programId/:day" element={<QuickWorkout />} />
          <Route path="/swap/:programId/:day/:orderNum" element={<SwapExercise />} />
          
          <Route path="/profile" element={<Profile />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/account" element={<AccountAccess />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/history" element={<History />} />
          <Route path="/favorite-exercises" element={<FavoriteExercises />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* Профиль: тело и цель */}
          <Route path="/personal-data" element={<PersonalData />} />
          <Route path="/measurements" element={<BodyMeasurements />} />
          <Route path="/goal" element={<Goal />} />
          {/* Настройки */}
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/about" element={<About />} />
          <Route path="/support" element={<Support />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/gift" element={<Gift />} />
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
  // Таб-бар всегда смонтирован — видимость (и плавный уезд вниз/выезд вверх) он
  // определяет сам по маршруту (виден только на /, /friends, /profile). Держим в
  // DOM, иначе на страницах без бара он бы размонтировался и анимации не было бы.
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