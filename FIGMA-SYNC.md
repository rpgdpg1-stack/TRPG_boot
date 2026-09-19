# Синк код ↔ Figma

Журнал расхождений между кодом (`src/styles/tokens.css` + компоненты) и файлом Figma
(дизайн-система TRPG). **Figma — основной источник правды**, но правки иногда рождаются в коде
(вайб-кодинг). Тогда пишем их сюда, чтобы не забыть продублировать в Figma — и наоборот.

Правило: поменял визуал/токен только в одном месте → строка сюда со статусом. Синхронизировали →
`✅ synced` + дата. Файл проверяем в начале figma-сессии.

---

## 🔴 Ждёт переноса в Figma (правка в коде, в Figma ещё нет)

_(пусто)_

## 🔵 Ждёт переноса в код (правка в Figma, в коде ещё нет)

- **Large-кнопка: `padding: 0 18px`** — 18px вне шкалы отступов (4/8/12/16/20…). Решить: привести к
  `space/4` (16) или `space/5` (20), или узаконить 18 отдельным токеном. В Figma пока стоит 18 для
  точности. (ActionButton.jsx, стиль `md`.)
- **Button: иконка Medium/Small = 18** — заведена переменная `Size → icon/18` (=18). В Figma иконки
  M/S кнопок привязаны к ней (Large остаётся 24 = `icon/lg`). В коде проверить/добавить `--icon-18: 18px`
  и применить к иконкам кнопок Medium/Small (сейчас pill-play уже 18, но токена нет).
- **Button: новая таксономия — 36 вариантов** = Variant (Primary · Primary-tonal · Secondary ·
  Tertiary) × Size (L 52 · M 36 · S 30) × **State (Default · Disabled · Destructive)**. Destructive и
  Disabled — это СОСТОЯНИЯ (не отдельные варианты), у каждого варианта свой вид:
  - *Disabled:* Primary/Primary-tonal/Secondary → `surface/disabled` + `text/disabled`; Tertiary →
    прозрачный + `text/disabled`; Destructive-строки нет (Destructive — отдельное состояние).
  - *Destructive:* Primary → `status/error` (красная заливка) + белый текст; Primary-tonal/Secondary →
    `surface/tonal` + красный текст `status/error`; Tertiary → прозрачный + красный текст.
  Перенести в ActionButton.jsx: `disabled` и `destructive` как модификаторы поверх любого варианта.
- **Button (текстовая) — умная:** auto-layout (HUG ширина, FIXED высота, паддинги L18/M12/S10), свойства
  `Show icon` (Boolean, вкл/выкл иконку) + `Label` (Text) + Variant×Size×State (36). `Show label` убрали —
  текст в этой кнопке всегда. Осталось: выбор иконки (instance-swap), `Border`-тумблер, порт в код.
- **Icon Button (иконочная) — НОВЫЙ сет (вариант B):** 36 вариантов Variant×Size×State, **фикс-квадрат**
  Large 52 · Medium 36 · Small 30, идеальный круг (radius на переменной), иконка по центру, без текста.
  Причина отдельного сета: у текстовой паддинг 18 → иконка-only была бы овалом 60×52; фикс-квадрат даёт
  ровный круг (как у Apple/Material). Осталось: выбор иконки (instance-swap).
- **В код перенести:** отдельный компонент IconButton (квадрат по высоте, иконка по центру), а у текстовой
  кнопки иконка — просто опциональный ведущий элемент (не круг).
- **Иконки → 41 компонент** (были фреймы на борде Foundation). Обе кнопки получили свойство **`Icon`
  (INSTANCE_SWAP)** — выбор любой из 41 иконки; иконка-инстанс тонируется под вариант (fill вектора на
  переменную состояния, как текст). Дефолт — `add`. Свап цвет держит для одновекторных иконок
  (многовекторные — designer поправит вручную, договорённость «вариант A»). Осталось: перенести грид
  иконок в Components (секция 🔣 Icons), `Border`-тумблер на Button.
- **Плагин доработан:** `filterFigmaNode` отдаёт layout/padding/vectors; добавлены
  `delete_component_property`/`edit_component_property`; `set_text_properties` + `leadingTrim`
  (cap-height центрирование текста в кнопках).
