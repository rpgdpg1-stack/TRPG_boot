import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic } from '../lib/telegram'
import { getPersonalSync, loadPersonal, savePersonal, ageFromBirthDate, formatBirthDate } from '../lib/personal-data'
import { dropMediaCaches } from '../lib/gender-media'
import ScreenTitle from '../components/ScreenTitle'
import { FormCard, SelectRow, PickerRow } from '../components/FormControls'
import BirthDateModal from '../components/BirthDateModal'
import HeightModal from '../components/HeightModal'
import { pluralizeYears } from '../utils/plural'

/**
 * Личные данные — пол, рост, дата рождения.
 *
 * ЭТО СПИСОК НАСТРОЕК, А НЕ ФОРМА. Сюда заходят раз в полгода поправить одно
 * поле и выйти, поэтому кнопки «Сохранить» здесь нет: каждое значение
 * выбирается в пикере и уходит на сервер сразу, подтверждение — вибрация
 * (так ведут себя настройки Telegram и iOS). Кнопка-индикатор «Сохранено»
 * занимала бы больше веса, чем сами данные, и требовала лишнего действия.
 *
 * ВСЕ ТРИ СТРОКИ ОДИНАКОВЫ: заголовок — значение по правому краю — шеврон.
 * Ни одного поля ввода: клавиатура в мини-приложении дёргает экран, а руками
 * можно занести рост 1930 см. Барабан невалидного просто не предлагает.
 *
 * ПОРЯДОК СТРОК: пол — базовая характеристика, он решает, чью гифку показывать
 * у упражнения (и в тренировке, и в любимых, и в рекордах — своих и у друзей);
 * рост и дата рождения вводятся один раз и живут дальше сами. Веса здесь нет:
 * он меняется постоянно и ведётся историей в «Замерах тела».
 *
 * ВОЗРАСТ — приставка к дате, приглушённая и без скобок: он посчитан, а не
 * выбран, и отдельно его не редактируют. Нужен, чтобы человек сразу увидел,
 * что дату мы поняли правильно.
 */
const SEX = [
  { id: 'male', label: 'Мужской' },
  { id: 'female', label: 'Женский' }
]

export default function PersonalData() {
  const navigate = useNavigate()
  const [data, setData] = useState(() => getPersonalSync())
  const [pick, setPick] = useState(null)   // 'height' | 'birth' | null

  useEffect(() => {
    window.scrollTo(0, 0)
    lockVerticalSwipes()
    backButton.setHandler(() => navigate(-1))
    // Свежие данные из базы: на другом устройстве могли поменять.
    loadPersonal().then(setData)
  }, [navigate])

  /**
   * Сохранить сразу. Локальную копию `savePersonal` обновляет до запроса,
   * поэтому экран не ждёт сеть — вибрация подтверждает, что значение принято.
   */
  const применить = async (patch) => {
    const следующее = { ...data, ...patch }
    setData(следующее)
    const полПоменялся = patch.sex !== undefined && patch.sex !== data.sex
    const ок = await savePersonal(следующее)
    if (!ок) { haptic.error(); window.alert('Не удалось сохранить. Проверь подключение.'); return }
    haptic.success()
    // Пол решает, чью гифку показывать: сбрасываем разложенные под пол ссылки,
    // чтобы упражнения перерисовались сразу, а не после перезахода.
    if (полПоменялся) dropMediaCaches()
  }

  const возраст = ageFromBirthDate(data.birth_date)

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Личные данные</ScreenTitle>

      <FormCard>
        <SelectRow label="Пол" options={SEX} value={data.sex} onChange={(v) => применить({ sex: v })} />
        <PickerRow
          label="Рост" divider
          value={data.height_cm ? `${data.height_cm} см` : ''}
          onOpen={() => setPick('height')}
        />
        <PickerRow
          label="Дата рождения" divider
          value={formatBirthDate(data.birth_date)}
          note={возраст != null ? `${возраст} ${pluralizeYears(возраст)}` : null}
          onOpen={() => setPick('birth')}
        />
      </FormCard>

      <p style={styles.note}>
        Пол влияет только на картинку упражнения.
      </p>

      {pick === 'height' && (
        <HeightModal
          value={data.height_cm}
          onPick={(cm) => { setPick(null); применить({ height_cm: cm }) }}
          onClose={() => setPick(null)}
        />
      )}
      {pick === 'birth' && (
        <BirthDateModal
          value={data.birth_date}
          onPick={(iso) => { setPick(null); применить({ birth_date: iso }) }}
          onClose={() => setPick(null)}
        />
      )}
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  // Футноут секции: одна строка сразу под карточкой, как подпись группы в iOS.
  note: {
    margin: 'var(--space-2) var(--space-2) 0',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-label-size)',
    fontWeight: 'var(--weight-text)',
    lineHeight: 1.45,
    color: 'var(--color-text-secondary)'
  }
}
