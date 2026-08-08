---
name: trpg-figma
description: "Перенос проекта TRPG в Figma и синк с ним: сборка дизайн-системы, компонентов-вариантов, экранов и модалок в файле Figma под портфолио Lead UX/UI. Применять, когда Дмитрий просит рисовать/переносить/обновлять что-либо в Figma через мост TalkToFigma."
---

# TRPG → Figma (перенос проекта + портфолио)

Цель: перенести ВЕСЬ проект TRPG из кода в Figma профессионально (как у лид-дизайнера) и
упаковать в кейс-портфолио «10/10». Сначала точный перенос (дизайн-система → компоненты →
экраны → модалки → флоу), потом адаптация под портфолио (подписи, кейс). Источник правды по
стилям — `src/index.css` + скил **trpg-ui**. Идём поэтапно, «по чуть-чуть», Дмитрий рядом.

## Процесс и этапы (философия — НЕ ждать «идеала»)

У живого продукта состояния «всё идеально» не бывает (Telegram/Notion/Strava тоже вечно меняются) —
их ДС развивается ВМЕСТЕ с продуктом. Ловушка «сначала ещё чуть допилю, потом Figma» = Figma
навсегда позади. Поэтому фиксируем визуальное НАПРАВЛЕНИЕ (не каждую мелочь) и начинаем перенос.
- **Этап 1 — довести визуальный язык** (вайб-кодинг, дедлайн ~неделя): зафиксировать типографику,
  скругления, кнопки, карточки, отступы, анимацию, основные паттерны. Не «идеально», а «направление».
- **Этап 2 — Foundation в Figma** (НЕ экраны): сначала Colors → Typography → Spacing → Radius →
  Shadows → Motion → Grid → Icons; затем базовые компоненты Buttons → Inputs → Tabs → Cards → Header
  → Bottom Bar. После этого есть настоящая ДС.
- **Этап 3 — экраны**: каждый собирается из готовых компонентов (инстансов).
- **Этап 4 — рабочий цикл фичи: Figma → код → (если по ходу изменилось) обновить компонент в Figma.**
  Правим сначала компонент, потом экраны, которые его используют. Так Figma всегда актуальна.
- **Порядок внутри «стилей»:** шрифты + цвета в переменные (Variables) → радиусы/отступы/эффекты →
  и только потом отчерчиваем компоненты (кнопки и т.д.). Не ждём полной готовности продукта.

## Мост TalkToFigma (как ходить в Figma)

- WebSocket-сервер моста: `cd ~/Documents/figma-mcp-bridge && bun run src/socket.ts` (порт **3055**,
  фоном). MCP-сервер (`dist/server.js`) уже подключён как MCP в Claude Code.
- В Figma-десктоп открыть файл, запустить плагин **Cursor MCP Plugin** (TalkToFigma) → он даёт
  **channel ID**. Дмитрий присылает id → `join_channel`. Без канала инструменты не работают.
- Осмотр: `get_document_info` (страницы/текущая), `get_selection`, `get_node_info(id)`.
- Проверять глазами: `export_node_as_image(nodeId, PNG)` — ОБЯЗАТЕЛЬНО после каждого блока
  (иначе не видно ошибок раскладки).

### Грабли моста (проверено)
- **`parentId` ОБЯЗАТЕЛЕН** у каждого child (create_frame/create_text). Забыл → узел уедет в корень
  страницы поверх секции, в экспорте секции его не видно.