- **Button: +2 состояния (State), итого 60 вариантов** = Variant(4) × Size(3) × State(5).
  Существующие Default/Disabled/Destructive не трогали.
  - **Loading:** спиннер-дуга по центру (компонент `spinner`, 28% дуга, currentColor → тон варианта),
    без лейбла/иконки, ширина ФИКС = ширине Default. В коде — `Spinner.jsx` (класс `ptr-spin`, вращение).
  - **Pressed:** заливка ярче на 8% — новые переменные `accent/base-pressed` #ABE25A,
    `surface/tonal-pressed` #27272A, `status/error-pressed` #FA4B4B, `state/pressed` (белый 8%, Tertiary).
    Scale (прототип): широкие `--press-scale-up-lg` 1.03, круглые `--press-scale-up` 1.12; яркость
    `--press-brightness` 1.08. Success в матрицу НЕ добавляли (feedback на уровне сценария).
  - **В код:** состояние `loading` в ActionButton уже есть (Spinner/CheckMark); pressed — press-токены
    уже есть. Figma теперь источник правды для этих состояний.
- **2026-09-19 — Button: свойство `Hairline` (Boolean, по умолчанию выкл) = `bordered` в ActionButton.**
  Слой «Hairline» поверх во всех 60 вариантах: абсолютный, STRETCH×STRETCH, без заливки, обводка 1px
  Inside → `border/tonal` (белый 8%, как `--border-tonal` в коде), скругление → `radius/pill`.
  **Pressed-масштаб 1.03 в вариантах НЕ рисуем** — `rescale` рвёт токены (высота 53.56, шрифт 16.48
  вне стиля, радиус без переменной). Движение описано аннотацией на сете Button (194:1117).
  Primary·Large·Pressed пересобран из Default после теста → новый id **239:2370**.
- **2026-09-19 — Icon Button: +Loading, +Pressed → 60 вариантов** (Variant 4 × Size 3 × State 5), ряды
  под Destructive. Loading — спиннер взят из Loading-варианта Button того же Variant×Size. Pressed — заливка
  на `*-pressed`, у Tertiary `state/pressed`; scale 1.12 — аннотацией на сете (214:1764).
- **2026-09-19 — Спиннер: кольцо → дуга 28%.** Импорт SVG потерял `strokeDashoffset`, и во всех 25
  спиннерах (мастер 229:2113 + 12 Button + 12 Icon Button) было полное кольцо. Перерисовано явным
  arc-путём по геометрии `Spinner.jsx` (`tools/fix_spinner_arc.ts`), переменные обводки сохранены.
