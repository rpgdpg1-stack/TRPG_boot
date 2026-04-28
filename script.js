const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; 
const GID_EX = '0';          

const tg = window.Telegram.WebApp;
let exercisesLibrary = []; 
let workoutPlan = [];      
let completedIds = [];
let currentDay = 'A';

async function init() {
    tg.expand();
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    await loadFullData();
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));
    return json.table.rows;
}

async function loadFullData() {
    try {
        console.log("Загрузка данных...");
        const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);

        // 1. Собираем библиотеку (Лист exercises)
        exercisesLibrary = exRows.filter(r => r.c[0]?.v).map(row => ({
            id: row.c[0]?.v,
            name: row.c[1]?.v || "Упражнение",
            sub: String(row.c[3]?.v || "").trim().toLowerCase(), // Чистим подгруппу
            type: String(row.c[4]?.v || "base").toLowerCase(),
            meta: row.c[6]?.v || "",
            priority: parseInt(row.c[8]?.v) || 99,
            img: row.c[9]?.v || ""
        }));

        // 2. Собираем план (Лист program_days)
        workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
            const dayFromSheet = String(row.c[2]?.v || "").trim().toUpperCase();
            const subFromSheet = String(row.c[6]?.v || "").trim().toLowerCase(); //
            
            // Фильтруем замены по подгруппе и приоритету
            const alts = exercisesLibrary
                .filter(ex => ex.sub === subFromSheet)
                .sort((a, b) => a.priority - b.priority);

            return {
                rowId: 'row-' + idx,
                day: dayFromSheet,
                type: String(row.c[4]?.v || "base").toLowerCase(),
                main: alts[0] || { name: "Не найдено: " + subFromSheet, sub: subFromSheet },
                alternatives: alts.slice(1)
            };
        });

        console.log("План загружен:", workoutPlan);
        render();
    } catch (e) {
        console.error("Ошибка загрузки:", e);
    }
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = workoutPlan.filter(item => item.day === currentDay);
    
    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; padding:20px;">Нет упражнений для дня ${currentDay}</p>`;
        return;
    }

    let html = '';
    const sections = ['base', 'isolation', 'accessory'];

    sections.forEach(sec => {
        const secEx = filtered.filter(item => item.type === sec);
        if (secEx.length > 0) {
            html += `<div class="section-title">${sec}</div>`;
            secEx.forEach(item => {
                const ex = item.main;
                const isDone = completedIds.includes(item.rowId);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" id="${item.rowId}">
                        <div class="img-box" onclick="toggleCard('${item.rowId}')">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150?text=GYM'">
                        </div>
                        <div class="info" onclick="toggleCard('${item.rowId}')">
                            <div class="cat-label">${item.main.sub}</div>
                            <div class="name">${ex.name}</div>
                            <div class="meta">${ex.meta}</div>
                        </div>
                        <div class="side-controls">
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
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
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
