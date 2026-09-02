import { useState, useRef, useEffect, useLayoutEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'

import Loader from './components/layout/Loader'
import ErrorBoundary from './components/layout/ErrorBoundary'
import TabBar from './components/TabBar'

import Home from './pages/Home'
import Category from './pages/Category'
import WorkoutDay from './pages/WorkoutDay'
import ModalDemo from './pages/ModalDemo'

// ── Экраны по требованию (PERF-001) ─────────────────────────────────────────
// Главная, раздел, день тренировки и карточка упражнения — это горячий путь,
// они остаются в основном бандле и открываются мгновенно. Всё остальное
// приезжает отдельным файлом в момент перехода: конструктор, заплыв, друзья,
// история и подстраницы профиля открываются редко, а весят много, и держать
// их в первой загрузке — платить за них при каждом заходе в зал.
const About = lazy(() => import('./pages/About'))
const AccountAccess = lazy(() => import('./pages/AccountAccess'))
const BodyMeasurements = lazy(() => import('./pages/BodyMeasurements'))
const FavoriteExercises = lazy(() => import('./pages/FavoriteExercises'))
const Feedback = lazy(() => import('./pages/Feedback'))
const Friends = lazy(() => import('./pages/Friends'))
const Gift = lazy(() => import('./pages/Gift'))
const Goal = lazy(() => import('./pages/Goal'))
const History = lazy(() => import('./pages/History'))
const Notifications = lazy(() => import('./pages/Notifications'))
const PersonalData = lazy(() => import('./pages/PersonalData'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Profile = lazy(() => import('./pages/Profile'))
const ProgramConstructor = lazy(() => import('./pages/ProgramConstructor'))
const QuickWorkout = lazy(() => import('./pages/QuickWorkout'))
const Settings = lazy(() => import('./pages/Settings'))
const Support = lazy(() => import('./pages/Support'))
const SwapExercise = lazy(() => import('./pages/SwapExercise'))
const SwimWorkout = lazy(() => import('./pages/SwimWorkout'))
import ExerciseInfo from './pages/ExerciseInfo'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth, getCurrentUser, retryAuth } from './lib/auth'
import EmailLogin from './components/EmailLogin'
import { loadPrefs, migrateFromCloud } from './lib/prefs'
import BrowserNavButton from './components/BrowserNavButton'
import BrowserMenuButton from './components/BrowserMenuButton'
import FriendInviteModal from './components/FriendInviteModal'
import { acceptReferral } from './lib/friends'
import { getRecentWorkouts } from './lib/storage'
import { HISTORY_FETCH_LIMIT } from './utils/history'
import { getFriendsList } from './lib/friends-list'
import { getFavoriteExercises } from './lib/favorite-exercises'
import { getProgramBySlug } from './features/programs/registry'
import { loadMyPrograms, hydrateUserProgramsFromCache, getSharedProgram, getStartParamShareToken, clearPendingShareToken } from './features/programs/customProgram'
import { getStartRoute, getNotificationType } from './lib/deep-link'
import { touchLastSeen } from './lib/notifications'
import { hit as metrikaHit, goal, GOALS } from './lib/metrika'
import { fetchSession, mergeSessions, pushSession } from './lib/session-sync'
import { getActiveWorkout, adoptActiveWorkout, clearActiveWorkout } from './lib/active-workout'
import { loadWorkoutProgress, saveWorkoutProgress } from './utils/workout-progress'
import SaveFriendProgramModal from './components/SaveFriendProgramModal'
import { EVENTS, on } from './lib/events'
import { startNetworkMonitor, onNetworkChange, checkNow } from './lib/network-status'
import { hasSession } from './lib/session'
import { cacheInvalidate } from './lib/cache'
import { startVersionWatch } from './lib/version-check'
import { syncQueue } from './lib/sync-engine'
import OfflineBanner from './components/OfflineBanner'
import { debug } from './lib/debug'
import { pcacheDropOldCatalogs } from './lib/persistent-cache'
import { repairEmptyCaches } from './lib/cache-repair'

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
    // ДО первых чтений: выбрасываем пустые записи кеша, доставшиеся от старой
    // ошибки (данные без сессии затирали настоящие). Разово, см. cache-repair.
    repairEmptyCaches()
    initTelegram()
    startNetworkMonitor() // запускаем детектор сети как можно раньше
    startVersionWatch()   // вахтёр версии: пробуждение из фона → сверка сборки с сервером
    hydrateUserProgramsFromCache() // свои программы из кэша — доступны сразу, в т.ч. оффлайн
    authPromiseRef.current = ensureAuth().catch(err => {
      console.error('[App] ensureAuth failed:', err)
      return null
    })
  }

  // Кеши каталога прошлых версий читать уже некому — убираем, чтобы самая
  // крупная запись не лежала мёртвым грузом до конца своих 7 дней.
  useEffect(() => { pcacheDropOldCatalogs() }, [])

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
      // Активная тренировка: могла быть начата на другом устройстве.
      // Сводим до прогрева кешей — экран дня должен открыться уже с ней.
      await syncActiveSession()

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

    // Приглашение может прийти и из Telegram (там код лежит в параметрах
    // запуска, а не в адресе страницы) — обрабатывает его авторизация,
    // а показываем мы, одинаково в обеих версиях.
    const offInvite = on(EVENTS.FRIEND_INVITE, (evt) => {
      setInvite(evt.detail || { name: null, already: false })
      getFriendsList().catch(() => {})
    })

    // Данные читаются с сервера по подписи сессии: нет сессии — нет данных
    // (пустые заметки, нулевые веса). Вход в Telegram делается один раз при
    // запуске и на плохой связи может не дойти, поэтому его надо ПОВТОРЯТЬ:
    // при возвращении сети и при выходе приложения из фона. После удачного
    // повтора сбрасываем кеши в памяти и заново прогреваем данные — иначе
    // экраны так и остались бы на том, что успели показать без сессии.
    const recoverSession = async (why) => {
      if (hasSession()) return
      debug('[App] нет сессии, пробуем войти заново:', why)
      const recovered = await retryAuth()
      if (!recovered || cancelled) return
      debug('[App] вход восстановлен, перечитываем данные')
      cacheInvalidate('')
      setUser(recovered)
      loadPrefs({ force: true }).catch(() => {})
      loadMyPrograms().catch(() => {})
      getRecentWorkouts(HISTORY_FETCH_LIMIT).catch(() => {})
      getFriendsList().catch(() => {})
      getFavoriteExercises().catch(() => {})
      syncQueue()
    }

    // Когда сеть возвращается — восстанавливаем вход и разгребаем очередь.
    const offNet = onNetworkChange((isOnline) => {
      if (isOnline) {
        debug('[App] сеть вернулась → восстановление входа и syncQueue')
        recoverSession('сеть вернулась').finally(() => syncQueue())
      }
    })

    // Возврат из фона: Telegram держит мини-приложение свёрнутым часами, и
    // за это время связь успевает и пропасть, и вернуться.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      checkNow()
      recoverSession('вернулись из фона')
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      offNet()
      offInvite()
      document.removeEventListener('visibilitychange', onVisible)
      kbCleanup()
    }
  }, [])

  // Сигнал загрузочному «сторожу» в index.html: приложение прошло загрузчик и
  // живо. Пока флаг не встал, сторож через 15с покажет экран-спасатель с кнопкой
  // «Перезапустить» (белый экран / повисший лоадер / старый чанк из кеша Telegram).
  useEffect(() => {
    if (!loading) window.__APP_BOOTED__ = true
  }, [loading])

  // Витрина модалок — только в разработке. Стоит раньше загрузки и входа:
  // модалку смотрят по вёрстке, и гонять ради этого настоящий аккаунт незачем.
  // В боевой сборке ветка вырезается сборщиком вместе с импортом.
  if (import.meta.env.DEV && window.location.pathname === '/modal-demo') {
    // Отметиться загруженным обязательно: иначе через 15 секунд сработает
    // загрузочный сторож из index.html и накроет витрину экраном «Перезапустить».
    window.__APP_BOOTED__ = true
    return <ModalDemo />
  }

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
        <StartRouteController />
        <MetrikaRouteTracker />

        <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--color-bg)' }} />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:id" element={<Category />} />
          <Route path="/workout/:programId/:day" element={<WorkoutDay />} />
          <Route path="/swim/:programId" element={<SwimWorkout />} />
          <Route path="/constructor" element={<ProgramConstructor />} />
          <Route path="/quick/:programId/:day" element={<QuickWorkout />} />
          <Route path="/swap/:programId/:day/:orderNum" element={<SwapExercise />} />
          
          <Route path="/profile" element={<Profile />} />
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
          <Route path="/exercise/:id" element={<ExerciseInfo />} />
          {/* Неизвестный адрес — на главную. Нужно не «на всякий случай»:
              а из-за Telegram: он восстанавливает свёрнутое приложение по
              РЕАЛЬНОМУ адресу, и удалённый экран (или старая ссылка)
              открылся бы пустым чёрным полотном без таб-бара. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>

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
/**
 * Сообщает Метрике о переходах между экранами.
 *
 * Приложение одностраничное: адрес меняется без перезагрузки, и счётчик сам
 * этого не замечает — без такой отправки вся статистика свелась бы к одному
 * заходу на главную.
 *
 * Первый экран пропускаем: его Метрика засчитала сама при загрузке, и второй
 * отчёт о том же адресе удвоил бы просмотры.
 */
/**
 * Свести активную тренировку с сервером.
 *
 * Человек начал тренировку в Telegram и открыл приложение в браузере — там
 * не было ни таймера, ни отмеченных упражнений: сессия жила только на первом
 * устройстве. Теперь при запуске состояние сводится, и продолжить можно там,
 * где удобнее.
 */
async function syncActiveSession() {
  try {
    const remote = await fetchSession()
    const localSession = getActiveWorkout()
    const local = localSession
      ? { ...localSession, done: loadWorkoutProgress(localSession.programId, localSession.day, localSession.place) }
      : null

    const merged = mergeSessions(local, remote)
    if (!merged) return

    const { session, done, from } = merged

    // Отменили или завершили на другом устройстве — гасим и здесь.
    // clearActiveWorkout сам погасит и на сервере: надгробие уже стоит,
    // повторная отметка ничего не портит.
    if (from === 'cleared') {
      clearActiveWorkout()
      return
    }
    if (from !== 'local') {
      adoptActiveWorkout(session)
      saveWorkoutProgress(session.programId, session.day, session.place, done)
    }
    // Своё и объединённое отдаём обратно: сервер должен знать итог сведения,
    // иначе второе устройство при следующем заходе увидит устаревшее.
    if (from !== 'remote') {
      pushSession({ ...session, done })
    }
  } catch (e) {
    // Сессия — не то, ради чего стоит ронять запуск приложения.
    console.warn('[session] не свелась:', e?.message)
  }
}

function MetrikaRouteTracker() {
  const { pathname, search } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    metrikaHit(pathname + search)
  }, [pathname, search])

  return null
}

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
 * Переход по ссылке из напоминания бота.
 *
 * Кнопка «Начать» в сообщении должна открывать саму тренировку, а не главную:
 * иначе человек после тапа снова ищет, куда идти, и напоминание не срабатывает.
 *
 * Отрабатывает РОВНО ОДИН раз за запуск. start_param живёт в initDataUnsafe до
 * конца сессии, и без этого замка любой возврат на главную утаскивал бы обратно
 * в тренировку — из приложения стало бы невозможно выйти.
 *
 * Заодно отмечает заход: по нему бот понимает, что пинок сработал.
 */
