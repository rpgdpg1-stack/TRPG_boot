import { haptic } from '../lib/telegram'

/**
 * Экран настроек — без PlayerCard (он теперь на Главной).
 * Только сгруппированные разделы: ИГРОК / ПРОГРЕСС / СИСТЕМА.
 */
export default function Settings() {

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
        { id: 'library',      icon: '📚', title: 'Справочник упражнений', subtitle: 'База с техникой и видео' },
        { id: 'notifications',icon: '🔔', title: 'Уведомления',           subtitle: 'Напоминания о тренировках' },
        { id: 'support',      icon: '💬', title: 'Поддержка',             subtitle: 'Написать в отдел заботы' },
        { id: 'feedback',     icon: '💡', title: 'Идеи и предложения',    subtitle: 'Помоги улучшить приложение' },
        { id: 'gift',         icon: '🎁', title: 'Подарить сертификат',   subtitle: 'Скоро' },
        { id: 'about',        icon: 'ℹ️', title: 'О приложении',          subtitle: 'Версия · Политика' }
      ]
    }
  ]

  const handleSectionTap = () => {
    haptic.light()
  }

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Группы разделов */}
      {groups.map((group, idx) => (
        <section key={group.title} style={{ ...styles.group, marginTop: idx === 0 ? '8px' : '24px' }}>
          <h3 style={styles.groupTitle}>{group.title}</h3>
          <div style={styles.items}>
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={handleSectionTap}
                style={styles.itemCard}
              >
                <span style={styles.itemIcon}>{item.icon}</span>
                <div style={styles.itemContent}>
                  <div style={styles.itemTitle}>{item.title}</div>
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
  groupTitle: {
    fontFamily: 'var(--font-tiny5)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    letterSpacing: '2px',
    fontWeight: 'normal',
    marginBottom: '10px',
    paddingLeft: '16px'
  },
  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  itemCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 18px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-small)',
    width: '100%',
    textAlign: 'left',
    minHeight: '52px',
    transition: 'background 0.15s ease'
  },
  itemIcon: {
    fontSize: '20px',
    width: '28px',
    textAlign: 'center'
  },
  itemContent: {
    flex: 1,
    minWidth: 0
  },
  itemTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '1px'
  },
  itemSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '10px',
    color: 'var(--color-text-secondary)'
  },
  itemArrow: {
    fontSize: '18px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}