- **Альфа НЕ применяется** у `set_fill_color`/`fillColor` (кладёт сплошной цвет, `a` игнор).
  Полупрозрачные токены (`rgba(34,34,34,0.55)`, бордеры `rgba(255,255,255,0.x)`) считать «плоским»
  эквивалентом поверх фона секции (#0A0A0B) и класть сплошным. Формула: `out = bg*(1−a) + c*a`.
- **Нет инструментов**: создать Component/Variant, переименовать узел, сменить/создать страницу,
  создать Variable/Style, задать fontFamily. → это делает Дмитрий руками (даю пошаговые клики).
  Поэтому имена узлов задаём СРАЗУ при `create_*` (переименовать потом нечем).
- **Шрифт**: `create_text` не принимает семейство → падает в дефолт (Inter). Manrope/Geist Дмитрий
  подключает и применяет Text Styles (см. ниже). Размер/вес задаём, семейство — потом.
- **Порядок** детей = порядок вызовов. Хотим ровный ряд → создавать по порядку (можно одним
  параллельным батчем в нужной последовательности). Реордера нет.
- Прозрачный контейнер-ряд: заливка = цвет фона секции (не a=0, т.к. альфа игнор).

## Структура файла (страницы) — 8 страниц (создаёт Дмитрий; СДЕЛАНО)

Мост страницы не создаёт. Рабочий файл продукта (как в продуктовых командах: исследования отдельно,
ДС отдельно, экраны отдельно). Emoji перед текстом, порядок:
1. **📚 Cover / Index** — обложка/оглавление файла.
2. **🎨 Foundation** — цвет/Accent+статусы, типографика, отступы, радиусы, тени, блюр, motion, grid, иконки.
3. **🧩 Components** — все компоненты, ВКЛЮЧАЯ модалки (Dialog · Bottom Sheet · Modal · Action Sheet) —
   модалка = компонент, отдельной страницы для них НЕТ.
4. **🏋️ Patterns** — готовые КОМБИНАЦИИ компонентов, что повторяются в аппе (компоненты = кирпичики,
   паттерны = дом): Workout List · Exercise List · Empty State · Header + Tabs · Profile Header ·
   Statistics Grid · Training Summary · Search + Filters.
5. **📱 Screens** — экраны, собранные из инстансов компонентов/паттернов.
6. **🧪 Research** — исследования: User Flow · User Journey · IA · Wireframes · анализ конкурентов
   (сюда ушли бывшие Flows).
7. **🔬 Experiments** — черновые пробы/варианты в работе.
8. **🗄️ Archive** — отложенное/старое.

**Осознанно НЕТ отдельных страниц** (по решению Дмитрия): **Case Study** (нужен только при сборке
портфолио — тогда отдельный файл/страница), **Flows** (→ в Research), **Modals** (→ в Components).

**Двухуровневая ДС** (Foundation + универсальные / Product) — внутри Components секциями:
```
🎨 Foundation:  Colors(Accent+status) · Typography · Spacing · Radius · Shadows · Blur · Motion · Grid · Icons
🧩 Components:
   • Universal:  Buttons · Icon Buttons · Inputs · Navigation(TabBar/Header) · Cards · Progress · Lists ·
                 Feedback(Toast/Empty) · Modals(Dialog/BottomSheet/Modal/ActionSheet)
   • Product (TRPG):  ExerciseCard · ProgramCard · MetricCard(HistoryStats) · HistoryRow/Calendar ·
                      WeeklyProgress(Streak) · MuscleIcon · PlaceSwitcher · DailyQuests · ProgramEmblem · WaterChrome
   (Ранги/лиги/XP/редкость/награды/рейтинг — ОТКАЗ, не переносим.)
🏋️ Patterns:  композиции из компонентов (см. список выше).
```
Инвентарь компонентов, что ✓ есть / ⚠ пробел, и правила токенов — в скиле **design-system-review**
(страж целостности ДС). Рисуя в Figma, сверяться с ним: сначала существующее, новое — с обоснованием.

## Конвенции сборки (как у лида)

- Всё в **Auto Layout** (авто-раскладка): секции — вертикальные, ряды — горизонтальные, HUG по
  контенту, осмысленные padding/gap из наших токенов.
- Компоненты строим как **вариант-лист** (variant sheet): ряды по одному свойству (variant, size,
  state), имена узлов = `значение / значение` (напр. `accent / md`) — под будущий Component Set.
- Значения (высоты, радиусы, цвета) — 1:1 из `index.css` (см. trpg-ui). Радиусы: pill=90,
  card=33, medium=20, small=10. Кнопки: md h=55/pill, sm h=46/medium.
- Секция-обёртка тёмная (#0A0A0B), заголовок + caption с параметрами.

### Как Дмитрий собирает Variants (пошагово)
1. Выделить все фреймы одного компонента (напр. 6 кнопок ряда md) — рамкой или Shift-клик.
2. ПКМ → **Create component set** (или кнопка «Combine as variants» на панели). Figma сделает
   Component Set с фиолетовой рамкой.
3. В панели справа у Component Set → секция **Properties**: переименовать свойство в `variant`
   (по именам `accent/gray/...` Figma часто распознаёт само). Добавить свойство `size` (md/sm),
   `state` (default/disabled) — через «+».
4. Имя каждого варианта — `variant=accent, size=md` и т.д. (Figma формирует из имён слоёв
   `accent / md`, если формат `prop=value` — надёжнее переименовать вручную под `variant=accent`).
5. Для инстанса: перетащить компонент из Assets, переключать свойства в панели.

### Шрифты (Manrope / Geist)
- Загрузить в файл: Figma → любой текст → выбрать **Manrope** (body) и **Geist** (заголовки/дисплей).
  Если нет — установить локально/через плагин Fonts, шрифты бесплатные (Google Fonts).
- Сделать **Text Styles**: Title, Body, Label, Caption, Button — и применить к нашим текстам
  (мост поставил Inter). Веса: крупные ≥28→800, средние 15–27→700, мелкие капс ≤14→600 (Geist).

## Прогресс (node IDs — обновлять по ходу)

Файл начат с нуля (был пустой «Page 1» = `0:1`).
- **DS · Buttons / ActionButton** — секция `2:2` (страница 🧩 Components).
  - Заголовок `2:3`, caption `2:4`, row-label md `3:5`, ряд md `3:9`, row-label sm `5:27`, ряд sm `5:28`.
  - Кнопки md: accent `3:10`, gray `3:12`, graphite `3:13`, neutral `3:14`, ghost `3:15`, dim `3:16`.
  - Кнопки sm: accent `5:29`, gray `5:30`, graphite `5:31`, neutral `5:32`, ghost `5:33`, dim `5:34`.
  - **Component Set `Button` = `51:141`** (в секции `51:84`) СОБРАН: 12 компонентов `variant=X, size=Y`
    (`51:129…51:140`), variant∈{accent,gray,graphite,neutral,ghost,dim}, size∈{md,sm}. Надписи сведены
    к заглушке **«Кнопка»** (sentence case — как в коде, не CAPS). Инстанс на странице — `51:142`.
    Осталось (руками, мост не создаёт свойства): **Text Property** «Label»; решить про `state` (сейчас
    `dim` = disabled-вариант; полноценный state=default/disabled = матрица ×2, обсуждается).
    ВАЖНО: в коде кнопки перешли на sentence case + у Начать/Завершить появились иконки (плей/флажок),
    Начать стала зелёной — при финализации Button добавить слот иконки и свериться по графиту.
  - Текст кнопок → стиль **Button** (Manrope 14/800) на все 12 label (юзер применил). В КОДЕ тоже свёл:
    `ActionButton` md+sm → `--text-button-size/-weight` (было sm 15/700), letter-spacing 0.3 (sentence case).
  - sm-радиус в коде стал **pill** (было medium) → выровнял 6 sm-вариантов в Figma на 90 (`51:135…140`).
  - **Графит УДАЛЁН** (0 использований в коде) — из `ActionButton` и из Figma-набора (`51:132/137`).
    **primary НЕ в Figma, но в коде 5× (главный CTA)** — надо добавить (= accent БЕЗ обводки).
  - **Привязка переменных к вариантам Button (сверено с ActionButton.jsx):** accent→fill `accent`/stroke
    `accent/dark` 1.5/text `accent/on`; primary→fill `accent`/БЕЗ обводки/text `accent/on`; gray→fill
    `neutral/600`/stroke `layer/3`/text `text/primary`; ghost→прозрач./stroke `layer/3`/text `text/secondary`;
    neutral→#222@55%+`blur/md`/stroke #FFF@20%/**text `accent` (зелёный!)**; dim→`surface/dim`+`blur/sm`/stroke
    `layer/3`/text #888@55%. Иконка = цвет текста варианта. neutral/dim — СТЕКЛО (opacity+Layer blur).
  - **Грабля иконок:** мост НЕ красит контур иконки и НЕ создаёт свойства компонента (Boolean/Instance
    swap). `set_fill_color` на инстансе иконки залил РАМКУ → чёрный квадрат. Вывод: цвет иконки и
    свойства — только в Figma-панели (юзер). Рекомендация лида: иконки на кнопках РЕДКИ (Начать/Завершить)
    → не вшивать в 12 вариантов, а добавлять `icon/*` на уровне инстанса на экране (Путь A). Boolean-слот
    «Icon» — только если иконки станут частыми.
- **Секция `Icons` = `54:168`** (дом для иконок, страница Components). МОСТ SVG НЕ ИМПОРТИРУЕТ — иконки
  Дмитрий вставляет вставкой (Cmd+V, Figma конвертит в вектор). Кнопочные иконки (play/finish/check/plus)
  выданы SVG-кодом из `WorkoutDay` PlayIcon/FinishIcon + `assets/ui/check.svg`. Флоу: вставить → Create
  component (`icon/play` и т.д.) → в Button добавить слот иконки (инстанс слева от label, gap space/2,
  Boolean «Icon» + Instance swap). Полный набор 35 иконок — в `src/assets/ui/*.svg` (для Icon-библиотеки).
- **🎨 Foundations** (page `1:3`): секция `Colors · Primitives` = `12:57` (title `12:58`, wrap-ряд
  `swatches` `12:59` с 17 чипами `12:60…13:76`, у каждого имя+hex). Юзер создаёт Variables-коллекцию
  `Primitives` вручную по шпаргалке. Есть ещё его секция «Словарь» `11:56`.
- **Semantic-доска** = `21:27` (title `21:28`, wrap-ряд `21:29` c 20 чипами `21:30…21:49`: accent×3,
  status×4, surface×3, text×2, cat×5, tag×3 — БЕЗ rarity). У каждого имя + «→ примитив». Юзер создаёт
  коллекцию `Semantic` (Color-переменные-алиасы на `Primitives`).
- **Typography-специмен** = `24:90` (title `24:91`, 6 блоков-ролей `24:92…24:97`, в каждом sample+spec).
  Роли: Display(Geist 28/800/1.1) · Title(Manrope 18/600/1.2) · Body(Manrope 15/500/1.4) ·
  Label(Geist 13/700/1.2) · Caption(Manrope 11/500/1.4) · Button(Manrope 14/800 CAPS ls1.5). Юзер
  подключает Manrope/Geist и создаёт Text Styles по спеке (мост рисует Inter — семейство ставит юзер).
- **Spacing-доска** = `28:119` (10 рядов-баров `28:121`/`29:123…29:131`, ширина бара = значение токена,
  подпись `space/N · Npx`). **Radius-доска** = `29:152` (4 плашки 160×80 `29:155…29:158`: pill 90 /
  card 33 / medium 20 / small 10). Юзер создаёт Number-коллекции `Spacing` и `Radius`.
- **Мобильная сетка:** экран-фрейм 390×844; Layout Grid = Columns, 4 колонки, margin 16, gutter 16,
  stretch (боковые поля 16 = `.page padding` в коде). Safe-top ≈108, таб-бар 63 + 16 снизу.
- **Button v2 (РЕДИЗАЙН по разбору) = `65:351`** на Components. Чистая система: **variant** {Primary,
  Secondary, Tertiary, Destructive} × **size** {Large 56, Medium 48} × **state** {Default, Disabled,
  Loading} (Pressed = анимация scale 0.97, НЕ вариант). Icon = Boolean + swap. Итого 4×2×3 = **24**.
  Нарисованы: Default-матрица (8, ряды Large `65:354` / Medium `66:364`) + демо States (`66:374`).
  Цвета: Primary=fill accent/text accent-on/БЕЗ обводки; Secondary=surface-raised+hairline/белый текст;
  Tertiary=только текст secondary; Destructive=subtle красный+красный текст/рамка; Disabled=muted;
  Loading=спиннер-кольцо. Старый набор `51:141` — заменить этим. Код (accent/gray/neutral/ghost/dim/
  primary) привести к Primary/Secondary/Tertiary/Destructive — ОТДЕЛЬНЫМ аккуратным заходом.
- TODO дальше: дорисовать Disabled/Loading для всех вариантов → собрать Component Set → Icon Button,
  Tag, Card, TabBar → Patterns → Screens.

## Синк код ↔ Figma

- Токены/Variables Дмитрий держит в Figma вручную (зеркало `index.css`, см. trpg-ui «Figma синк»).
  Менялся токен в коде → напомнить продублировать в Figma (коллекция → переменная → значение).
- Экраны собираем из компонентов (инстансов), как конструктор, чтобы правка компонента ДС
  меняла все экраны. Порядок: сначала Components, потом Screens из них.
