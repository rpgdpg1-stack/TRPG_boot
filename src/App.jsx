import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import Loader from './components/layout/Loader'
import ErrorBoundary from './components/layout/ErrorBoundary'
import TabBar from './components/TabBar'
import LeagueBadgeModal from './components/rewards/LeagueBadgeModal'
import SeasonEndModal from './components/rewards/SeasonEndModal'
import NewSeasonModal from './components/rewards/NewSeasonModal'
import BackupReceivedModal from './components/rewards/BackupReceivedModal'

import Home from './pages/Home'
import Category from './pages/Category'
import WorkoutDay from './pages/WorkoutDay'
import SwapExercise from './pages/SwapExercise'
import Recovery from './pages/Recovery'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Favorites from './pages/Favorites'
import Sections from './pages/Sections'
import DailyBoost from './pages/DailyBoost'
import Leaderboard from './pages/Leaderboard'
import Friends from './pages/Friends'
import Rewards from './pages/Rewards'
import History from './pages/History'
import ExerciseInfo from './pages/ExerciseInfo'
import SwimWorkout from './pages/SwimWorkout'
import ProgramConstructor from './pages/ProgramConstructor'

import { initTelegram, settingsButton } from './lib/telegram'
import { ensureAuth, getCurrentUser, setCurrentUser } from './lib/auth'
import { getPendingRewards, markRewardShown, getSeasonSummary, markSeasonSummaryShown } from './lib/rewards'
import { getPendingBackups } from './lib/backups'
import { loadFavoritesEntries, getActiveDay, getRecentWorkouts } from './lib/storage'
import { getProgramBySlug } from './features/programs/registry'
import { loadMyPrograms, hydrateUserProgramsFromCache, getSharedProgram, getStartParamShareToken } from './features/programs/customProgram'
import SaveFriendProgramModal from './components/SaveFriendProgramModal'
import { getCurrentSeason, getDaysUntilSeasonEnd } from './utils/season'
import { supabase } from './lib/supabase'
import { EVENTS, on } from './lib/events'
import { checkAndResetSeasonIfNeeded } from './lib/season-reset'
import { startNetworkMonitor, onNetworkChange } from './lib/network-status'
import { syncQueue } from './lib/sync-engine'
import OfflineBanner from './components/OfflineBanner'

