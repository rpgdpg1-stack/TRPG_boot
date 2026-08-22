import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { getCachedSettings, fetchSettings, saveSettings } from '../lib/notifications'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, ToggleRow } from '../components/FormControls'

/**
 * Напоминания о тренировках.
 *
 * Приходят в Telegram от бота, поэтому экран не просит системных разрешений —
 * только решает, что и когда слать.
 *
 * Два переключателя, а не пять. Причина не в лени: чем длиннее список, тем
 * чаще человек выключает всё разом вместо того, чтобы разбираться. Отчёт и
 * напоминание — разные по смыслу вещи (первое хотят почти все, второе не все),
 * и это единственное деление, которое стоит выбора.
 *
 * Времени суток здесь нет намеренно. Оно продиктовано смыслом сообщения:
 * итоги — вечером воскресенья, когда неделя закрыта; напоминание — днём
 * понедельника. Настройка сделала бы вторым источником правды то, у чего
 * источник один.
 */
export default function Notifications() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(getCachedSettings)

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  // База — источник правды: человек мог переключить тумблер на другом
  // устройстве. Кеш показан первым кадром, ответ базы просто уточняет.
  useEffect(() => {
    let cancelled = false
    fetchSettings().then((fresh) => { if (!cancelled) setCfg(fresh) })
    return () => { cancelled = true }
  }, [])

  const set = (key) => {
    const next = { ...cfg, [key]: !cfg[key] }
    setCfg(next)
    saveSettings(next)
  }

  const allOff = !cfg.digest && !cfg.nudge

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Напоминания</ScreenTitle>

      <SectionLabel>В Telegram</SectionLabel>
      <FormCard>
        <ToggleRow
          label="Итоги недели и месяца"
          hint="Сводка в воскресенье вечером и первого числа"
          value={cfg.digest}
          onToggle={() => set('digest')}
        />
        <ToggleRow
          label="Напоминания о пропусках" divider
          hint="В понедельник, если за неделю не было тренировок"
          value={cfg.nudge}
          onToggle={() => set('nudge')}
        />
      </FormCard>

      <p style={styles.note}>
        {allOff
          ? 'Бот молчит. Ничего приходить не будет.'
          : 'Не чаще одного сообщения в неделю.'}
      </p>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  // Тот же вид, что у SoonNote в остальных настройках: тихая подпись под
  // карточкой. Отдельным стилем, а не компонентом — это не «скоро будет».
  note: {
    fontFamily: 'var(--font-manrope)', fontSize: 'var(--text-caption-size)',
    color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.45,
    padding: 'var(--space-4) var(--space-5) 0', maxWidth: '320px', margin: '0 auto'
  }
}
