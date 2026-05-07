import { useEffect, useState } from 'react'
import { getUser } from '../lib/telegram'
import { haptic } from '../lib/telegram'

/**
 * Экран настроек — стилизован под Telegram-настройки.
 * Все карточки скруглены 33px (через --radius-small который теперь = 33px).
 */
export default function Settings() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    setUser(getUser())
  }, [])

  const sections = [
    { id: 'personal',     icon: '👤', title: 'Личные данные',         subtitle: 'Пол · Рост · Возраст' },
    { id: 'measurements', icon: '📏', title: 'Замеры тела',           subtitle: 'Вес · Объёмы · Фото' },
    { id: 'goal',         icon: '🎯', title: 'Цель',                  subtitle: 'Что хочешь достичь' },
    { id: 'library',      icon: '📚', title: 'Справочник упражнений', subtitle: 'База упражнений с техникой' },
    { id: 'notifications',icon: '🔔', title: 'Уведомления',           subtitle: 'Напоминания о тренировках' },
    { id: 'support',      icon: '💬', title: 'Поддержка',             subtitle: 'Написать в отдел заботы' },
    { id: 'feedback',     icon: '💡', title: 'Идеи и предложения',    subtitle: 'Помоги улучшить приложение' },
    { id: 'gift',         icon: '🎁', title: 'Подарить сертификат',   subtitle: 'Скоро' },
    { id: 'about',        icon: 'ℹ️', title: 'О приложении',          subtitle: 'Версия · Политика' }
  ]

  const handleSectionTap = () => {
    haptic.light()
  }

  const displayName = user?.first_name || 'ATHLETE'
  const username = user?.username ? `@${user.username}` : ''

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Профиль в стиле Telegram */}
      <header style={styles.header}>
        <div style={styles.avatar}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={styles.avatarImg} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div style={styles.name}>{displayName}</div>
        {username && <div style={styles.username}>{username}</div>}
      </header>

      {/* Список разделов — все карточки со скруглением 33px */}
      <div style={styles.sections}>
        {sections.map(section => (
          <button
            key={section.id}
            onClick={handleSectionTap}
            style={styles.sectionCard}
          >
            <span style={styles.sectionIcon}>{section.icon}</span>
            <div style={styles.sectionContent}>
              <div style={styles.sectionTitle}>{section.title}</div>
              <div style={styles.sectionSubtitle}>{section.subtitle}</div>
            </div>
            <span style={styles.sectionArrow}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const styles = {
  page: {},
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 8px 28px',
    marginBottom: '16px'
  },
  avatar: {
    width: '108px',
    height: '108px',
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    background: 'var(--color-card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-tiny5)',
    fontSize: '44px',
    color: 'var(--color-primary)'
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginTop: '4px'
  },
  username: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    marginTop: '-2px'
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  // Карточка раздела — высота ~64px при скруглении 33px = таблетка
  sectionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 20px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-small)', // теперь 33px
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s ease',
    minHeight: '60px'
  },
  sectionIcon: {
    fontSize: '22px',
    width: '32px',
    textAlign: 'center'
  },
  sectionContent: {
    flex: 1,
    minWidth: 0
  },
  sectionTitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  sectionSubtitle: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)'
  },
  sectionArrow: {
    fontSize: '20px',
    color: 'var(--color-text-secondary)',
    flexShrink: 0
  }
}
