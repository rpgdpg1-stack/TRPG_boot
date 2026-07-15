---
name: design-system-review
description: "Страж целостности дизайн-системы TRPG (код + Figma). Применять ПЕРЕД любой правкой интерфейса: сначала переиспользовать существующие токены/компоненты, новый заводить только с обоснованием. Отвечает за архитектуру и консистентность ДС, НЕ за UX/сценарии (это product-review)."
---

# Design System Review (архитектура ДС)

Страж дизайн-системы: следит, чтобы правки интерфейса НЕ ломали систему и приводили всё к
единому виду. Это про **целостность и токены**, не про UX-сценарии (ими занят `product-review`).
Специфика стилей/компонентов — в `trpg-ui`; сборка в Figma — в `trpg-figma`. Источник правды в
коде — `src/index.css`.

## Главное правило (при ЛЮБОЙ правке — этот порядок)

1. **Переиспользовать существующий токен/компонент.** Есть подходящий — берём его.
2. **Собрать композицией** уже существующих компонентов.
3. Только если (1) и (2) не подходят — **новый токен/компонент + короткое обоснование почему**
   (какой сценарий не покрывается). Не плодить дубли, не хардкодить, не изобретать параллельные
   варианты одного и того же.

Мысль лида: «меньше, но безупречно». Один смысл = один компонент/токен ВЕЗДЕ. Правку сразу
приводим к идеалу ДС (и в коде, и в Figma), а не «ещё один частный случай».

## Foundation — обязательные группы токенов

Отметки: ✓ есть в `index.css` · ⚠ пробел (заводить постепенно, НЕ переделывать всё разом).

- **Color / semantic:**
  ✓ accent (`--accent` / `--accent-dark` / `--accent-on`), `--color-primary`.
  ⚠ явные статусы `--color-success` / `-warning` / `-error` / `-info` (сейчас хардкод:
  красный `#E84545`, оранж `#FF8C42`, жёлтый `#FFD700`, голубой `--blue/--cat-pool`). Свести в токены.
- **Surface:** ✓ 3 уровня `--bg-base` / `--surface` / `--surface-raised` (= card / modal).
- **Text:** ✓ `--color-text` (primary), `--color-text-secondary`, `--text-label`, `--text-info`
  (tertiary); inverse = `--accent-on`. ⚠ явный `text-disabled`.
- **Border:** ✓ `--border-hairline` (default/subtle). ⚠ `border-strong`, `border-focus`.
- **Icon:** иконки красятся текстовыми/accent-токенами (inline SVG `currentColor`). ⚠ явных
  icon-токенов нет — держим соответствие text/accent.
- **Overlay:** ✓ backdrop (`rgba(13,12,12,0.8)`), dim (`--color-surface-dim`).
- **Divider:** ✓ `--border-hairline`.
- **Radius:** ✓ `--radius-pill(90)/card(33)/medium(20)/small(10)`. (xs/sm/md/lg/pill-мэппинг.)
- **Blur:** ✓ `--blur-sm(8)` (light) / `--blur-md(12)` (medium); glass = blur+`saturate(180%)`.
- **Button size:** ✓ `--btn-height(55)` / `--btn-height-sm(46)`.
- **Motion:** ✓ `--ease-ios`, `--duration-page`, press-токены. ⚠ шкала `fast/normal/slow`.
- **Spacing:** ⚠ единой шкалы токенов НЕТ (4/8/12/16/20/24/32/40/48/64) — отступы хардкодятся.
  Цель: ввести `--space-*` и убрать случайные 13/19/27.
- **Typography scale:** ✓ семейства `--font-geist/manrope/display` + «лестница важности»
  (`--text-label/-info`). ⚠ числовых токенов уровней (display/heading/title/body/caption/label/
  button: size+weight+line-height+tracking) НЕТ — размеры живут в компонентах. Цель: токенизировать,
  убрать случайные 17px.
- **Shadow:** ⚠ токенов нет (тени/эффекты хардкод: таб-бар, модалки). Цель: `none/sm/md/lg` (+ учесть,
  что часть «высоты» у нас даётся блюром-стеклом, а не тенью — держать консистентно).
- **Opacity:** частично (`--overlay-hover`, disabled через opacity). ⚠ токены `disabled/pressed/
  selected`.
- **Z-index:** значения есть (таб-бар 100, заголовок 90–95, скрим 90, оффлайн 9998, модалки 9999),
  ⚠ не токенизированы. Правило: НИКАКИХ `z-index: 999999`; ввести `base/header/fab/modal/toast/tooltip`.
- **Grid / safe area:** ✓ `--tg-safe-top`, `--tabbar-height/-bottom`, `.page` padding, `--tg-nav-*`.
- **Icons system:** inline SVG `currentColor`, размеры из набора 16/20/24/28/32, единая толщина.

**Хардкод-цвет/размер в правке → вынести в токен** (или ближайший существующий). Новый токен —
только по «Главному правилу».

### Минимальный набор до зрелой ДС (из аудита — статус)