export default function App() {
  const [loading, setLoading] = useState(true)

  const authPromiseRef = useRef(null)
  if (authPromiseRef.current === null) {
    initTelegram()
    startNetworkMonitor() // запускаем детектор сети как можно раньше
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
      checkAndResetSeasonIfNeeded()
      // После авторизации — пробуем разгрести очередь (вдруг с прошлого
      // раза остались несинканутые операции и сеть уже есть).
      syncQueue()
      // Свои программы (своя + от друга) из БД → в реестр, ДО сборки избранного,
      // чтобы избранная пользовательская программа корректно подтянулась.
      await loadMyPrograms()
      if (cancelled) return
      // Предзагружаем избранное в кеш, чтобы на главной карточка появилась
      // сразу вместе с остальным контентом, без мигания.
      loadFavoritesEntries(async (slug) => {
        const prog = getProgramBySlug(slug)
        if (!prog) return null
        const activeDay = await getActiveDay(slug)
        return { prog, activeDay }
      }).catch(() => {})
      // Прогреваем кеш истории (страница «История» стартует из него мгновенно).
      getRecentWorkouts(100).catch(() => {})
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
        <RewardsQueueController />
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
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/history" element={<History />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/sections" element={<Sections />} />
          <Route path="/daily-boost" element={<DailyBoost />} />
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
  if (location.pathname.startsWith('/constructor')) return null
  return <TabBar />
}

/**
 * Контроллер очереди наград и сезонных событий.
 *
 * Очередь модалок (показываются по одной):
 *  1. Значки лиг (LeagueBadgeModal) — отсортированы по возрастанию ранга
 *  2. Сезонные рамки (SeasonEndModal) — за прошлые сезоны
 *  3. Приветствие нового сезона (NewSeasonModal) — если сменился сезон
 *
 * Источники значков:
 *  - getPendingRewards() при старте — накопленные за прошлые сессии
 *  - событие BADGE_EARNED — свежевыданный значок ПРЯМО СЕЙЧАС, добавляется
 *    в очередь моментально, чтобы модалка появилась без перезахода
 *
 * Дедупликация: при добавлении значка через BADGE_EARNED проверяем что
 * такого rank_index ещё нет в очереди (защита от дублей если событие
 * прилетит дважды). Также не добавляем если модалка такого rank_index
 * уже показывается (queue[0]).
 *
 * Для новых юзеров (last_seen_season = NULL) модалку NewSeasonModal НЕ
 * показываем — тихо проставляем текущий сезон в БД.
 */
function RewardsQueueController() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState([])

  // Базовая загрузка очереди — стартовая + при USER_CHANGED.
  // Свежие значки догружаются через отдельный эффект на BADGE_EARNED.
  useEffect(() => {
    let cancelled = false

    const buildQueue = async () => {
      const items = []

      // Подстраховки — первыми (приятная новость "тебя поддержали" сразу).
      // Все невыданные показываем ОДНОЙ модалкой-списком (BackupReceivedModal).
      const pendingBackups = await getPendingBackups()
      if (pendingBackups?.length) {
        items.push({ type: 'backups', payload: pendingBackups })
      }

      const { badges } = await getPendingRewards()
      if (badges?.length) {
        const sortedBadges = [...badges].sort((a, b) => a.rank_index - b.rank_index)
        for (const b of sortedBadges) items.push({ type: 'badge', payload: b })
      }

      // Итоги сезона — одна модалка на снимок (season_summaries).
      // Заменила старую per-frame модалку: медали/титулы Бессмертного
      // отражаются здесь же, а копятся в Наградах.
      const summary = await getSeasonSummary()
      if (summary) {
        items.push({ type: 'season_summary', payload: summary })
      }

      const user = getCurrentUser()
      const currentSeason = getCurrentSeason()

      if (user && currentSeason) {
        if (user.last_seen_season === null || user.last_seen_season === undefined) {
          try {
            await supabase
              .from('users')
              .update({ last_seen_season: currentSeason.key })
              .eq('id', user.id)
            setCurrentUser({ ...user, last_seen_season: currentSeason.key })
          } catch (e) {
            console.warn('[App] silent last_seen_season init failed:', e?.message)
          }
        } else if (user.last_seen_season !== currentSeason.key) {
          items.push({
            type: 'new_season',
            payload: {
              season: currentSeason,
              daysLeft: getDaysUntilSeasonEnd()
            }
          })
        }
      }

      if (!cancelled) setQueue(items)
    }

    buildQueue()

    const offChanged = on(EVENTS.USER_CHANGED, buildQueue)
    return () => {
      cancelled = true
      offChanged()
    }
  }, [])

  // Подписка на свежевыданные значки. Когда юзер только что пересёк порог —
  // добавляем значок в начало очереди (после текущего показываемого),
  // чтобы модалка появилась моментально.
  useEffect(() => {
    const handler = async (evt) => {
      const rankIndex = evt?.detail?.rank_index
      if (rankIndex === null || rankIndex === undefined) return

      console.log('[App] BADGE_EARNED received, rank_index =', rankIndex)

      // Получаем актуальный id записи из БД, чтобы потом markRewardShown
      // сработал по правильному id. Запись уже создана RPC, ищем её.
      const user = getCurrentUser()
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('league_badges')
          .select('id, rank_index')
          .eq('user_id', user.id)
          .eq('rank_index', rankIndex)
          .single()

        if (error || !data) {
          console.warn('[App] could not find badge record after BADGE_EARNED:', error)
          return
        }

        setQueue(prev => {
          // Дедупликация: уже есть такой значок в очереди?
          const alreadyQueued = prev.some(
            it => it.type === 'badge' && it.payload.rank_index === rankIndex
          )
          if (alreadyQueued) return prev

          // Вставляем сразу после текущего (если он показывается), иначе в начало.
          // Это даёт эффект "значок появился моментально, но плавно ждёт
          // если что-то уже на экране".
          const newItem = { type: 'badge', payload: { id: data.id, rank_index: rankIndex } }
          if (prev.length === 0) return [newItem]
          return [prev[0], newItem, ...prev.slice(1)]
        })
      } catch (e) {
        console.warn('[App] BADGE_EARNED handler exception:', e?.message)
      }
    }

    return on(EVENTS.BADGE_EARNED, handler)
  }, [])

  const handleConfirm = async () => {
    const current = queue[0]
    if (!current) return

    if (current.type === 'backups') {
      // Пометку показанными делает сама модалка (markBackupsShown по всем ids
      // группы). Здесь после «Готово» уводим на главную — как обычно.
      navigate('/')
    } else if (current.type === 'badge') {
      markRewardShown(current.payload.id, 'badge')
    } else if (current.type === 'season_summary') {
      markSeasonSummaryShown(current.payload.id)
    } else if (current.type === 'new_season') {
      const user = getCurrentUser()
      if (user) {
        const newKey = current.payload.season.key
        try {
          await supabase
            .from('users')
            .update({ last_seen_season: newKey })
            .eq('id', user.id)
          setCurrentUser({ ...user, last_seen_season: newKey })
        } catch (e) {
          console.warn('[App] update last_seen_season failed:', e?.message)
        }
      }
    }

    setQueue(prev => prev.slice(1))
  }

  const current = queue[0]
  if (!current) return null

  if (current.type === 'backups') {
    return (
      <BackupReceivedModal
        key="backups"
        items={current.payload}
        onConfirm={handleConfirm}
      />
    )
  }

  if (current.type === 'badge') {
    return (
      <LeagueBadgeModal
        key={`badge-${current.payload.id}`}
        rankIndex={current.payload.rank_index}
        onConfirm={handleConfirm}
      />
    )
  }

  if (current.type === 'season_summary') {
    return (
      <SeasonEndModal
        key={`summary-${current.payload.id}`}
        summary={current.payload}
        onConfirm={handleConfirm}
      />
    )
  }

  if (current.type === 'new_season') {
    return (
      <NewSeasonModal
        key="new-season"
        season={current.payload.season}
        daysLeft={current.payload.daysLeft}
        onConfirm={handleConfirm}
      />
    )
  }

  return null
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