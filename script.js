const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; // ТВОЙ GID листа program_days
const GID_EX = '0';          // ТВОЙ GID листа exercises

const tg = window.Telegram.WebApp;
let exercisesLibrary = []; 
let workoutPlan = [];      
let completedIds = [];
let currentDay = 'A';

async function init() {
    tg.expand();
    tg.ready();
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    await loadFullData();
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    // Очистка JSON-ответа от Google
    const jsonText = text.substring(47).slice(0, -2);
    return JSON.parse(jsonText).table.rows;
}

async function loadFullData() {
    try {
        // 1. Загружаем библиотеку упражнений
        const exRows = await fetchSheet(GID_EX);
        exercisesLibrary = exRows.map(row => {
            const c = row.c;
            return {
                id: c[0]?.v,
                name: c[1]?.v || "Упражнение",
                muscle: c[2]?.v || "",
                sub: c[3]?.v || "", // sub_group
                type: c[4]?.v || "base",
                meta: c[6]?.v || "", // meta_info
                priority: parseInt(c[8]?.v) || 99, // Priority
                img: c[9]?.v || "" // preview
            };
        });

        // 2. Загружаем план и фильтруем по подгруппам с учетом приоритета
        const dayRows = await fetchSheet(GID_DAYS);
        workoutPlan = dayRows.map((row, idx) => {
            const c = row.c;
            const subGroup = c[6]?.v; // sub_group в листе program_days
            const day = String(c[2]?.v || 'A').toUpperCase();

            // Берем все упражнения из этой подгруппы и сортируем по приоритету
            const alternatives = exercisesLibrary
                .filter(ex => ex.sub === subGroup)
                .sort((a, b) => a.priority - b.priority);

            return {
                rowId: 'row-' + idx,
                day: day,
                type: (c[4]?.v || 'base').toLowerCase(),
                sub: subGroup,
                main: alternatives[0] || { name: "Упражнение не найдено", muscle: subGroup },
                alternatives: alternatives.slice(1)
            };
        });

        render();
    } catch (e) {
        console.error("Критическая ошибка:", e);
        document.getElementById('exercise-list').innerHTML = `<p style="color:red; text-align:center;">Ошибка загрузки. Проверь GID!</p>`;
    }
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = workoutPlan.filter(item => item.day === currentDay);
    
    let html = '';
    const sections = ['base', 'isolation', 'accessory'];

    sections.forEach(sec => {
        const secEx = filtered.filter(item => item.type === sec);
        if (secEx.length > 0) {
            html += `<div class="section-title">${sec.toUpperCase()}</div>`;
            secEx.forEach(item => {
                const ex = item.main;
                const isDone = completedIds.includes(item.rowId);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" id="${item.rowId}">
                        <div class="img-box" onclick="toggleCard('${item.rowId}')">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150?text=FIT'">
                        </div>
                        <div class="info" onclick="toggleCard('${item.rowId}')">
                            <div class="cat-label">${ex.muscle} (${item.sub})</div>
                            <div class="name">${ex.name}</div>
                            <div class="meta">${ex.meta}</div>
                        </div>
                        <div class="side-controls">
                            <button class="replace-btn" onclick="showAlternatives('${item.rowId}')">🔄</button>
                            <div class="weight-control">
                                <input type="number" class="weight-val" placeholder="0">
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    });

    list.innerHTML = html || `<p style="text-align:center; color:gray;">План пуст</p>`;
    updateProgress();
}

function showAlternatives(rowId) {
    const item = workoutPlan.find(p => p.rowId === rowId);
    if (item && item.alternatives.length > 0) {
        // Циклическая замена: текущее в конец, первое из альтернатив — в основу
        const oldMain = item.main;
        item.main = item.alternatives.shift();
        item.alternatives.push(oldMain);
        render();
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }
}

function toggleCard(id) {
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    render();
}

function updateProgress() {
    const dayEx = workoutPlan.filter(ex => ex.day === currentDay);
    const done = dayEx.filter(ex => completedIds.includes(ex.rowId)).length;
    const perc = dayEx.length > 0 ? (done / dayEx.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${dayEx.length} DONE`;
}

init();