Легитимизация уже используемого хардкода, не новые сущности. **Токены ВВЕДЕНЫ в `index.css`
(✅), применяем постепенно (⬜), трогая соответствующие места:**
1. ✅ **`--space-1..16`** (4/8/12/16/20/24/32/40/48/64). ⬜ применить вместо хардкод-паддингов/гэпов.
2. ✅ **Типо-роли `--text-<role>-size/-weight/-lh`** (display/title/body/label/caption/button).
   ⬜ применить вместо размеров-в-компонентах. NB: `--text-label`/`--text-info` — это ЦВЕТА, не путать.
3. ✅ **`--z-base/-scrim/-header/-nav/-banner/-modal`** (значения = текущей реальности 1/90/95/100/9998/9999).
   ⬜ заменить магические числа. Никаких `z-index:999999`.
4. ✅ **`--color-error/-warning/-success/-info`** (имена на red/yellow/green/blue-500, 0 новых цветов).
   ⬜ заменить инлайн `#E84545`/`#FFD700` (Settings tone, модалки).
5. ✅ **`--shadow-dock` / `--shadow-modal`**. ⬜ заменить хардкод-тени (таб-бар/док, модалки).
6. ✅ **`index.css` разбит** на `src/styles/{tokens,base,keyframes,utilities}.css`; `index.css` = 4
   `@import` (порядок: tokens→base→keyframes→utilities). Токены живут в `styles/tokens.css` (`:root`).

Не переделывать разом: токен есть → применяем в местах, которые и так трогаем.

## Компоненты — инвентарь + матрица состояний

Для КАЖДОГО компонента проверять слой-токены: `background · text · border · icon · radius ·
padding · gap · height · motion` и **состояния** (где применимо): `default · pressed(+haptic) ·
disabled · selected · loading · error · success`. Hover/focus на Telegram-мобиле второстепенны, но
для a11y/десктопа держать в уме.

**Универсальные (уровень 1):**
- Button — ✓ `ActionButton` (variant: accent/gray/graphite/neutral/ghost/dim · size: md/sm · disabled).
- Icon Button — ✓ семейство 36px (`+`/`✓`/`✕`), см. trpg-ui «Икон-кнопки».
- Modal — ✓ паттерны + `ModalButton` (серый pill дисмисс). Bottom Sheet — ⚠/по мере надобности.
- Tabs / Tab Bar — ✓ `TabBar` (низ). Header / NavBar — ✓ `ScreenTitle`.
- Card — ✓ (`ProgramCard`/`FavCardBody`). Divider — ✓ hairline. List Item — ✓ `.tg-row`.
- Chip / Tag — ✓ (правила тега упражнения/места). Skeleton — ✓. Loader — ✓. Avatar — ✓ `RankFrame`.
- Progress — ✓ линейный `XPBar` + заливки шапки/карточки; ⚠ circular/ring.
- ⚠ Пробелы (единого компонента нет — при появлении делать сразу компонентом): Input, Search,
  Switch, Radio, Segmented Control (сейчас `segGroup` хардкодится по экранам — кандидат на вынос
  `SegmentedControl`), Badge, Toast/Snackbar (сейчас ad-hoc shake-тосты), Empty State.
  Checkbox — ✓ (`PixelCheckbox`/`UiIcon check`).

**TRPG Product Components (уровень 2 — уникальные для продукта):**
✓ `ExerciseCard`, `ProgramCard`, `HistoryStats` (Metric/Statistic Card), `HistoryCalendar` +
History Row, `StreakFlame` (Weekly Progress), `RankFrame`/`RankIcon` (Rank Badge), `XPBar`,
`MuscleIcon`, `PlaceSwitcher` (Section/место-свитчер), `DailyQuests`, `ProgramEmblem`, `WaterChrome`,
`FinishConfirmModal`/`WorkoutFinishedModal`. Держать их отдельным разделом — так устроены зрелые
продуктовые ДС (Foundation+универсальные / Product).

## Naming · Accessibility

- **Имена по роли, не по виду/номеру:** ❌ `button2`, `buttonNew`, `greenButton` →
  ✓ `ActionButton` (variant), `WorkoutCard`, `ExerciseCard`, `ProgramCard`, `HistoryRow`.
- **A11y:** контраст текста на заливке (у нас `--accent-on` per-цвет), тач-таргет ≥44px,
  читаемый размер текста, видимый фокус там, где есть ввод.

## Как применять при правке (чек-лист)

1. Правка трогает интерфейс? → сверься с этим скилом ПЕРЕД кодом.
2. Значения — из токенов (цвет/радиус/отступ/блюр/размер). Хардкод → токен (или ближайший).
3. Элемент — существующий компонент/вариант? Нет → композиция? Нет → новый + обоснование.
4. Состояния и a11y компонента покрыты?
5. Имя по роли, не дубль.
6. Изменил токен/компонент → отрази и в Figma (см. trpg-figma «синк»), и в trpg-ui, если это новая
   конвенция.

Идём к идеалу постепенно: не переделываем весь проект разом — приводим к этому виду то, что трогаем,
и закрываем ⚠-пробелы по ходу. Цель — один вариант каждого элемента и в коде, и в Figma.