function StartRouteController() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return

    // Заход из напоминания считаем ДО проверки маршрута: часть сообщений ведёт
    // просто на главную, маршрута у них нет, но факт возврата человека — есть,
    // и он тут самое ценное.
    const notification = getNotificationType()
    if (notification) goal(GOALS.NOTIFICATION_OPEN, { type: notification })

    const route = getStartRoute()
    if (!route) { handled.current = true; return }
    handled.current = true
    // Переход ОБЫЧНЫЙ, не replace: иначе в истории браузера остаётся один
    // экран, и кнопке «Назад» некуда возвращаться — со статистики, открытой
    // из бота, выйти было невозможно. Повторный заход исключает handled.
    navigate(route.path, { state: route.state })
  }, [navigate])

  // Отметка захода — при каждом старте, независимо от того, по ссылке пришли
  // или сами. Ошибку глушим: не смогли отметиться — не повод ломать запуск.
  useEffect(() => {
    const off = on(EVENTS.USER_READY, () => { touchLastSeen().catch(() => {}) })
    if (getCurrentUser()) touchLastSeen().catch(() => {})
    return off
  }, [])

  return null
}

/**
 * Приём программы по ссылке — из Telegram (start_param) или из браузера
 * (?share=). Тянет снимок и показывает модалку сохранения. Если автор —
 * сам пользователь, не предлагаем.
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
      // Своя же программа — предлагать нечего, и токен больше не нужен.
      if (snap.author_id === user.id) { clearPendingShareToken(); return }
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
      onClose={() => { clearPendingShareToken(); setSnapshot(null) }}
      onSaved={() => { clearPendingShareToken(); setSnapshot(null); navigate('/category/gym') }}
    />
  )
}