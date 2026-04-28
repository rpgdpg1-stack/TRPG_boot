// ЗАМЕНИ SHEET_ID и убедись, что GID совпадает с листом program_days
const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID = '1002309655'; // Открой лист program_days и скопируй цифры после gid= из URL
const G_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}`;

const tg = window.Telegram.WebApp;
let exercises = [];
let completedIds = [];
let currentDay = 'A';

async function init() {
    tg.expand();
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    await loadData();
}

async function loadData() {
    try {
        const res = await fetch(G_URL);
        const text = await res.text();
        const json = JSON.parse(text.substring(47).slice(0, -2));
        
        // Мапим по скриншоту листа program_days
        exercises = json.table.rows.map((row, idx) => ({
            id: 'ex-' + idx,
            day: row.c[2]?.v || 'A',       // Колонка C: day
            type: row.c[4]?.v || 'base',   // Колонка E: type
            muscle: row.c[5]?.v || '',     // Колонка F: muscle_group
            sub: row.c[6]?.v || '',        // Колонка G: sub_group
            // Название и мета-данные пока берем заглушкой, так как они в другом листе
            // Или добавь их в этот лист в колонки H, I, J
            name: "Упражнение", 
            meta: "3 x 8-10",
            weight: 0,
            img: "" 
        }));

        render();
    } catch (e) {
        console.error("Ошибка:", e);
    }
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = exercises.filter(ex => ex.day === currentDay);
    
    let html = '';
    const sections = ['base', 'isolation', 'accessory']; // Типы как на скриншоте

    sections.forEach(sec => {
        const secEx = filtered.filter(ex => ex.type === sec);
        if (secEx.length > 0) {
            html += `<div class="section-title">${sec}</div>`;
            secEx.forEach(ex => {
                const isDone = completedIds.includes(ex.id);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" id="${ex.id}" onclick="toggleCard('${ex.id}')">
                        <div class="img-box">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150?text=${ex.muscle}'">
                        </div>
                        <div class="info">
                            <div class="cat-label">${ex.muscle} (${ex.sub})</div>
                            <div class="name">${ex.name}</div>
                            <div class="meta">${ex.meta}</div>
                        </div>
                        <div class="weight-control" onclick="event.stopPropagation()">
                            <input type="number" class="weight-val" value="${ex.weight}">
                            <div class="weight-unit">KG</div>
                        </div>
                    </div>
                `;
            });
        }
    });

    list.innerHTML = html || `<p style="text-align:center; margin-top:20px;">Нет данных для дня ${currentDay}</p>`;
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
    const dayEx = exercises.filter(ex => ex.day === currentDay);
    const total = dayEx.length;
    const done = dayEx.filter(ex => completedIds.includes(ex.id)).length;
    const perc = total > 0 ? (done / total) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${total} DONE`;
}

init();
