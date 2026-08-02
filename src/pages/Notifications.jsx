import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { localGet, localSet } from '../utils/storage'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, ToggleRow, ChoiceRow, SoonNote } from '../components/FormControls'

/**
 * Напоминания о тренировках.
 *
 * Приходить будут в Telegram от бота, поэтому экран не просит системных
 * разрешений — только настраивает, что и когда слать.
 *
 * Осознанно скупой набор: чем больше типов уведомлений, тем быстрее их
 * отключают целиком. Три переключателя, а не десять.
 *
 * Дни недели заданы расписанием программы, отдельного выбора здесь нет —
 * иначе появятся два источника правды о том, когда тренировка.
 */
const KEY = 'notification-settings'

const TIME = [
  { id: 'morning', label: 'Утро' },
  { id: 'day',     label: 'День' },
  { id: 'evening', label: 'Вечер' }
]

const DEFAULTS = { workout: true, time: 'evening', streak: true, weekly: false }

export default function Notifications() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localGet(KEY) || '{}') } } catch { return DEFAULTS }
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const set = (key, value) => {
    const next = { ...cfg, [key]: value }
    setCfg(next)
    localSet(KEY, JSON.stringify(next))
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Напоминания</ScreenTitle>

      <SectionLabel>Тренировки</SectionLabel>
      <FormCard>
        <ToggleRow
          label="Напоминать о тренировке"
          hint="В дни, когда по программе есть занятие"
          value={cfg.workout}
          onToggle={() => set('workout', !cfg.workout)}
        />
        {cfg.workout && (
          <ChoiceRow
            label="Когда напоминать" divider
            options={TIME} value={cfg.time} onChange={(v) => set('time', v)}
          />
        )}
      </FormCard>

      <SectionLabel style={{ marginTop: 'var(--space-6)' }}>Прогресс</SectionLabel>
      <FormCard>
        <ToggleRow
          label="Серия под угрозой"
          hint="Если к вечеру недели ещё нет ни одной тренировки"
          value={cfg.streak}
          onToggle={() => set('streak', !cfg.streak)}
        />
        <ToggleRow
          label="Итоги недели" divider
          hint="Короткая сводка в воскресенье вечером"
          value={cfg.weekly}
          onToggle={() => set('weekly', !cfg.weekly)}
        />
      </FormCard>

      <SoonNote>
        Настройки сохраняются, но рассылка ещё не включена — уведомления начнут
        приходить, когда бот научится их отправлять.
      </SoonNote>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' }
}
