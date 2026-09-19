---
name: trpg-figma
description: "Перенос TRPG в Figma и синк с ним: сборка дизайн-системы, компонентов-вариантов, экранов и модалок в файле Figma под портфолио Lead UX/UI. Работает через мост TalkToFigma."
when_to_use: "«нарисуй в Figma», «перенеси в Figma», «обнови макет», «собери компонент», работа с файлом Figma по проекту TRPG."
---

# TRPG → Figma (перенос проекта + портфолио)

Цель: перенести ВЕСЬ проект TRPG из кода в Figma профессионально (как у лид-дизайнера) и
упаковать в кейс-портфолио «10/10». Сначала точный перенос (дизайн-система → компоненты →
экраны → модалки → флоу), потом адаптация под портфолио (подписи, кейс). Источник правды по
стилям — `src/index.css` + скил **trpg-ui**. Идём поэтапно, «по чуть-чуть», Дмитрий рядом.

## 🔒 ПРАВИЛА СБОРКИ — адаптивность + переменные (ОБЯЗАТЕЛЬНО на КАЖДОМ компоненте)

Роль: **Lead Product Designer, 15 лет опыта, senior+**. Файл — идеальный, без мусора, dev-handoff-ready.
Эти правила соблюдать всегда, на каждом узле. Проверять себя после сборки.

