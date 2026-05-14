import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic, backButton, lockVerticalSwipes, confirm as tgConfirm } from '../lib/telegram'
import { clearAllData } from '../lib/storage'
import { refreshCurrentUser } from '../lib/auth'

/**
 * Экран настроек.
 *
 * Доступен через шестерёнку Telegram в шапке (см. SettingsButtonController в App.jsx).
 * При входе показывает кнопку "Назад" в шапке, которая возвращает на предыдущий
 * экран. То есть если юзер зашёл с дня тренировки — вернётся туда же.
 */
export default function Settings() {
  const navigate = useNavigate()

  useEffect(() => {
    // Кнопка "Назад" в шапке Telegram — возвращает на предыдущий маршрут.
    // navigate(-1) использует историю React Router, как в браузере.
    backButton.setHandler(() => navigate(-1))
    lockVerticalSwipes()

    // При размонтировании компонента возвращаем стандартное поведение —
    // на корневых экранах (главная, прогресс, восстановление) кнопка "Назад" скрыта.
    // App.jsx через SettingsButtonController всё равно перерисует UI шапки правильно.
    return () => {
      backButton.hide()
    }
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
        { id: 'debug-reset',   icon: '🧹', title: 'Сбросить прогресс',     subtitle: 'Обнулить мускулы, квесты, стрик' }
      ]
    }
  ]

  const handleSectionTap = async (item) => {
    haptic.light()

    if (item.id === 'debug-reset') {
      const confirmed = await tgConfirm(
        'Сбросить весь прогресс?\n\nУдалятся: мускулы, недельный стрик, все выполненные квесты, история начислений.\n\nЭто действие нельзя отменить.'
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
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => handleSectionTap(item)}
                style={{
                  ...styles.itemCard,
                  ...(item.id === 'debug-reset' ? styles.itemCardDanger : {})
                }}
              >
                <span style={styles.itemIcon}>{item.icon}</span>
                <div style={styles.itemContent}>
                  <div style={{
                    ...styles.itemTitle,
                    color: item.id === 'debug-reset' ? '#FF8C42' : 'var(--color-text)'
                  }}>
                    {item.title}
                  </div>
                  <div style={styles.itemSubtitle}>{item.subtitle}</div>
                </div>
                <span style={styles.itemArrow}>›</span>
              </button>
            ))}
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
  itemIcon: { fontSize: '20px', width: '28px', textAlign: 'center' },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle: { fontFamily: 'var(--font-manrope)', fontSize: '14px', fontWeight: 600, marginBottom: '1px' },
  itemSubtitle: { fontFamily: 'var(--font-manrope)', fontSize: '10px', color: 'var(--color-text-secondary)' },
  itemArrow: { fontSize: '18px', color: 'var(--color-text-secondary)', flexShrink: 0 }
}