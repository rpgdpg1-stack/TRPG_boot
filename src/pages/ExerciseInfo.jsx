import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getExerciseById } from '../features/exercises/api'
import ExerciseHeaderCard from '../components/ExerciseHeaderCard'

/**
 * Полноэкранная страница с подробной информацией об упражнении (техника).
 *
 * URL: /exercise/:id
 * State (опционально): { returnTo, returnedFromOrderNum, scrollY } — для возврата
 * на день тренировки с восстановлением позиции скролла.
 *
 * Структура:
 *  - Сверху ЗАКРЕПЛЁННАЯ (sticky) карточка-шапка упражнения (видео + название +
 *    теги + подходы) — тот же компонент ExerciseHeaderCard, что и в меню действий.
 *  - Ниже скроллится описание техники. Пока реального текста нет — placeholder.
 */
export default function ExerciseInfo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)

  const returnTo = location.state?.returnTo || null
  const returnedFromOrderNum = location.state?.returnedFromOrderNum ?? null
  const savedScrollY = location.state?.scrollY

  useEffect(() => {
    backButton.setHandler(() => {
      if (returnTo) {
        navigate(returnTo, {
          state: {
            returnedFromOrderNum,
            wasSwapped: false,
            scrollY: savedScrollY
          }
        })
      } else {
        navigate(-1)
      }
    })
    lockVerticalSwipes()
    // При маунте сразу прокрутка вверх — на случай если webview сохранил позицию
    window.scrollTo(0, 0)
  }, [navigate, returnTo, returnedFromOrderNum, savedScrollY])

  useEffect(() => {
    let cancelled = false
    if (!id) {
      setLoading(false)
      return
    }
    getExerciseById(id).then(data => {
      if (!cancelled) {
        setExercise(data)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="page page-fade" style={styles.fallbackPage}>
        <div style={styles.loading}>Загрузка...</div>
      </div>
    )
  }

  if (!exercise) {
    return (
      <div className="page page-fade" style={styles.fallbackPage}>
        <div style={styles.errorBlock}>
          Упражнение не найдено.<br />
          Попробуй вернуться назад.
        </div>
      </div>
    )
  }

  // description в БД может содержать дефолтный плейсхолдер. Если такой —
  // считаем что описания нет и показываем UI-заглушку.
  const hasRealDescription = exercise.description
    && exercise.description.trim()
    && !exercise.description.includes('Здесь будет подробное описание')

  return (
    <div className="page-fade" style={styles.page}>

      {/* Закреплённая карточка-шапка — как блок-шапка в дне тренировки. */}
      <div style={styles.stickyHeader}>
        <ExerciseHeaderCard
          videoUrl={exercise.video_url}
          previewUrl={exercise.preview_url}
          name={exercise.name}
          muscleGroup={exercise.muscle_group}
          subGroup={exercise.sub_group}
          meta={exercise.meta_info}
        />
        <div style={styles.stickyFade} aria-hidden="true" />
      </div>

      {/* Скроллящееся описание техники. */}
      <div style={styles.body}>
        <div style={styles.sectionHeader}>ОПИСАНИЕ</div>
        <div style={styles.descriptionBlock}>
          {hasRealDescription ? (
            <div style={styles.descriptionText}>
              {exercise.description.split('\n').map((line, idx) => (
                <p key={idx} style={styles.paragraph}>{line}</p>
              ))}
            </div>
          ) : (
            <div style={styles.descriptionPlaceholder}>
              📖<br />
              Скоро тут будет подробное описание техники,<br />
              целевые мышцы, типичные ошибки и советы
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    padding: '0 var(--space-4)',
    paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
    minHeight: '100dvh'
  },
  // Карточка-шапка закреплена сверху (как в дне тренировки): сплошной фон зоны,
  // отступ под кнопки Telegram, full-width через отрицательные боковые margin.
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'var(--color-bg)',
    paddingTop: 'var(--tg-safe-top)',
    paddingBottom: 0,
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)'
  },
  stickyFade: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: '28px',
    pointerEvents: 'none',
    zIndex: 29,
    background: 'linear-gradient(to bottom, var(--color-bg) 0%, rgba(13, 12, 12, 0.7) 35%, rgba(13, 12, 12, 0) 100%)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    maskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)'
  },
  body: {
    paddingTop: 'var(--space-5)'
  },
  sectionHeader: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: 'var(--space-3)',
    paddingLeft: 'var(--space-1)'
  },
  descriptionBlock: {
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-5) var(--space-5)',
    minHeight: '120px'
  },
  descriptionText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-button-size)',
    color: 'var(--color-text)',
    lineHeight: 1.6
  },
  paragraph: {
    margin: '0 0 var(--space-3) 0'
  },
  descriptionPlaceholder: {
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.6,
    padding: 'var(--space-5) var(--space-2)'
  },
  // Фоллбэки загрузки/ошибки используют обычный .page (центрируем текст).
  fallbackPage: {},
  loading: {
    textAlign: 'center',
    padding: '60px var(--space-5)',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)'
  },
  errorBlock: {
    padding: 'var(--space-10) var(--space-5)',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  }
}