**1. Всё на ПЕРЕМЕННЫХ, никакого хардкода.** Как только нарисовал узел с цветом/радиусом/отступом —
   сразу `bind_variable` на токен:
   - заливка/цвет текста/обводка → `fills`/`strokes` на Semantic (surface/*, text/*, accent/*, border/*…);
   - радиус → `cornerRadius` на `Radius/*`; отступы/gap/padding → `Spacing/*`;
   - высоты кнопок, размеры иконок → `Size/*`; текст → Text Styles; тени → Effect Styles.
   Сырой hex/число в узле компонента = ошибка (кроме чистых спейсеров).

**2. Auto Layout ВЕЗДЕ.** Компонент и все его группы — auto-layout, осмысленные padding/gap из токенов.

**3. Адаптивные размеры (HUG / FILL / FIXED + min/max) — как делает опытный дизайнер:**
   - **Кнопка:** высота **FIXED** (тап-таргет из `Size/btn-height*`); ширина **HUG** по умолчанию;
     док-режим «во всю ширину» — ширина **FILL**. Задать **min-width** (короткий текст не схлопывает),
     при нужде max-width. Внутр. паддинги — фикс из токенов.
   - **Лейбл:** HUG, кнопка — без переноса; длинный текст — truncate.
   - **Иконка/картинка:** **FIXED** размер (`Size/icon-*`), **aspect ratio 1:1 залочен**, НЕ тянется;
     медиа — фрейм с фикс. соотношением сторон, `scaleMode FILL`, пропорции сохраняются (не искажать).
   - **Карточка / строка списка / инпут:** ширина **FILL** (тянется по колонке экрана), высота **HUG**.
   - **Контейнеры:** тянущееся — FILL, по контенту — HUG; спейсер FILL между HUG-элементами
     (заголовок ↔ действие в шапке — классика).
   - **Constraints** (для НЕ-autolayout детей): тянущееся — Left+Right/Top+Bottom (SCALE/STRETCH),
     закреплённое — к краю, центр — CENTER; иконки — Scale с блокировкой пропорций.

**4. Наружу тоже адаптивно:** экран собирается из ИНСТАНСОВ; FILL/HUG внутри инстанса работают в экране
   (кнопка FILL в доке тянется по ширине экрана, карточка FILL — по колонке). Проектировать так, чтобы
   при растяжении на большой экран и сжатии на маленький всё вело себя логично.

**5. Самопроверка:** после сборки — прогнать в 2 ширины (узкий ~360 и широкий) экспортом: контент не
   ломается, пропорции целы, ничего не растянуто уродливо, отступы дышат из токенов.

**6. ⚠️ ГРАБЛЯ Auto Layout — дефолтные padding 10 / gap 10.** Figma (и мост) часто ставит на новый
   auto-layout паддинги/gap = **10** по умолчанию — особенно на ОБЁРТКАХ (не в самом компоненте, а в
   контейнерах-обёртках экранов/секций). ВСЕГДА задавать явные значения из токенов и ПРОВЕРЯТЬ
   (`get_node_info` → paddingTop/Bottom/Left/Right, itemSpacing) — не оставлять дефолтные 10.
   Это же проверять при сборке ЭКРАНОВ: обёртка → в неё компоненты → у обёртки выставить наши
   padding/gap, а не оставлять 10. Правило действует всегда.

**7. ⚠️ ГРАБЛЯ: обёртка с ФИКСИРОВАННОЙ высотой ОБРЕЗАЕТ контент.** Фрейм по умолчанию
   `clipsContent: true`. Если у обёртки/доски высота FIXED (как создана), а контент внутри вырос
   ниже — всё, что ниже границы, ОБРЕЗАЕТСЯ (в примере: доска Colors осталась h=400, и Semantic+Alpha
   срезало). Правило: КАЖДОЙ вертикальной обёртке/доске, куда добавляешь контент стопкой, СРАЗУ
   ставить `set_layout_sizing(..., layoutSizingVertical: "HUG")` (а по ширине HUG или FIXED по смыслу).
   Проверять после наполнения: `get_node_info` → высота обёртки ≥ суммы контента, ничего не срезано.
   Не полагаться на «создал 400 и хватит» — контент растёт, высота должна быть HUG.

### 📋 Последовательность создания (порядок действий) — reusable, для ЛЮБОГО проекта
Актуализировать этот список после каждой находки; ПЕРЕД сборкой сверяться — если шага нет, дописать.
- **Текст:** `create_text` → СРАЗУ `apply_style` (текст-стиль) + `bind_variable(fills → цвет-токен)`.
  Никогда не оставлять дефолтный **Inter** и сырой белый/чёрный цвет — только стиль + переменная.
- **Свотч/чип цвета (специмен):** `create_frame` (с fillColor для превью) → `bind_variable(fills → токен)`
  → внутрь `label` (Caption + цвет-контраст на переменной: светлый фон → `accent/on`, тёмный → `text/primary`).
- **Позиция label** внутри НЕ-auto-layout фрейма задаётся `x/y` относительно родителя (проверено).
- **Любой auto-layout:** сразу явные `padding`/`itemSpacing` из токенов + проверить (дефолт = 10, см. п.6).
- **Размеры:** назначить HUG/FILL/FIXED по типу элемента (кнопка h=FIXED/w=HUG; карточка/строка w=FILL/h=HUG;
  иконка FIXED + aspect lock). См. п.3.
- **Компонент-фрейм:** собрать внутренности → `bind` fill/stroke/cornerRadius/height к токенам → имя слоя
  СРАЗУ в вариант-формате `Prop=Value` (переименовать потом можно, но лучше сразу).
- **Порядок детей = порядок вызовов** (батч в одном сообщении создаёт в порядке перечисления; `reorder_node` есть).
- **После каждого блока — `export_node_as_image`** (в 1–2 ширины) для визуальной самопроверки.
- **Стили/переменные — переиспользовать существующие** (не плодить дубли); новый токен/стиль — только с обоснованием.

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

### ⚡ Мост-2026 — что теперь УМЕЕТ (проверено 16.09.2026)
Старые «мост не может» (Variable/Style/страница/переименовать/fontFamily) БОЛЬШЕ НЕ ВЕРНЫ.
Появились рабочие инструменты — делаем сами, руками юзера только удаление переменных/стилей:
- **Переменные:** `create_variable` (COLOR/FLOAT/BOOLEAN/EASING/TIMING; создаёт коллекцию, если нет;
  если имя занято — обновляет значение), `set_variable_value_for_mode` (правит значение по modeId),
  `bind_variable` (привязать поле узла к переменной), `add_variable_mode`.
  - **Цвет задаётся hex-строкой**, альфа — 8-значным `#RRGGBBAA` (проверено: `#FFFFFF14`=8%,
    `#9ED153B3`=70%). Мост парсит альфу верно (в отличие от `set_fill_color`, где альфа всё ещё игнор).
  - **Алиас (переменная→переменная) НЕ создать** мостом — только литеральное значение. Новые
    семантические токены-алиасы кладём литералом (то же значение), при желании юзер переалиасит руками.
- **Стили:** `create_style` (PAINT/TEXT/EFFECT/GRID). **fontFamily РАБОТАЕТ** (Geist/Manrope ставятся).
  - **Грабля EFFECT:** тень требует `blendMode` (напр. `"NORMAL"`) — без него валидатор падает
    длинной портянкой. Формат тени: `{type:"DROP_SHADOW", color:{r,g,b,a}, offset:{x,y}, radius, spread, visible, blendMode}`.
- **Страницы/узлы:** `create_page`, `set_current_page`, `rename_node`, `delete_node`,
  `create_section`, `combine_as_variants`, `create_component_from_node`, `set_layout_grids`,
  `set_effects`, `create_svg`, `set_text_properties`, `set_constraints`, `set_layout_positioning`.
- **Удаление переменных/стилей — ДОБАВЛЕНО в мост 16.09.2026** (`delete_variable{variableId}`,
  `delete_style{styleId}`). Дописано в `~/Documents/figma-mcp-bridge`: обработчики в `code.js`
  (плагин) + инструменты в `server.ts` (MCP) + union `FigmaCommand`. После правки плагина нужен
  **релоуд плагина в Figma** (Figma читает `code.js` при запуске) → новый channel. MCP-инструменты
  появятся после пересборки (`bun run build`, сделано) и реконнекта MCP (новая сессия). В текущей
  сессии команду шлём напрямую плагину: `bun run tools/figma-cmd.ts --channel <код> delete_variable '{"variableId":"..."}'`.
- **Компоненты — это узлы**, удаляются `delete_node`. `create_variable` УМЕЕТ алиасы: value `"@имя/токена"`.
- **Умные компоненты — ДОБАВЛЕНО 16.09.2026:** `add_component_property{componentId,name,type,defaultValue,preferredValues}`
  (type BOOLEAN/TEXT/INSTANCE_SWAP/VARIANT, возвращает `propertyId`) + `set_component_property_reference{nodeId,field,propertyId}`
  (field: `visible` для BOOLEAN, `characters` для TEXT, `mainComponent` для INSTANCE_SWAP).
  Флоу умной кнопки: собрать вариант-сет (`combine_as_variants`) → на COMPONENT_SET повесить
  BOOLEAN «Icon»/«Border», TEXT «Label» → привязать слой-иконку (visible) и текст (characters).
  **ПРАВИЛО: вешать BOOLEAN/TEXT-свойства ВЕЗДЕ, где это осмысленно — все компоненты умные.**
- Также добавлено: `rename_variable`, `rename_style`, `delete_variable_collection`.
- **Все правки моста — в `~/Documents/figma-mcp-bridge`** (`src/cursor_mcp_plugin/code.js` +
  `src/talk_to_figma_mcp/server.ts`, union `FigmaCommand` + `CommandParams`). После правки `code.js`
  нужен РЕЛОУД плагина в Figma (иначе старый код, признак — команда возвращает `{}` вместо ответа);
  после правки `server.ts` — `bun run build` (сделано) + реконнект MCP (новая сессия). В текущей
  сессии новые команды шлём напрямую: `bun run tools/figma-cmd.ts --channel <код> <команда> '<json>'`.

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
- **⚠️ Устарело выше:** мост РАСШИРЕН — `create_variable`, `rename_node`, `rename_variable`,
  `clone_node`, `add_component_property`, `set_component_property_reference`, `delete_variable` и т.д.
  теперь работают. Компоненты/варианты/переменные строим автономно, руки Дмитрия не нужны (кроме
  подключения шрифтов). Часть заметок «это делает Дмитрий руками» неактуальна.
- **`move_node` координаты ОТНОСИТЕЛЬНЫ родителя**, а не абсолютны. Внутри фрейма-сета на y=9990
  ребёнок с абсолютным y=9990 имеет относительный y=0. Задал y=10310 → уехал на абс. 20300. Для
  раскладки в сетку считать от 0 (верх родителя). (`resize_node`/`get_node_info` — абсолютные.)
- **Клонирование варианта внутри Component Set добавляет новый вариант** в тот же сет
  (`clone_node` кладёт клон на ту же позицию — потом `move_node` в свободную ячейку). Переименование
  клона в `Prop=Value, …` задаёт значения свойств нового варианта. Так добавляли State=Disabled (×15).
- **Bind размеров:** `bind_variable` field `width`/`height` привязывает габариты к FLOAT-переменной
  (напр. иконки кнопок → `icon/18`). Работает и на пустых фреймах-иконках.
- **Экспорт клипается фреймом сета:** добавил варианты — увеличь `resize_node` высоту сета, иначе
  нижние ряды не видны в export (как было с Disabled-рядами).
- **🎨 Красить ВСЕ внутренние элементы, не только текст.** Меняешь состояние/вариант (disabled,
  destructive, active) → привязывай к цвет-переменной И текст, И иконку, И любую декоративную деталь,
  чтобы цвет иконки совпадал с текстом. Забыл иконку — она остаётся старого цвета (грабля, ловил на
  Button disabled/destructive).
- **Иконка = FRAME с дочерним VECTOR; `get_node_info` НЕ возвращает этот вектор** (children:[], видна
  только скрытая заливка самого фрейма; на сам VECTOR `get_node_info` отдаёт ПУСТО). Чтобы покрасить
  иконку — берём id вектора через `scan_nodes_by_types(node, ["VECTOR"])` и биндим. Практика:
  vector.id = icon-frame.id + 1 (вектор создаётся сразу после фрейма). Габарит вектора в bbox:
  Large-иконка x≈8, M/S-иконка x≈6.
- **🎨🎨 Вектор красить ЦЕЛИКОМ: и `fills`, И `strokes`.** У иконки-вектора может быть и заливка, и
  обводка (у play-треугольника — есть). Покрасил только `fills` → остаётся чужой контур (грабля, ловил
  дважды на Button). Когда задача «перекрасить иконку в цвет текста» — биндить оба поля к той же
  переменной. ИСКЛЮЧЕНИЕ: если по задаче нужно покрасить частично (двухцветная иконка, контур отдельно
  от заливки) — тогда осознанно только нужное поле. По умолчанию (одноцветная иконка) — всё.
- **Пересобрал вариант клоном — не забудь перепривязать ВСЁ, что должно измениться:** и заливку фрейма,
  и текст лейбла, и иконку. Клон наследует цвета исходного варианта. (Ловил: Primary Destructive пересобрал из
  Primary Default, фон покрасил в красный, а лейбл остался тёмным `accent/on` вместо белого.)
- **⚠️ `get_node_info` НЕ сериализует `layoutMode`/`padding`/`itemSpacing`** — всегда возвращает `None`,
  даже на заведомо auto-layout узле (проверено на доске Colors). НЕ верь этому чтению. Проверяй
  auto-layout иначе: успешный `set_padding`/`set_layout_sizing` (падают с ошибкой, если не auto-layout),
  либо экспортом. `absoluteBoundingBox` (w/h) читается корректно.
- **`set_layout_mode` — ПЕРВЫМ и ОТДЕЛЬНО от `set_layout_sizing`.** В одном параллельном батче sizing
  может выполниться раньше mode → ошибка «HUG only valid on auto-layout». Порядок: (1) set_layout_mode
  HORIZONTAL → (2) set_padding → (3) set_item_spacing → (4) set_axis_align CENTER/CENTER →
  (5) set_layout_sizing HUG/FIXED. Высота при этом сохраняется (FIXED), post-resize не нужен.
- **Рецепт кнопки-auto-layout (HUG ширина, FIXED высота):** Large padX=18 gap=4 h52 · Medium padX=12
  gap=4 h36 · Small padX=10 gap=3 h30. Контент (icon+label) центрируется, порядок детей = порядок слева.
- **Массовые однотипные правки (десятки узлов) — разовым bun-скриптом** на ОДНОМ WS-соединении
  (`tools/autolayout.ts`, `build_iconbtn.ts` как образцы: join → цикл `send(command, params)` с await),
  а не сотней tool-вызовов. Быстрее и без гонок. Канал передаём аргументом.
- **Плагин доработан (нужен reload после правки code.js, билд НЕ нужен — manifest.main=code.js напрямую):**
  - `filterFigmaNode` теперь отдаёт `layoutMode`/padding/sizing/align/itemSpacing/strokeWeight/`visible`/
    `boundVariables`/`componentPropertyDefinitions` и НЕ режет VECTOR (иконки-векторы видны).
  - Добавлены `delete_component_property` / `edit_component_property` (rename/default). Вызывать через
    figma-cmd (в MCP-сервер не заводил). editComponentProperty при rename сам обновляет ссылки слоёв.
- **Умный компонент — свойства и ссылки:**
  - `add_component_property` на СЕТ (BOOLEAN/TEXT/INSTANCE_SWAP). Имя-коллизия → Figma добавит суффикс
    («Label» занят → станет «Label2»); чистим через delete/edit.
  - `set_component_property_reference` (visible/characters/mainComponent) — ссылка хранится PER-СЛОЙ,
    т.е. привязывать надо в КАЖДОМ варианте (36×), не один раз. Скриптом.
  - Проверка тумблеров: создать INSTANCE, `set_instance_properties {"Show icon": false}`, экспорт.
- **Клон варианта, вынесенный из сета (`set_parent` в др. фрейм), тащит висячие ссылки на свойства
  старого сета** (безвредно рендерятся, но мусор). Имя меняется на «Set/Prop/Prop» (слэши) —
  переименовать обратно в «Prop=Value, …» перед `combine_as_variants`.
- **`combine_as_variants` делает фрейм сета крошечным (по размеру одного варианта)** и складывает
  варианты стопкой — после combine `resize_node` сет + разложить варианты сеткой (move_node).
- **Экспорт узла пустой?** Проверь, не выходит ли он за границы клипающего родителя (клон уехал за холдер
  → пустой PNG). Сам по себе export ноды рендерит контент, но клип родителя может обрезать.
- **Текст в кнопке выглядит ниже центра** — это метрики шрифта (leading снизу под descender), не наша
  ошибка. Фикс: **`leadingTrim = "CAP_HEIGHT"`** на текст-слое/стиле — обрезает leading до cap-height→
  baseline, и центрирование авто-лейаута ставит буквы в оптический центр. Иконку не трогает, паддинги
  кнопки не трогает, число подбирать не надо. Добавлено в `set_text_properties` плагина (поле
  `leadingTrim`: "CAP_HEIGHT"|"NONE"). Лучше ставить на текст-СТИЛЬ кнопки — разойдётся по всем лейблам.
  НЕ решать это ручными асимметричными паддингами/обёрткой (ломается при смене шрифта).
- **📐 Constraints (поведение слоя при ресайзе РОДИТЕЛЯ)** — `set_constraints(nodeId, horizontal, vertical)`
  значения MIN/CENTER/MAX/STRETCH/SCALE. `get_node_info` теперь отдаёт `constraints` (дописано в плагин).
  Когда что:
  - **Вектор/глиф внутри иконки-фрейма → SCALE+SCALE** (пропорционально с фреймом).
  - **Крестик/кнопка в углу модалки → MAX(гориз)+MIN(верт)** = Right+Top (остаётся в углу при ресайзе).
  - **Глиф по центру, не масштабируется → CENTER+CENTER.**
  - **Разделитель на всю ширину → STRETCH(гориз).**  · Дефолт (в потоке) → MIN+MIN (Left+Top).
- **⚠️ `resize_node` = `node.resize()` — масштабирует геометрию по SCALE-констрейнту, но НЕ толщину
  обводки** (strokeWeight остаётся абсолютным). Stroke-иконка (спиннер, тонкий контур) при уменьшении
  выглядит «толсто». Решения: (а) держать фикс-размер как в коде (спиннер всегда 22, как `<Spinner size=22>`);
  (б) `rescale_node` (в плагине, `node.rescale(factor)`) — масштабирует ВСЁ, включая stroke. Для иконок с
  обводкой при смене размера — использовать rescale, а не resize.
- **⚠️ `rescale_node` на варианте с токенами — ОТВЯЗЫВАЕТ переменные** (высота, радиус, паддинги) и
  выбивает текст из стиля (16→16.48). Для состояний «кнопка растёт при нажатии» (scale 1.03/1.12) вариант
  НЕ масштабировать: геометрия остаётся на токенах, движение — аннотацией на сете. rescale — только для
  иконок/векторов без токенов.
- **Boolean-свойство показывает/прячет только СЛОЙ, не эффект.** Нужна переключаемая обводка/тень
  (хайрлайн) → отдельный слой поверх (абсолютный, STRETCH, `remove_fill`, stroke Inside на переменной) и
  `set_component_property_reference field=visible`. Образец: `tools/build_hairline.ts`.
- **⚠️ `create_svg` (createNodeFromSvg) теряет `stroke-dashoffset`** → дуга на dash становится полным
  кольцом. Незамкнутые дуги рисовать явным путём `A rx ry 0 0 1 x y`, не dasharray. После импорта —
  ВСЕГДА экспорт картинкой и сверка глазами. Образец: `tools/fix_spinner_arc.ts`.
- **`create_svg` теряет `<rect>` с `shape-rendering`** (компонент выходит пустым) → полосы/прямоугольники
  переписывать в `<path d="M.. H.. V.. Z">`. Проверять экспортом каждую новую иконку.
- **Иконка/спиннер в компоненте — только ЭКЗЕМПЛЯР мастера**, не копия-фрейм. Разные толщины обводки на
  разных размерах → сет вариантов `Size=…` (мастер 24 → клон `rescale` → combine), а не resize экземпляра.
- **INSTANCE_SWAP без preferredValues показывает ВСЕ компоненты файла** → всегда задавать список
  (`edit_component_property preferredValues=[{type:"COMPONENT",key}]`, ключи — из `get_local_components`).
- **Клон текста наследует фикс-ширину исходника** → после клона `resize_node` под контейнер +
  `textAutoResize: HEIGHT`, иначе текст режется в одну строку или вылезает за секцию.
- **⚠️ Тариф Figma — 1 мод на коллекцию** (`add_variable_mode` → «Limited to 1 modes only»; мост отдаёт `{}`
  без ошибки в --raw — проверять `get_variables`). Тонировку через моды НЕ планировать.
- **Свап иконки держит цвет, только если у всех иконок одинаковая структура:** один залитый слой «Vector».
  Обводки → outline, части → flatten. Образец: `tools/icons_rebuild_outline.ts`.
- **⚠️ `outline_stroke` кладёт результат на СТРАНИЦУ (не рядом с исходником)** — сразу `set_parent` обратно в
  родителя (x,y из результата = локальные). Удаление исходника до этого = пустая иконка. После — проверять
  страницу на «сирот» (`get_node_info 0:1`, узлы не SECTION/FRAME).
- **Обводки внутри `<g>` при outline съезжают** → перед импортом переносить атрибуты `<g>` на каждый path.
- **Пересборка мастера сбрасывает overrides уже стоящих экземпляров этой иконки** (id слоя новый) — проверять
  свап на свежем экземпляре.
- **⚠️ Клон варианта ВНУТРИ сета теряет ссылки свойств** (Label/Icon/Show icon/Hairline) — в Pressed пропадал
  выбор иконки, у Glass не менялась подпись. После ЛЮБЫХ клонов — финальный проход `tools/relink_props.ts`
  и тест на экземпляре (подпись + свап иконки + булевы).
- **Привязка экземпляра к INSTANCE_SWAP ставит дефолт свойства** — вариант с фиксированной иконкой (Selected →
  check) НЕ привязывать.
- **Свойство показывается в панели, только если в выбранном варианте есть связанный слой** → «тумблер только у
  Glass» = слой Hairline только в Glass-вариантах.
- **⚠️ Секция, выросшая поверх соседней, ЗАГЛАТЫВАЕТ её (вложенная SECTION).** Перед ресайзом/переносом — отвести
  соседей в сторону; после — проверить, что у секций нет вложенных SECTION (`tools/restack_sections.ts`).
- Loading/Done в пилюле: контент НЕ удалять — opacity 0 + абсолютный спиннер CENTER/CENTER (ширина живая).
- **Булево свойство не меняет заливку/эффекты** — «стекло тумблером» невозможно; стекло = отдельный сет-копия.
- **Копия сета (клон секции) тащит прототип в ОРИГИНАЛ** — после клона переставить реакции (`pressLink` в
  `tools/buttons_v3_extras.ts`) и перепривязать свойства (`tools/relink_props.ts`).
- Раскладка секций — только `tools/order_sections.ts` (сначала всех в сторону, потом по местам) + `tools/fit_sections.ts`.
- **zsh не делит `$VAR` по пробелам** — список id в аргументы передавать `${=VAR}` или прямо текстом.
- **Ширину даёт строук:** фреймы кнопок сейчас НЕ auto-layout (`layoutMode=None`, фикс-ширина). Лишний
  `stroke` (даже тонкий) расширяет absoluteBoundingBox на ~2px/сторону → рассинхрон ширин (был у старого
  Destructive: 123 vs 121). Мост НЕ умеет снимать строук → пересобираем узел клоном из чистого варианта.

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
                      WeeklyProgress(Streak) · MuscleIcon · PlacePickerModal · ProgramEmblem · WaterChrome
   (Ранги/лиги/XP/редкость/награды/рейтинг — ОТКАЗ, не переносим.)
🏋️ Patterns:  композиции из компонентов (см. список выше).
```
Инвентарь компонентов, что ✓ есть / ⚠ пробел, и правила токенов — в скиле **trpg-ds-review**
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

### 📌 Состояние на 16.09.2026 (актуальный перезапуск переноса)
**Страницы файла** (8, созданы): `📕 Cover` `1:2` · `🎨 Foundations` `1:3` · `🧩 Components` `0:1` ·
`🏋️ Patterns` `4:24` · `📱 Screens` `4:22` · `🧪 Research` `20:7` · `🔬 Experiments` `20:8` · `🗄️ Archive` `4:26`.
У Дмитрия уже есть НАРАБОТКИ (не трогать!): 167 компонентов, включая большой Button-набор в стиле
Apple (`Size × Style{Borderless/Bordered/Bordered-Secondary/Bordered-Prominent} × Label Type × Enabled ×
Destructive`, id `75:851…75:1186`), TabBar (`87:32xx`), иконки play/finish/check/plus (`55:183…186`).
Своё строим В НОВЫХ фреймах, наработки Дмитрий сам сравнит.

**Переменные — коллекции (в основном заведены Дмитрием, выверено с кодом):**
- `Primitives` (mode `21:0`) — 17 цветов, 1:1 с кодом. ОК.
- `Semantic` (mode `24:1`) — базовая семантика + сегодня ДОБАВЛЕНО: `surface/disabled`(177:731),
  `text/disabled`(732), `border/tonal`(733, белый 8%), `surface/tonal`(734), `text/tonal`(735),
  `timer`(736), `accent/soft`(737), `accent/strong`(738), `error/soft`(739), `error/strong`(740),
  `surface/glass`(741). Альфа записалась верно.
- `Spacing` (mode `29:2`) — 12 шт, ОК. `Radius` (mode `29:3`) — +`radius/day-card`(742)=40,
  `radius/day-thumb`(743)=24. `Blur`(mode `43:2`), `Motion`(mode `43:3`) — ОК.
- `Size` (mode `43:1`) — ПОПРАВЛЕНО: `btn/height` 56→**52**, `btn/height-sm` 48→**36**,
  +`btn/height-xs`(177:730)=**30**.
- **НА РУЧНОЕ УДАЛЕНИЕ юзером** (мост переменные не удаляет): `Semantic → status/success`(24:75),
  `status/info`(24:76), `note/Color`(50:78); `Size → icon/md 2`(43:59), `icon/sm 2`(43:60),
  `blur/sm`(43:65), `blur/md`(43:64) (дубли — они есть в коллекции Blur).

**Стили:** 9 текст-стилей (Display/Heading/Title/Body/Label/Caption/Button lg/Button sm,md/Page Title)
+ сегодня `Hero`(Geist 40/800). Эффект-стили теней: `Shadow/Dock`,`Shadow/Raised`,`Shadow/Modal`.
Сетка `Mobile/390`. Цвет-стилей нет (правильно — цвет через Variables).

**Foundation ГОТОВ (16.09.2026)** — свежая секция `🎨 Foundations · Design System` (frame `180:751`
на странице Foundations, ниже наработки): 8 досок Colors(61 свотч)/Typography(9 ролей)/Spacing(12)/
Radius(7)/Elevation(3)/Motion(5)/Grid(390)/Icons(41). ВСЁ на переменных (bind fills/cornerRadius/height)
+ текст-стилях + эффект-стилях. Свотчи/подписи — цвет через переменные, шрифт через стиль.
Базовая «золотая» кнопка Primary/Large — `181:759` (на странице Components, y≈10000).

**Button — СМАРТ-КОМПОНЕНТ СОБРАН (Large, 16.09.2026):** Component Set `Button` = `194:1117`
(страница Components, y≈10000). 5 вариантов Large: Primary `194:1112` · Primary-tonal `194:1113` ·
Secondary `194:1114` · Tertiary `194:1115` · Destructive `194:1116`. Свойства: **Variant** (variant-ось) ·
**Icon** BOOLEAN off (`Icon#194:0`, привязан к visible иконок) · **Label** TEXT «Начать» (`Label#194:6`,
привязан к characters). Всё на переменных: Primary fill accent/base+text accent/on; Tonal surface/tonal+
text/tonal; Secondary surface/raised+border/hairline+text/primary; Tertiary без фона+text/secondary;
Destructive error/soft+error/strong border+status/error. **РАЗМЕРЫ ДОБАВЛЕНЫ:** Variant(5)×Size(3)=15
вариантов (Large h52/pad18/Button lg · Medium h36/pad12/Button sm,md · Small h30/pad10/gap3). Все 15
привязаны к Icon#194:0 (visible) + Label#194:6 (characters). Флоу добавления размеров: клонировать
anchor-фрейм → подогнать fill/text/border(figma-cmd remove_fill для Tertiary) → create_component_from_node
→ set_parent в сет `194:1117` → find_nodes icon/Label → set_component_property_reference на новые.
**COMPONENTS СОБРАНЫ (16.09.2026)** — на странице Components секции стопкой (x≈-64, y от 9860):
🔘 Button (сет `194:1117`, section `195:1164`) · ⭕ Icon Button (сет `197:1183`, section `197:1184`) ·
⌨️ Input (`197:1187`, Default/Focus/Filled) · 🏷️ Tag (`197:1196`, 5 категорий) · 🗂️ Card (`197:1209`) ·
📲 TabBar (`197:1217`, 3 таба актив/неактив) · 🪟 Modal (`197:1233`, confirm+Shadow/Modal) ·
🔔 Toast (`197:1244`, success+Shadow/Raised). Все на переменных + текст/эффект-стилях, каждый в
секции с заголовком+описанием. Грабля: у Component Set после add-variants/set_parent рамка не
растёт — `resize_node` вручную, иначе строки вариантов клипаются.
**Дальше:** опц. Boolean Border/State=Disabled на Button; ещё компоненты (Progress, List row, Switch,
Segmented) → Patterns → Screens → **обложка** (скрин главной с localhost через Playwright).

### История (прошлые сессии, node IDs могли устареть после пересборки страниц)
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
  Нарисована ПОЛНАЯ матрица 24 (Default+Disabled+Loading × Large+Medium × 4 варианта): ряды Default
  `65:354`/`66:364`, Disabled `70:382`/`70:392`, Loading `70:402`/`70:412` (Loading = заливка варианта +
  спиннер-кольцо, БЕЗ текста, FIXED-ширина). Disabled = единый muted под все варианты. Осталось: собрать
  Component Set (выделить 24 → Create component set → свойства variant/size/state).
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
