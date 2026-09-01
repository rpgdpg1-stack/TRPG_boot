import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes, haptic, confirm as tgConfirm } from '../lib/telegram'
import { getPersonalSync, loadPersonal, savePersonal, PERSONAL_FIELDS } from '../lib/personal-data'
import { dropMediaCaches } from '../lib/gender-media'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, TextField, SelectRow } from '../components/FormControls'
import ActionButton from '../components/ActionButton'

/**
 * Личные данные — пол и рост.
 *
 * ПОРЯДОК СТРОК не случайный: пол — базовая характеристика, он решает, чью
 * гифку показывать у упражнения; рост — стабильная величина, её вводят один
 * раз. Ниже сюда же встанет вес, но он живёт в «Замерах тела»: вес меняется
 * постоянно и его ведут историей, а не полем в анкете.
 *
 * ВОЗРАСТА ЗДЕСЬ НЕТ. Год рождения спрашивали ради точности расчётов, но ни
 * один экран его так и не считал — а лишний вопрос в анкете выглядит сбором
 * данных без причины. Понадобится — вернём вместе с тем, что его использует.
 *
 * СОХРАНЕНИЕ ПО КНОПКЕ, а не на каждую букву: пока человек набирает рост, на
 * сервер улетело бы «1», «19», «193». Уходя с несохранёнными правками, экран
 * переспрашивает — иначе набранное молча пропадает.
 */
const SEX = [
  { id: 'male', label: 'Мужской' },
  { id: 'female', label: 'Женский' }
]

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

  const грязно = () => PERSONAL_FIELDS.some(k => (dataRef.current[k] ?? null) !== (savedRef.current[k] ?? null))
  const изменено = PERSONAL_FIELDS.some(k => (data[k] ?? null) !== (saved[k] ?? null))

  useEffect(() => {
    window.scrollTo(0, 0)
    lockVerticalSwipes()
    // Свежие данные из базы: на другом устройстве могли поменять.
    loadPersonal().then(свежее => {
      // Не затираем то, что человек уже набрал руками.
      if (грязно()) return
      setData(свежее); setSaved(свежее)
    })
  }, [])

  // Уход назад с несохранёнными правками — переспрашиваем.
  useEffect(() => {
    backButton.setHandler(async () => {
      if (!грязно()) { navigate(-1); return }
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

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Личные данные</ScreenTitle>

      <SectionLabel>Тело</SectionLabel>
      <FormCard>
        <SelectRow label="Пол" options={SEX} value={data.sex} onChange={(v) => set('sex', v)} />
        <TextField
          label="Рост" unit="см" inputMode="numeric" divider
          value={data.height_cm ?? ''} placeholder="—"
          onChange={(v) => set('height_cm', цифры(v, 250))}
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
        Рост нужен, чтобы точнее считать расход за тренировку. Вес и обхваты — в
        «Замерах тела»: их ведут историей, а не одной цифрой в анкете.
      </p>
    </div>
  )
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
