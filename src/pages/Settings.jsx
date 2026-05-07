import { useEffect, useState } from 'react'
import { getUser } from '../lib/telegram'
import { haptic } from '../lib/telegram'

/**
 * Экран настроек/профиля.
 * Сверху — фото из Telegram + имя + @username.
 * Ниже — карточки разделов (заглушки сейчас, наполним позже).
 */
export default function Settings() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    setUser(getUser())
  }, [])

  const sections = [
    { id: 'personal', icon: '👤', title: 'Личные данные', subtitle: 'Пол · Рост · Возраст' },
    { id: 'measurements', icon: '📏', title: 'Замеры тела', subtitle: 'Вес · Объёмы · Фото' },
    { id: 'goal', icon: '🎯', title: 'Цель', subtitle: 'Что хочешь достичь' },
    { id: 'notifications', icon: '🔔', title: 'Уведомления', subtitle: 'Напоминания о тренировках' },
    { id: 'support', icon: '💬', title: 'Поддержка', subtitle: 'Написать в отдел заботы' },
    { id: 'feedback', icon: '💡', title: 'Идеи и предложения', subtitle: 'Помоги улучшить приложение' },
    { id: 'gift', icon: '🎁', title: 'Подарить сертификат', subtitle: 'Скоро' },
    { id: 'about', icon: 'ℹ️', title: 'О приложении', subtitle: 'Версия · Политика' }
  ]

  const handleSectionTap = () => {
    haptic.light()
    // Заглушка — переход на конкретный раздел добавим позже
  }

  const displayName = user?.first_name || 'ATHLETE'
  const username = user?.username ? `@${user.username}` : ''

  return (
    <div className="page page-fade" style={styles.page}>

      {/* Шапка с аватаром и именем */}
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
        <div style={styles.userInfo}>
          <div style={styles.name}>{displayName}</div>
          {username && <div style={styles.username}>{username}</div>}
        </div>
      </header>

      {/* Карточки разделов */}
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
  page: {
    padding: '16px 16px 24px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '20px 8px',
    marginBottom: '24px'
  },
  avatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    border: '2px solid var(--color-primary)'
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
    fontSize: '28px',
    color: 'var(--color-primary)'
  },
  userInfo: {
    flex: 1,
    minWidth: 0
  },
  name: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '2px'
  },
  username: {
    fontFamily: 'var(--font-manrope)',
    fontSize: '13px',
    color: 'var(--color-text-secondary)'
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  sectionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-small)',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s ease'
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
