import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backButton, lockVerticalSwipes } from '../lib/telegram'
import { localGet, localSet } from '../utils/storage'
import ScreenTitle from '../components/ScreenTitle'
import { SectionLabel } from '../components/GroupLabel'
import { FormCard, TextField, ChoiceRow, SoonNote } from '../components/FormControls'

/**
 * Личные данные — пол, рост, возраст.
 *
 * Зачем они нужны: по ним считаются норма калорий, расход за тренировку и
 * рекомендованные веса. Поэтому экран прямо это и объясняет — иначе просьба
 * ввести возраст выглядит как сбор данных без причины.
 *
 * Пока без сервера: значения лежат локально, синхронизация появится вместе с
 * профильными полями в БД. Ввод при этом рабочий — данные не теряются между
 * запусками, и когда бэкенд поспеет, их останется только отправить.
 */
const KEY = 'personal-data'

const SEX = [
  { id: 'male', label: 'Мужской' },
  { id: 'female', label: 'Женский' }
]

export default function PersonalData() {
  const navigate = useNavigate()
  const [data, setData] = useState(() => {
    try { return JSON.parse(localGet(KEY) || '{}') } catch { return {} }
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    backButton.setHandler(() => navigate('/profile'))
    lockVerticalSwipes()
  }, [navigate])

  const set = (key, value) => {
    const next = { ...data, [key]: value }
    setData(next)
    localSet(KEY, JSON.stringify(next))
  }

  // Рост и возраст — только цифры, иначе на мобильной клавиатуре легко
  // занести мусор, который потом придётся чистить при отправке на сервер.
  const digits = (v, max) => {
    const n = String(v).replace(/\D/g, '').slice(0, 3)
    return n && Number(n) > max ? String(max) : n
  }

  return (
    <div className="page page-fade" style={styles.page}>
      <ScreenTitle>Личные данные</ScreenTitle>

      <SectionLabel>Тело</SectionLabel>
      <FormCard>
        <ChoiceRow label="Пол" options={SEX} value={data.sex} onChange={(v) => set('sex', v)} />
        <TextField
          label="Рост" unit="см" inputMode="numeric" divider
          value={data.height} placeholder="—"
          onChange={(v) => set('height', digits(v, 250))}
        />
        <TextField
          label="Возраст" unit="лет" inputMode="numeric" divider
          value={data.age} placeholder="—"
          onChange={(v) => set('age', digits(v, 120))}
        />
      </FormCard>

      <SoonNote>
        Эти данные нужны, чтобы точнее считать расход за тренировку и
        подсказывать рабочие веса. Синхронизация между устройствами появится
        вместе с обновлением профиля — пока значения хранятся на этом телефоне.
      </SoonNote>
    </div>
  )
}

const styles = {
  page: { paddingTop: 'var(--tg-safe-top)', paddingBottom: 'var(--space-16)' }
}
