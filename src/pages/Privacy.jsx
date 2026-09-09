import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, haptic, lockVerticalSwipes } from '../lib/telegram'
import { getPrivacy, savePrivacy } from '../lib/privacy'
import { getCurrentUser } from '../lib/auth'
import { dropCachedProfile } from '../lib/profile-cache'
import ScreenTitle from '../components/ScreenTitle'
import { FormCard, ToggleRow } from '../components/FormControls'
import PlayerProfileModal from '../components/PlayerProfileModal'

/**
 * «Приватность» — что друзья видят в твоём профиле.
 *
 * Тумблеров ДВА, ровно по тому, что вообще показывается другу (сентябрь 2026):
 * последняя тренировка и рекорды. Пункты «Статистика», «Любимые упражнения» и
 * «Показывать веса» убраны — с тех пор как в карточке друга остались только
 * рекорды, они ничего не переключали, а обещали настройку, которой нет.
 * Колонки в базе (`show_stats`, `show_favorites`, `show_weights`) не тронуты:
 * сервер их по-прежнему принимает, и вернуть пункты — это правка одного экрана.
 *
 * На СВОЙ профиль эти настройки не влияют вовсе: свои разделы всегда на месте.
 * Раньше выключенный тумблер прятал плитку и у себя — человек настраивал, что
 * видно друзьям, и терял вход к собственным цифрам.
 *
 * Внизу — превью: та же самая модалка, что открывается на странице «Друзья»,
 * с запросом СВОЕГО публичного профиля. Не нарисованная копия, а настоящая:
 * данные приходят через `api_get_user_public_profile`, то есть сервер применяет
 * к ним ровно те же правила, что и для друга. Что видно в превью — то видит друг.
 */
export default function Privacy() {
  const navigate = useNavigate()
  const [privacy, setPrivacy] = useState(() => getPrivacy())
  const [preview, setPreview] = useState(null)   // null | { нонс } — открыто превью

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const toggle = (key) => {
    // Отклик даёт сам ToggleRow — второй вызов здесь бил бы дважды.
    const next = { ...privacy, [key]: !privacy[key] }
    setPrivacy(next)
    savePrivacy(next)
  }

  const user = getCurrentUser()

  // Открываем превью с новым нонсом: модалка перемонтируется и сходит за
  // свежим ответом. Без этого после смены тумблера показывался бы прежний
  // кеш профиля, и превью врало бы ровно в тот момент, когда на него смотрят.
  const openPreview = () => {
    haptic.light()
    // Кеш профиля снят ДО правки тумблеров — сбрасываем, иначе превью покажет
    // старое состояние.
    dropCachedProfile(user?.id)
    setPreview({ nonce: Date.now() })
  }

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
        <button style={styles.previewButton} className="press-tile" onClick={openPreview}>
          Посмотреть
        </button>
      </div>

      {preview && user && (
        <PlayerProfileModal
          key={preview.nonce}
          row={{
            user_id: user.id,
            first_name: user.first_name,
            username: user.username,
            photo_url: user.photo_url
          }}
          onClose={() => setPreview(null)}
        />
      )}
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
  // Превью — отдельным блоком под карточкой настроек, с крупным разрывом:
  // это не ещё одна настройка, а проверка результата.
  previewBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
    marginTop: 'var(--space-8)'
  },
  previewLabel: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-label-size)', fontWeight: 700,
    color: 'var(--color-text-secondary)', letterSpacing: '0.2px', textAlign: 'center'
  },
  previewButton: {
    minHeight: '46px', padding: '0 var(--space-6)',
    background: 'var(--color-card)', border: 'none', borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-button-size)', fontWeight: 700,
    color: 'var(--color-text)', cursor: 'pointer'
  }
}
