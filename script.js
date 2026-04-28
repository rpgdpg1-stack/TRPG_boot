const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; 
const GID_EX = '0';          

// Защита: проверяем наличие Telegram WebApp
const tg = window.Telegram?.WebApp;

let exercisesLibrary = []; 
let workoutPlan = [];      
let completedIds = [];
let currentDay = 'A';

async function init() {
    if (tg) {
        tg.expand();
        tg.ready();
    }
    await loadFullData();
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

async function loadFullData() {
    const container = document.getElementById('exercise-list');
    try {
        const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);

        // 1. Собираем библиотеку упражнений
        exercisesLibrary = exRows.filter(r => r.c[0]?.v).map(row => ({
            id: row.c[0]?.v,
            name: row.c[1]?.v || "Упражнение",
            muscle: row.c[2]?.v || "",
            sub: String(row.c[3]?.v || "").trim().toLowerCase(), // Колонка D: sub_group
            type: String(row.c[4]?.v || "base").toLowerCase(),
            meta: row.c[6]?.v || "",
            priority: parseInt(row.c[8]?.v) || 99, // Колонка I: Priority
            img: row.c[9]?.v || "" // Колонка J: preview
        }));

        // 2. Собираем план тренировки
        workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
            const subGroup = String(row.c[6]?.v || "").trim().toLowerCase(); // Колонка G: sub_group
            const day = String(row.c[2]?.v || 'A').toUpperCase();

            // Ищем все упражнения для этой подгруппы и сортируем по приоритету
            const alts = exercisesLibrary
                .filter(ex => ex.sub === subGroup)
                .sort((a, b) => a.priority - b.priority);

            return {
                rowId: 'row-' + idx,
                day: day,
                type: String(row.c[4]?.v || 'base').toLowerCase(),
                main: alts[0] || { name: "Не найдено: " + subGroup, muscle: "Error" },
                alternatives: alts.slice(1)
            };
        });

        render();
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div style="color:red; padding:20px;">Ошибка: ${e.message}</div>`;
    }
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = workoutPlan.filter(item => item.day === currentDay);
    
    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; padding:50px;">Нет упражнений для дня ${currentDay}</p>`;
        return;
    }

    let html = '';
    const sections = ['base', 'isolation', 'accessory'];

    sections.forEach(sec => {
        const items = filtered.filter(it => it.type === sec);
        if (items.length > 0) {
            html += `<div class="section-title">${sec}</div>`;
            items.forEach(item => {
                const ex = item.main;
                const isDone = completedIds.includes(item.rowId);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" onclick="toggleCard('${item.rowId}')">
                        <div class="img-box">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150?text=GYM'">
                        </div>
                        <div class="info">
                            <div class="cat-label">${ex.muscle} (${item.main.sub})</div>
                            <div class="name">${ex.name}</div>
                            <div class="meta">${ex.meta}</div>
                        </div>
                        <div class="side-controls" onclick="event.stopPropagation()">
                            <button class="replace-btn" onclick="showAlternatives('${item.rowId}')">🔄</button>
                            <div class="weight-control">
                                <input type="number" class="weight-val" placeholder="0">
                            </div>
                        </div>
                    </div>`;
            });
        }
    });
    list.innerHTML = html;
    updateProgress();
}

function showAlternatives(rowId) {
    const item = workoutPlan.find(p => p.rowId === rowId);
    if (item && item.alternatives.length > 0) {
        const current = item.main;
        item.main = item.alternatives.shift();
        item.alternatives.push(current);
        render();
    }
}

function toggleCard(id) {
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
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

// Запуск после полной загрузки страницы
window.addEventListener('load', init);
