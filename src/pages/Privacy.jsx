import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getPrivacy, savePrivacy } from '../lib/privacy'
import { getCurrentUser } from '../lib/auth'
import { getUser } from '../lib/telegram'
import { getRecentWorkouts, getRecentWorkoutsSync } from '../lib/storage'
import { getRecords, getRecordsSync } from '../lib/records'
import { HISTORY_FETCH_LIMIT } from '../utils/history'
import ScreenTitle from '../components/ScreenTitle'
import { FormCard, ToggleRow } from '../components/FormControls'
import ProfileHeader from '../components/ProfileHeader'
import ProfileMetrics from '../components/ProfileMetrics'

/**
 * «Приватность» — что друзья видят в твоём профиле.
 *
 * Тумблеров ДВА, ровно по тому, что вообще показывается другу (сентябрь 2026):
 * последняя тренировка и рекорды. Пункты «Статистика», «Любимые упражнения» и
 * «Показывать веса» убраны — с тех пор как в карточке друга остались только
 * рекорды, они ничего не переключали, а обещали настройку, которой нет.
 * Колонки в базе (`show_stats`, `show_favorites`, `show_weights`) не тронуты:
 * сервер их по-прежнему принимает, и вернуть пункты — правка одного экрана.
 *
 * На СВОЙ профиль эти настройки не влияют вовсе: свои разделы всегда на месте.
 * Раньше выключенный тумблер прятал плитку и у себя — человек настраивал, что
 * видно друзьям, и терял вход к собственным цифрам.
 *
 * ПРЕВЬЮ стоит прямо под тумблерами и живёт от ЛОКАЛЬНОГО состояния, а не от
 * ответа сервера: переключил — карточка перерисовалась в тот же кадр. Ходить за
 * подтверждением на сервер здесь нельзя, иначе между тапом и результатом висела
 * бы задержка ровно там, где человек проверяет причину и следствие. Собрана из
 * тех же `ProfileHeader` + `ProfileMetrics`, что и настоящая карточка друга, и
 * подчиняется тем же правилам: скрыл последнюю тренировку — строка ушла, скрыл
 * рекорды — вместо плитки «Инфо скрыто».
 */
export default function Privacy() {
  const navigate = useNavigate()
  const [privacy, setPrivacy] = useState(() => getPrivacy())
  const [user, setUser] = useState(() => getCurrentUser() || getUser())
  const [workouts, setWorkouts] = useState(() => getRecentWorkoutsSync(HISTORY_FETCH_LIMIT) || [])
  const [records, setRecords] = useState(() => getRecordsSync())

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  // Данные для превью: последняя тренировка и рекорды. Старт из кеша
  // (мгновенно), сервер догоняет — карточка не должна мигать пустой.
  useEffect(() => {
    const tgUser = getUser()
    if (tgUser) setUser(prev => ({ ...prev, ...tgUser }))
    getRecords().then(setRecords)
    getRecentWorkouts(HISTORY_FETCH_LIMIT).then(wk => setWorkouts(wk || []))
  }, [])

  const toggle = (key) => {
    // Отклик даёт сам ToggleRow — второй вызов здесь бил бы дважды.
    const next = { ...privacy, [key]: !privacy[key] }
    setPrivacy(next)
    savePrivacy(next)
  }

  const lastWorkout = workouts.length > 0 ? workouts[0] : null
  // Ровно то же, что увидит друг: плитка «Рекорды» под разделителем, если они
  // открыты и есть. Закрыл — на её месте «Инфо скрыто».
  const previewRecords = privacy.showRecords ? records : null

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Приватность</ScreenTitle>

      <p style={styles.intro}>Выбери, что друзья видят в твоём профиле.</p>

      <FormCard>
        <ToggleRow
          label="Последняя тренировка"
          hint="Дата последней тренировки"
          value={privacy.showLastWorkout}
          onToggle={() => toggle('showLastWorkout')}
        />
        <ToggleRow
          label="Рекорды"
          hint="Лучший месяц, рабочий вес, дистанция"
          value={privacy.showRecords}
          onToggle={() => toggle('showRecords')}
          divider
        />
      </FormCard>

      <div style={styles.previewBlock}>
        <div style={styles.previewLabel}>Так твой профиль видят друзья</div>
        <div style={styles.previewCard}>
          <ProfileHeader
            user={user}
            lastWorkout={lastWorkout}
            showLastWorkout={privacy.showLastWorkout}
            sections={[<ProfileMetrics key="records" mode="icon" records={previewRecords} />]}
          />
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)' },
  intro: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 500,
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    margin: '0 auto var(--space-5)', maxWidth: '300px'
  },
  // Превью — отдельным блоком под настройками, с крупным разрывом: это не ещё
  // одна настройка, а результат уже сделанных.
  previewBlock: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    marginTop: 'var(--space-8)'
  },
  previewLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', letterSpacing: '0.2px', textAlign: 'center'
  },
  // Тот же вид, что у панели модалки друга: карточка на приподнятой поверхности.
  previewCard: {
    background: 'var(--surface-raised)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden'
  }
}