- **2026-09-19 — Иконки приведены к ДС (секция 🔣 Icons, 220:2070).**
  - Сетка **24×24** как в коде (было 28): 41 + play ужаты `rescale`, экземпляры в кнопках не сдвинулись.
  - **+16 из кода** (clock, close, eye, eye-off, finish, grip, heart, heart-fill, pause, pencil, pin, pin-fill,
    remove-friend, search, trash, trending-up) → в Figma **58 = src/assets/ui** один в один + spinner.
  - Цвет всех моно-векторов → переменная `text/primary` (было число #e6e6e6). celebration многоцветная —
    не тронута, лежит в группе «Цветные» до Duotone-сета.
  - **spinner = сет `Size=24 / 18`** (242:2612; 24 → 229:2113, 18 → 242:2610). Все 24 Loading-варианта
    Button/Icon Button — ЭКЗЕМПЛЯРЫ сета, тон варианта — override обводки. Правка мастера → во всех кнопках.
  - Раскладка: заголовок/описание как у остальных секций, 4 карточки правил (сетка, цвет, имя = файл,
    размеры), группы: Действия · Медиа и загрузка · Статус · Профиль и друзья · Тренировки · Места · Цветные.
  - Пикер `Icon` у Button и Icon Button: preferredValues = 57 моно-иконок (раньше пусто → весь файл, 347 шт.).
  - Сетка вариантов Button выровнена (`tools/align_sets.ts`).
  - Карта имя→id: `figma-mcp-bridge/scratch_icon_map.json`.
- **2026-09-19 — Duotone-группа** в 🔣 Icons: **StatsIcon** (242:2822), **ProgramsIcon** (242:2827),
  **RocketIcon** — сет `State=Off/On/Flying` (242:2838), **celebration**. Слои названы по ролям и на токенах:
  `muted` → text/secondary, `accent` → accent/base, `flame` → streak (= пропсы accent/muted/flame в коде).
  Имя = React-компонент. MuscleIcon в коде моно (muscles-line/-fill + icon/muscle) — в Duotone не входит.
- **2026-09-19 — Свап иконки держит цвет варианта.** Моды переменных НЕДОСТУПНЫ (тариф Figma: «Limited to
  1 modes only») — попытка откачена, коллекция удалена. Сделано иначе: **каждая моно-иконка = ОДИН залитый
  вектор «Vector»** (12 приведены: outline обводок + flatten; 8 пересобраны из src/assets/ui). Figma переносит
  override цвета при instance-swap по имени/типу слоя → любая из 57 иконок в Button/Icon Button красится
  токеном варианта. Проверено свапом на Primary / tonal / Tertiary / Destructive.
- **2026-09-19 — Ось Tone отдельно от State** (Button и Icon Button): Variant × Size × **Tone (Default/Destructive)**
  × **State (Default/Pressed/Disabled/Loading)** → 96 вариантов в каждом сете. Теперь есть Destructive+Pressed/
  Loading. Secondary·Destructive — фон `error/soft` (нажатие — новая `error/soft-pressed`, красный 22%).
  Icon Button Secondary — иконка `text/secondary` (серая, как «добавить» в пикере).
- **Icon Button: ось Selected (false/true)** — переключатель «добавить ↔ добавлено»: зелёный `accent/base`
  (нажатие `accent/base-pressed`) + фиксированная check на `accent/on`; Disabled — серый. +36 → 132 варианта.
  ⚠️ В Selected иконка НЕ связана со свойством Icon (привязка тянет дефолт «add» вместо check).
  В коде: токен `--color-error-soft-pressed` (22%) ещё завести при переносе.
- **2026-09-19 — Кнопки v2** (`tools/buttons_v2.ts` + `tools/relink_props.ts`):
  - **Button — 180**: Variant (+**Glass**) × Size × Tone × State (Default · Pressed · **Focus** · Disabled · Loading · **Done**).
  - **Icon Button — 195**: то же без Done + Selected (Default/Pressed/Disabled). Удалены лишние Label / Show icon.
  - **Loading/Done**: Label и иконка остаются (opacity 0), спиннер/галочка абсолютно по центру — ширина живая, как в коде.
  - **Glass**: `surface/glass` + background blur 12, нажатие `surface/glass-pressed` (новая, +25%); Destructive — `error/soft`.
  - **Hairline** — только у Glass (у остальных слой удалён; панель Figma прячет свойство, если слоя нет). Icon Button
    получил своё свойство Hairline.
  - **Focus**: кольцо 2px снаружи (зазор 1px) — `accent/strong`, у Destructive `error/strong`.
  - **Destructive-заливка**: Primary-tonal и Secondary (и Glass) — `error/soft`, нажатие `error/soft-pressed`.
  - **Icon Button Secondary** — снова белая иконка. **Selected** — как в пикере прода: `accent/soft` + зелёная check
    (`accent/base`), нажатие `accent/soft-pressed` (новая).
  - **Прототип**: у всех Default — While pressing → Pressed, Smart Animate 90 мс.
  - Все ссылки свойств перепривязаны (Pressed/Glass/Loading теряли Label и выбор иконки).
  - Секции переложены: Button → Icon Button → Input…; ширина/описания под новые сеты.
  - Для кода: новые токены `--color-error-soft-pressed` 22%, `--surface-glass-pressed`, `--accent-soft-pressed` 22%.
- **2026-09-19 — Кнопки v3: один чистый вариант + отдельные стеклянные копии и спец-компоненты.**
  - **Button (194:1117) — 108**: Variant 4 × Size 3 × Tone × State (Default · Pressed · Disabled · Loading · Done;
    у Destructive без Done). **Icon Button (214:1764) — 96**. Focus, Glass-вариант, Selected — убраны. Hover не делаем
    (продукт под телефон). Destructive — снова серая заливка, красные только текст/иконка. Hairline в основных нет.
  - **🫧 Button · Glass (252:6152) — 108** и **🫧 Icon Button · Glass (252:5692) — 96**: копии с рецептом ScrollTopButton —
    `surface/dim` 30% · blur 8 · тень 0/8/24 black 45%; Primary — `accent/glass` 72%, Destructive — `error/glass`;
    нажатие `state/pressed-strong` (белый 18%) / `*-glass-pressed`; Tertiary без фона, контент 85%; Hairline — тумблер.
  - **☑️ Select Toggle** — Size 3 × Selected × State (Default/Pressed/Disabled): выкл — `surface/highlight` 6% + серый
    плюс, вкл — `accent/soft` + зелёная check; Disabled — 45% (как в пикере прода; в пикере — Medium 36).
  - **✖️ Close Button** — Size (Large 52 / Medium 36) × Glass × State: подложка белая 8% + серый крестик, нажатие —
    белая 18% + белый, scale 1.12 (как CloseCross). Удаление — это Icon Button Tone=Destructive + trash.
  - Новые токены: `state/pressed-strong`, `accent/glass(-pressed)`, `error/glass(-pressed)`, `surface/highlight`.
  - **Select Toggle → ☑️ Row Action (253:7406) — 27**: Type = **Select** (добавить/добавлено) | **Remove** (крестик
    удаления конструктора `removeBtn`: подложка 6% + серый close; нажатие — `error/soft-pressed` = 18%
    (= `--color-error-pressed`, press-danger) + красный). Крестик: Medium 24 (глиф ≈14, как в проде), Large 32, Small 20.
  - **add, close, check — одна линия 2 px (как Material) с круглыми концами** на сетке 24
    (add: M6 12H18 M12 6V18; close: M6.5 6.5L17.5 17.5 и зеркально; check: M5 12.5 L9.5 17 L19 7.5). Цвета 402 экземпляров сохранены
    (`tools/icon_swap_keep_color.ts`). В Row Action иконки Select = размеру крестика (32/24/20).
  - **Шкала иконок — два правила.** Пилюля с текстом: 24 / 18 / 18 (иконка не крупнее текста). Круглая кнопка без
    текста (Icon Button, её Glass, Row Action, Close Button): **Large 52 → 28 · Medium 36 → 24 · Small 30 → 20**
    (`tools/round_icon_scale.ts`). Спиннер Loading остаётся своим сетом 24 / 18.
  - **grip, trending-up, logout — тоже круглые концы**, толщина прежняя (grip — полоски 2 на сетке 18, стрелки — 2).
    ⚠️ **В коде `add`, `close`, `check`, `grip`, `trending-up`, `logout` (.svg) ещё старые** — обновить при переносе
    (новые SVG лежат в `docs/figma-icons/` — при переносе скопировать в `src/assets/ui/`).
  - Прототип While pressing → Pressed во всех 6 сетах. Секции: Button → Button·Glass → Icon Button → Icon Button·Glass
    → Select Toggle → Close Button → Input…

## ✋ Ручные действия Дмитрия в Figma (мост не умеет)

_(пусто — мост теперь умеет удалять переменные/стили сам)_

---

## ✅ Синхронизировано

- **2026-09-16** — Components в Figma (страница 🧩 Components, секции стопкой): **Button** (умный,
  15 вариантов Variant×Size + Icon/Label) · **Icon Button** (4) · **Input** (Default/Focus/Filled) ·
  **Tag** (5 категорий) · **Card** · **TabBar** (3 таба, активный/неактивный) · **Modal** (confirm+тень) ·
  **Toast** (success). Всё на переменных + текст/эффект-стилях. Наработку не трогали.
- **2026-09-16** — Foundation в Figma собран полностью (8 досок: Colors/Typography/Spacing/Radius/
  Elevation/Motion/Grid/Icons) — свежая секция, всё на переменных + текст/эффект-стилях. Наработка не тронута.
- **2026-09-16** — Удалены 7 лишних переменных (`status/success`, `status/info`, `note/Color`,
  `Size → icon/md 2`, `icon/sm 2`, `blur/sm`, `blur/md`). Коллекции: Primitives 17 · Semantic 49 ·
  Spacing 12 · Radius 7 · Size 8 · Blur 2 · Motion 5.
- **2026-09-16** — Доработан мост TalkToFigma (`~/Documents/figma-mcp-bridge`): добавлены команды
  `delete_variable`/`delete_style`/`delete_variable_collection`, `rename_variable`/`rename_style`,
  `add_component_property`/`set_component_property_reference` (умные компоненты). Пересобран.
- **2026-09-16** — Foundation-токены выверены с кодом и дополнены в Figma:
  - `Size`: `btn/height` 56→52, `btn/height-sm` 48→36, +`btn/height-xs`=30.
  - `Semantic` +11: `surface/disabled` #1A1A1B, `text/disabled` #4F4F4F, `border/tonal` (белый 8%),
    `surface/tonal` #242427, `text/tonal` (зелёный), `timer` #33A756, `accent/soft`/`accent/strong`,
    `error/soft`/`error/strong`, `surface/glass`.
  - `Radius` +2: `radius/day-card`=40, `radius/day-thumb`=24.
  - Стили: +`Hero` (Geist 40/800), +эффект-тени `Shadow/Dock`/`Raised`/`Modal`.
