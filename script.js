const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; // ТВОЙ GID листа program_days
const GID_EX = '0';          // ТВОЙ GID листа exercises

const tg = window.Telegram.WebApp;
let exercisesLibrary = {}; // Тут будут названия и картинки
let workoutPlan = [];      // Тут будет план на день
let completedIds = [];
let currentDay = 'A';

async function init() {
    tg.expand();
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    await loadFullData();
}

// Функция для получения данных из конкретного листа
async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

async function loadFullData() {
    try {
        // 1. Загружаем библиотеку упражнений (имена, картинки)
        const exRows = await fetchSheet(GID_EX);
        exRows.forEach(row => {
            const id = row.c[0]?.v;
            if (id) {
                exercisesLibrary[id] = {
                    name: row.c[1]?.v || "Упражнение",
                    muscle: row.c[2]?.v || "",
                    meta: row.c[6]?.v || "", // meta_info
                    img: row.c[9]?.v || ""   // preview
                };
            }
        });

        // 2. Загружаем план (какое упражнение в какой день)
        const dayRows = await fetchSheet(GID_DAYS);
        workoutPlan = dayRows.map((row, idx) => {
            const exIdInPlan = row.c[1]?.v; // Колонка program_id или ex_id
            const details = exercisesLibrary[exIdInPlan] || {};
            
            return {
                id: 'row-' + idx,
                day: row.c[2]?.v || 'A',
                type: row.c[4]?.v || 'base',
                muscle: details.muscle || row.c[5]?.v || '',
                name: details.name || "Неизвестно",
                meta: details.meta || "3x10",
                img: details.img || ""
            };
        });

        render();
    } catch (e) {
        console.error("Ошибка загрузки:", e);
    }
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = workoutPlan.filter(ex => ex.day === currentDay);
    
    let html = '';
    const sections = ['base', 'isolation', 'accessory'];

    sections.forEach(sec => {
        const secEx = filtered.filter(ex => ex.type === sec);
        if (secEx.length > 0) {
            html += `<div class="section-title">${sec.toUpperCase()}</div>`;
            secEx.forEach(ex => {
                const isDone = completedIds.includes(ex.id);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" id="${ex.id}" onclick="toggleCard('${ex.id}')">
                        <div class="img-box">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150?text=FIT'">
                        </div>
                        <div class="info">
                            <div class="cat-label">${ex.muscle}</div>
                            <div class="name">${ex.name}</div>
                            <div class="meta">${ex.meta}</div>
                        </div>
                        <div class="weight-control" onclick="event.stopPropagation()">
                            <input type="number" class="weight-val" placeholder="0">
                            <div class="weight-unit">KG</div>
                        </div>
                    </div>
                `;
            });
        }
    });

    list.innerHTML = html || `<p style="color:gray; text-align:center; padding:20px;">Нет данных для дня ${currentDay}</p>`;
    updateProgress();
}

function toggleCard(id) {
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    document.getElementById(id).classList.toggle('done');
    updateProgress();
}

function updateProgress() {
    const dayEx = workoutPlan.filter(ex => ex.day === currentDay);
    const total = dayEx.length;
    const done = dayEx.filter(ex => completedIds.includes(ex.id)).length;
    const perc = total > 0 ? (done / total) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${total} DONE`;
}

init();
