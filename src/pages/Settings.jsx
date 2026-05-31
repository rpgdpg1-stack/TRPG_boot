import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, confirm as tgConfirm } from '../lib/telegram'
import { clearAllData, resetProgramDayCycle, devResetBadgesOnly } from '../lib/storage'
import { refreshCurrentUser } from '../lib/auth'
import UiIcon from '../components/UiIcon'

/**
 * Экран настроек.
 *
 * В группе СИСТЕМА три пункта-обнулялки:
 *  - "Сбросить порядок дней" — стирает только цикл A/B/C
 *  - "Сбросить значки лиг" (DEV) — удаляет league_badges юзера, мускулы остаются
 *  - "Сбросить прогресс" — полный обнул
 *
 * Сброс значков нужен для теста модалок: набил мускулы → сбросил значки →
 * получил +X мускулов → ловишь модалку прямо в момент пересечения порога.
 */
export default function Settings() {
  const navigate = useNavigate()

  useEffect(() => {
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()
  }, [navigate])

  const groups = [
    {
      title: 'ИГРОК',
      items: [
        { id: 'personal',     icon: '👤', title: 'Личные данные',         subtitle: 'Пол · Рост · Возраст' },
        { id: 'goal',         icon: '🎯', title: 'Цель',                  subtitle: 'Что хочешь достичь' },
        { id: 'measurements', icon: '📏', title: 'Тело',                  subtitle: 'Вес · Объёмы · Фото' }
      ]
    },
    {
      title: 'ПРОГРЕСС',
      items: [
        { id: 'achievements', icon: '🏆', title: 'Достижения',            subtitle: 'Ачивки и значки' },
        { id: 'records',      icon: '💪', title: 'Личные рекорды',        subtitle: '1RM по упражнениям' },
        { id: 'calendar',     icon: '📅', title: 'Календарь тренировок',  subtitle: 'Активность по дням' }
      ]
    },
    {
      title: 'СИСТЕМА',
      items: [
        { id: 'library',       icon: '📚', title: 'Справочник упражнений', subtitle: 'База с техникой и видео' },
        { id: 'notifications', icon: '🔔', title: 'Уведомления',           subtitle: 'Напоминания о тренировках' },
        { id: 'support',       icon: '💬', title: 'Поддержка',             subtitle: 'Написать в отдел заботы' },
        { id: 'feedback',      icon: '💡', title: 'Идеи и предложения',    subtitle: 'Помоги улучшить приложение' },
        { id: 'gift',          icon: '🎁', title: 'Подарить сертификат',   subtitle: 'Скоро' },
        { id: 'about',         icon: 'ℹ️', title: 'О приложении',          subtitle: 'Версия · Политика' },
        { id: 'debug-reset-days',    icon: '🔄', title: 'Сбросить порядок дней', subtitle: 'Начать цикл A/B/C заново' },
        { id: 'debug-reset-badges',  icon: '🏅', title: 'Сбросить значки лиг',  subtitle: 'DEV · для теста модалок' },
        { id: 'debug-reset',         icon: '🧹', title: 'Сбросить прогресс',    subtitle: 'Обнулить мускулы, квесты, стрик' }
      ]
    }
  ]

  const handleSectionTap = async (item) => {
    haptic.light()

    if (item.id === 'debug-reset-days') {
      const confirmed = await tgConfirm(
        'Сбросить порядок дней?\n\nПрогресс, мускулы и стрик НЕ пострадают.\n\nПосле сброса все три буквы дней станут серыми — выберешь сам с какого дня хочешь начать.'
      )
      if (!confirmed) return

      try {
        await resetProgramDayCycle('split')
        haptic.success()
        window.alert('Порядок дней сброшен. Перезайди в приложение чтобы увидеть изменения.')
      } catch (err) {
        console.error('[Settings] reset days failed:', err)
        haptic.error()
        window.alert('Не удалось сбросить порядок дней. Проверь подключение.')
      }
      return
    }

    // Дев-сброс ТОЛЬКО значков лиг — для теста модалок
    if (item.id === 'debug-reset-badges') {
      const confirmed = await tgConfirm(
        'Сбросить значки лиг?\n\nЭто dev-инструмент для тестов модалок.\nМускулы, стрик и история начислений НЕ пострадают — только удалятся все полученные значки.\n\nПри следующем тапе квеста модалка значка появится снова.'
      )
      if (!confirmed) return

      try {
        const ok = await devResetBadgesOnly()
        if (ok) {
          haptic.success()
          window.alert('Значки сброшены. Тапни любой квест или заверши тренировку — должна появиться модалка значка той лиги в которой ты сейчас.')
        } else {
          haptic.error()
          window.alert('Не удалось сбросить значки. Проверь подключение.')
        }
      } catch (err) {
        console.error('[Settings] reset badges failed:', err)
        haptic.error()
        window.alert('Не удалось сбросить значки. Проверь подключение.')
      }
      return
    }

    if (item.id === 'debug-reset') {
      const confirmed = await tgConfirm(
        'Сбросить весь прогресс?\n\nУдалятся: мускулы, недельный стрик, все выполненные квесты, история начислений и значки лиг.\n\nЭто действие нельзя отменить.'
      )
      if (!confirmed) return

      try {
        await clearAllData()
        await refreshCurrentUser()
        window.dispatchEvent(new CustomEvent('xp-updated'))
        haptic.success()
        window.alert('Прогресс сброшен. Перезагрузи приложение чтобы увидеть изменения.')
      } catch (err) {
        console.error('[Settings] reset failed:', err)
        haptic.error()
        window.alert('Не удалось сбросить прогресс. Проверь подключение к интернету.')
      }
      return
    }
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {groups.map((group, idx) => (
        <section key={group.title} style={{ ...styles.group, marginTop: idx === 0 ? '8px' : '24px' }}>
          <h3 style={styles.groupTitle}>{group.title}</h3>
          <div style={styles.items}>
            {group.items.map(item => {
              const isDanger = item.id === 'debug-reset'
              const isWarning = item.id === 'debug-reset-days' || item.id === 'debug-reset-badges'

              return (
                <button
                  key={item.id}
                  onClick={() => handleSectionTap(item)}
                  style={{
                    ...styles.itemCard,
                    ...(isDanger ? styles.itemCardDanger : {}),
                    ...(isWarning ? styles.itemCardWarning : {})
                  }}
                >
                  <span style={styles.itemIcon}>{item.icon}</span>
                  <div style={styles.itemContent}>
                    <div style={{
                      ...styles.itemTitle,
                      color: isDanger ? '#FF8C42' : isWarning ? '#FFD700' : 'var(--color-text)'
                    }}>
                      {item.title}
                    </div>
                    <div style={styles.itemSubtitle}>{item.subtitle}</div>
                  </div>
                  <span style={styles.itemArrow}>›</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

const styles = {
  page: {},
  group: {},
  groupTitle: { fontFamily: 'var(--font-tiny5)', fontSize: '11px', color: 'var(--color-text-secondary)', letterSpacing: '2px', fontWeight: 'normal', marginBottom: '10px', paddingLeft: '16px' },
  items: { display: 'flex', flexDirection: 'column', gap: '6px' },
  itemCard: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px', background: 'var(--color-card)', borderRadius: 'var(--radius-small)', width: '100%', textAlign: 'left', minHeight: '52px', transition: 'background 0.15s ease' },
  itemCardDanger: { background: 'rgba(255, 140, 66, 0.06)', border: '1px solid rgba(255, 140, 66, 0.2)' },
  itemCardWarning: { background: 'rgba(255, 215, 0, 0.05)', border: '1px solid rgba(255, 215, 0, 0.18)' },
  itemIcon: { fontSize: '20px', width: '28px', textAlign: 'center' },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600, marginBottom: '1px' },
  itemSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '10px', color: 'var(--color-text-secondary)' },
  itemArrow: { fontSize: '18px', color: 'var(--color-text-secondary)', flexShrink: 0 }
}