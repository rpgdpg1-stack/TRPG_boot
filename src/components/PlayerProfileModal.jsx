import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getUserPublicProfile } from '../lib/friends-list'
import { getCachedProfile, setCachedProfile } from '../lib/profile-cache'
import { useScrollLock } from '../lib/use-scroll-lock'
import ProfileHeader from './ProfileHeader'
import ProfileMetrics from './ProfileMetrics'
import { applyGenderAll } from '../lib/gender-media'
import { applyRecordsGender } from '../lib/records'
import CloseCross from './CloseCross'

/**
 * Модалка профиля друга (открывается тапом по строке на странице «Друзья»).
 *
 * Соц-концепция без статусов: показываем только аватар, имя, последнюю
 * тренировку и серию за неделю (та же шапка, что в своём профиле).
 * Соц-концепция без статусов: ни рангов, ни рейтинга (см. память проекта).
 *
 * Пропсы:
 *   row     — строка игрока: { user_id, first_name, username, photo_url }
 *   onClose — закрыть модалку
 */
export default function PlayerProfileModal({ row, onClose }) {
  // Стартуем из кеша (если друг уже открывался) — данные показываются сразу.
  const [pub, setPub] = useState(() => getCachedProfile(row.user_id))
  const [failed, setFailed] = useState(false)
  const overlayRef = useRef(null)
  useScrollLock(overlayRef)

  useEffect(() => {
    let cancelled = false
    getUserPublicProfile(row.user_id).then(data => {
      if (data) setCachedProfile(row.user_id, data)
      if (cancelled) return
      // Пустой ответ НЕ затирает показанное: раньше `setPub(null)` при сетевой
      // ошибке гасил уже нарисованную карточку и оставлял её в вечной загрузке.
      if (data) setPub(data)
      else setFailed(true)
    })
    return () => { cancelled = true }
  }, [row.user_id])

  // Картинки упражнений — под пол ВЛАДЕЛЬЦА профиля, а не смотрящего: у неё в
  // любимых и рекордах женский вариант приседаний, кто бы их ни открыл.
  // Пол приходит тем же ответом и больше нигде не показывается.
  const данные = useMemo(() => {
    if (!pub) return null
    return {
      ...pub,
      favorites: applyGenderAll(pub.favorites || [], pub.sex === 'female' ? 'female' : 'male'),
      records: applyRecordsGender(pub.records, pub.sex === 'female' ? 'female' : 'male')
    }
  }, [pub])

  const userObj = {
    first_name: row.first_name,
    username: row.username,
    photo_url: row.photo_url
  }

  // Рекорды друга приходят тем же ответом. Отдельный тумблер приватности держит
  // сервер: выключил — в ответе `records: null`.
  //
  // У ДРУГА показываем ТОЛЬКО рекорды (сентябрь 2026): статистика и любимые
  // превращали раздел «Друзья» в чужую аналитику, хотя заходят сюда посмотреть,
  // кто чем живёт. Рекорд — единственная социально интересная единица: «жмёт
  // 100 кг» вызывает интерес, «тренировался 7 раз за месяц» — нет.
  //
  // Живут они теперь КУБКОМ В ШАПКЕ, на месте бывшего бицепса, — поэтому секций
  // под разделителем у друга не осталось. Нет рекордов (или закрыты) — кубка
  // просто нет: строка «Инфо скрыто» убрана, она сообщала о пустоте вместо того
  // чтобы молча её не показывать.
  const friendRecords = данные?.records || null

  // Сеть не ответила и показать нечего — единственная секция, которая осталась.
  // Молчать здесь нельзя: сбой связи не должен выглядеть как «друг всё закрыл».
  const friendSections = (!pub && failed)
    ? [<div key="note" style={styles.friendNote}>Данные не загрузились</div>]
    : []

  return createPortal(
    <div ref={overlayRef} style={styles.overlay} onClick={onClose}>
      <div style={styles.inner} onClick={(e) => e.stopPropagation()}>
        <CloseCross
          onClose={onClose}
          hitSize={44}
          bubbleSize={32}
          iconSize={16}
          style={{ position: 'absolute', top: '6px', right: '6px', zIndex: 5 }}
        />
        <ProfileHeader
          user={userObj}
          lastWorkout={pub?.last_workout || null}
          isTraining={!!pub?.is_training}
          showLastWorkout={pub?.show_last_workout ?? true}
          statsLoading={pub === null && !failed}
          // Кубок справа — вместо бывшего бицепса. Рекордов нет или друг их
          // закрыл → компонент не рисует ничего, и карточка просто короче.
          rightAction={<ProfileMetrics mode="icon" records={friendRecords} />}
          sections={friendSections}
        />
      </div>

      <style>{`
        @keyframes profileModalOverlay { from { opacity: 0 } to { opacity: 1 } }
        @keyframes profileModalPanel {
          0%   { opacity: 0; transform: scale(0.9) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(13, 12, 12, 0.88)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    // Фон под модалкой заморожен НАГЛУХО: оверлей гасит жест, прокрутка — только
    // внутри карточки друга (см. inner).
    touchAction: 'none',
    overscrollBehavior: 'contain',
    padding: 'var(--tg-safe-top) var(--space-4) calc(var(--tabbar-height) + 40px)',
    overflow: 'hidden',
    animation: 'profileModalOverlay 0.25s ease-out forwards'
  },
  inner: {
    position: 'relative',
    width: '100%',
    flexShrink: 0,
    maxHeight: '100%', overflowY: 'auto', touchAction: 'pan-y', overscrollBehavior: 'contain',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    animation: 'profileModalPanel 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards'
  },
  friendNote: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    padding: 'var(--space-2) var(--space-3) var(--space-1)'
  }
}
