import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getExerciseById } from '../features/exercises/api'
import { SUB_GROUP_LABELS, MUSCLE_GROUP_LABELS } from '../features/programs/labels'
import { getMuscleGroupColors } from '../features/programs/colors'
import ExerciseVideo from '../components/ExerciseVideo'

/**
 * Полноэкранная страница с подробной информацией об упражнении.
 *
 * URL: /exercise/:id
 * State (опционально): { returnTo: '/workout/split/A' } — куда вести "Назад".
 *
 * Назад от Telegram BackButton:
 *   - если в state есть returnTo → туда
 *   - иначе → navigate(-1) (история браузера)
 *
 * Структура страницы:
 *  - Видео сверху на всю ширину контентной зоны, квадратное, скругление 33px
 *  - Название упражнения крупно
 *  - Теги группы + подгруппы
 *  - Подходы (meta_info)
 *  - Описание (description из БД). Если description пустой —
 *    показываем placeholder "Скоро тут будет подробное описание техники"
 *
 * В дальнейшем сюда добавим: целевые мышцы, типичные ошибки, советы.
 * Под это в exercises есть колонка description — пока используем её как
 * единый текст. Когда контент разрастётся — разобьём на секции.
 */
export default function ExerciseInfo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)

  // Куда вести "Назад". Если на эту страницу пришли с экрана тренировки,
  // ExerciseActionMenu передал в state: returnTo, returnedFromOrderNum, scrollY.
  // При возврате прокидываем эти данные обратно — WorkoutDay по ним
  // восстановит позицию скролла и проиграет эффекты (press + glow).
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
      <div className="page page-fade" style={styles.page}>
        <div style={styles.loading}>Загрузка...</div>
      </div>
    )
  }

  if (!exercise) {
    return (
      <div className="page page-fade" style={styles.page}>
        <div style={styles.errorBlock}>
          Упражнение не найдено.<br />
          Попробуй вернуться назад.
        </div>
      </div>
    )
  }

  const colors = getMuscleGroupColors(exercise.muscle_group)
  const groupLabel = toTitleCase(MUSCLE_GROUP_LABELS[exercise.muscle_group] || exercise.muscle_group)
  const subGroupLabel = toTitleCase(SUB_GROUP_LABELS[exercise.sub_group] || exercise.sub_group)

  // description в БД может содержать дефолтный плейсхолдер "Здесь будет подробное описание".
  // Если такой — считаем что описания нет и показываем UI-заглушку. Когда заполнишь
  // реальный текст — он будет показан автоматически.
  const hasRealDescription = exercise.description
    && exercise.description.trim()
    && !exercise.description.includes('Здесь будет подробное описание')

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Видео сверху на всю ширину контентной зоны страницы */}
      <div style={styles.videoBlock}>
        <ExerciseVideo
          videoUrl={exercise.video_url}
          previewUrl={exercise.preview_url}
          size="full"
        />
      </div>

      {/* Название упражнения */}
      <h1 style={styles.title}>{exercise.name}</h1>

      {/* Теги: группа (цветная) + подгруппа (серая) */}
      <div style={styles.tagsRow}>
        {groupLabel && (
          <span style={{ ...styles.tag, background: colors.tag, color: '#FFFFFF' }}>
            {groupLabel}
          </span>
        )}
        {subGroupLabel && (
          <span style={{ ...styles.tag, ...styles.tagSecondary }}>
            {subGroupLabel}
          </span>
        )}
      </div>

      {/* Подходы */}
      {exercise.meta_info && (
        <div style={styles.meta}>
          Подходы: <span style={styles.metaValue}>{exercise.meta_info}</span>
        </div>
      )}

      {/* Описание */}
      <div style={styles.sectionHeader}>ОПИСАНИЕ</div>
      <div style={styles.descriptionBlock}>
        {hasRealDescription ? (
          // Если в БД реальный текст — показываем его, сохраняя переносы строк
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
  )
}

function toTitleCase(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

const styles = {
  page: {},
  loading: {
    textAlign: 'center',
    padding: '60px 20px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  },
  errorBlock: {
    padding: '40px 20px',
    textAlign: 'center',
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5
  },
  videoBlock: {
    width: '100%',
    marginTop: '4px',
    marginBottom: '20px'
  },
  title: {
    fontFamily: 'var(--font-geist)',
    fontSize: '22px',
    fontWeight: 700,
    lineHeight: 1.25,
    color: 'var(--color-text)',
    margin: '0 0 12px 0',
    padding: '0 4px'
  },
  tagsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '14px',
    padding: '0 4px'
  },
  tag: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    fontFamily: 'var(--font-manrope)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    lineHeight: '16px',
    whiteSpace: 'nowrap'
  },
  tagSecondary: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#A0A0A0',
    fontWeight: 600
  },
  meta: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    fontWeight: 500,
    color: '#888888',
    marginBottom: '24px',
    padding: '0 4px'
  },
  metaValue: {
    color: 'var(--color-text)',
    fontWeight: 700
  },
  sectionHeader: {
    fontFamily: 'var(--font-display)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    marginBottom: '10px',
    paddingLeft: '4px'
  },
  descriptionBlock: {
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-card)',
    padding: '20px 18px',
    minHeight: '120px'
  },
  descriptionText: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    color: 'var(--color-text)',
    lineHeight: 1.6
  },
  paragraph: {
    margin: '0 0 10px 0'
  },
  descriptionPlaceholder: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.6,
    padding: '20px 8px'
  }
}