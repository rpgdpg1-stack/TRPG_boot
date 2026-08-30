import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic, confirm as tgConfirm } from '../lib/telegram'
import { getPersonalSync, loadPersonal, savePersonal, ageFromBirthYear } from '../lib/personal-data'
import { dropMediaCaches } from '../lib/gender-media'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, TextField, ChoiceRow } from '../components/FormControls'
import ActionButton from '../components/ActionButton'

/**
 * Личные данные — пол, рост, год рождения.
 *
 * Зачем: по ним считаются норма калорий, расход за тренировку и рекомендованные
 * веса. Поэтому экран прямо это и объясняет — иначе просьба ввести год рождения
 * выглядит как сбор данных без причины.
 *
 * ПОЛ здесь же решает, чью гифку показывать у упражнения. Веса, заметки и
 * история к полу не привязаны — меняется только картинка.
 *
 * СОХРАНЕНИЕ ПО КНОПКЕ, а не на каждую букву: пока человек набирает год, на
 * сервер улетело бы «1», «19», «199». Уходя с несохранёнными правками, экран
 * переспрашивает — иначе набранное молча пропадает.
 */
const SEX = [
  { id: 'male', label: 'Мужской' },
  { id: 'female', label: 'Женский' }
]

const ТЕКУЩИЙ_ГОД = new Date().getFullYear()

export default function PersonalData() {
  const navigate = useNavigate()
  const [data, setData] = useState(() => getPersonalSync())
  const [saved, setSaved] = useState(() => getPersonalSync())
  const [saving, setSaving] = useState(false)
  const dataRef = useRef(data)
  const savedRef = useRef(saved)
  // Обработчик кнопки «назад» ставится один раз, а сохранение зависит от
  // свежего состояния — держим его в ref, иначе обработчик замкнёт старое.
  const сохранитьRef = useRef(null)
  dataRef.current = data
  savedRef.current = saved

  const изменено = ['sex', 'height_cm', 'birth_year'].some(k => (data[k] ?? null) !== (saved[k] ?? null))

  useEffect(() => {
    window.scrollTo(0, 0)
    lockVerticalSwipes()
    // Свежие данные из базы: на другом устройстве могли поменять.
    loadPersonal().then(свежее => {
      // Не затираем то, что человек уже набрал руками.
      const грязно = ['sex', 'height_cm', 'birth_year']
        .some(k => (dataRef.current[k] ?? null) !== (savedRef.current[k] ?? null))
      if (грязно) return
      setData(свежее); setSaved(свежее)
    })
  }, [])

  // Уход назад с несохранёнными правками — переспрашиваем.
  useEffect(() => {
    backButton.setHandler(async () => {
      const грязно = ['sex', 'height_cm', 'birth_year']
        .some(k => (dataRef.current[k] ?? null) !== (savedRef.current[k] ?? null))
      if (!грязно) { navigate(-1); return }
      const ок = await tgConfirm('Изменения не сохранены. Сохранить перед выходом?')
      if (ок) await сохранитьRef.current?.()
      navigate(-1)
    })
  }, [navigate])

  const set = (key, value) => setData(prev => ({ ...prev, [key]: value }))

  // Только цифры: на мобильной клавиатуре легко занести мусор.
  const цифры = (v, max, len = 3) => {
    const n = String(v ?? '').replace(/\D/g, '').slice(0, len)
    if (!n) return null
    return Number(n) > max ? max : Number(n)
  }

  const сохранить = async () => {
    if (saving) return
    setSaving(true)
    const полПоменялся = (data.sex ?? null) !== (saved.sex ?? null)
    const ок = await savePersonal(data)
    setSaving(false)
    if (!ок) { haptic.error(); window.alert('Не удалось сохранить. Проверь подключение.'); return }
    setSaved(data)
    haptic.success()
    // Пол решает, чью гифку показывать: сбрасываем разложенные под пол ссылки,
    // чтобы упражнения перерисовались сразу, а не после перезахода.
    if (полПоменялся) dropMediaCaches()
  }

  сохранитьRef.current = сохранить

  const возраст = ageFromBirthYear(data.birth_year)

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Личные данные</ScreenTitle>

      <SectionLabel>Тело</SectionLabel>
      <FormCard>
        <ChoiceRow label="Пол" options={SEX} value={data.sex} onChange={(v) => set('sex', v)} />
        <TextField
          label="Рост" unit="см" inputMode="numeric" divider
          value={data.height_cm ?? ''} placeholder="—"
          onChange={(v) => set('height_cm', цифры(v, 250))}
        />
        <TextField
          label="Год рождения" unit={возраст != null ? `${возраст} ${склонение(возраст)}` : 'год'}
          inputMode="numeric" divider
          value={data.birth_year ?? ''} placeholder="—"
          onChange={(v) => set('birth_year', цифры(v, ТЕКУЩИЙ_ГОД, 4))}
        />
      </FormCard>

      <div style={styles.actions}>
        <ActionButton
          variant="gray"
          disabled={!изменено || saving}
          onClick={сохранить}
        >
          {saving ? 'Сохраняю…' : изменено ? 'Сохранить' : 'Сохранено'}
        </ActionButton>
      </div>

      <p style={styles.note}>
        Пол меняет только картинку упражнения: женский вариант показываем, когда он
        есть, иначе остаётся мужской. Веса, заметки и история к полу не привязаны.
      </p>
      <p style={styles.note}>
        Рост и год рождения нужны, чтобы точнее считать расход за тренировку и
        подсказывать рабочие веса. Возраст пересчитывается сам.
      </p>
    </div>
  )
}

function склонение(n) {
  const сотня = n % 100
  if (сотня >= 11 && сотня <= 14) return 'лет'
  switch (n % 10) {
    case 1: return 'год'
    case 2: case 3: case 4: return 'года'
    default: return 'лет'
  }
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' },
  actions: { marginTop: 'var(--space-4)' },
  note: {
    margin: 'var(--space-4) 0 0',
    fontFamily: 'var(--font-manrope)',
    fontSize: 'var(--text-caption-size)',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)'
  }
}
