const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const G_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

const tg = window.Telegram.WebApp;
let exercises = [];
let completedIds = [];
let currentDay = 'A';

async function init() {
    tg.expand();
    // Грузим прогресс из локального хранилища (пока без облака для простоты)
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    
    await loadData();
}

async function loadData() {
    try {
        const res = await fetch(G_URL);
        const text = await res.text();
        const json = JSON.parse(text.substr(47).slice(0, -2));
        
        exercises = json.table.rows.map((row, idx) => ({
            id: 'ex-' + idx,
            type: row.c[2]?.v, // База / Изоляция
            day: row.c[1]?.v,
            name: row.c[4]?.v,
            muscle: row.c[5]?.v,
            meta: row.c[7]?.v,
            weight: row.c[8]?.v || 0,
            img: row.c[9]?.v // Ссылка на Selectel
        }));

        render();
    } catch (e) {
        console.error("Ошибка данных:", e);
    }
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = exercises.filter(ex => ex.day === currentDay);
    
    let html = '';
    // Группировка по типам
    const types = ['БАЗА', 'ИЗОЛЯЦИЯ'];
    
    types.forEach(type => {
        const typeEx = filtered.filter(ex => ex.type?.toUpperCase() === type);
        if (typeEx.length > 0) {
            html += `<div class="section-title">${type}</div>`;
            typeEx.forEach(ex => {
                const isDone = completedIds.includes(ex.id);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" id="${ex.id}" onclick="toggleCard('${ex.id}')">
                        <div class="img-box">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150'">
                        </div>
                        <div class="info">
                            <div class="cat-label">${ex.muscle}</div>
                            <div class="name">${ex.name}</div>
                            <div class="meta">${ex.meta}</div>
                        </div>
                        <div class="weight-control" onclick="event.stopPropagation()">
                            <input type="number" class="weight-val" value="${ex.weight}" onchange="saveWeight('${ex.id}', this.value)">
                            <div class="weight-unit">KG</div>
                        </div>
                    </div>
                `;
            });
        }
    });

    list.innerHTML = html;
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
    const total = exercises.filter(ex => ex.day === currentDay).length;
    const done = completedIds.filter(id => {
        return exercises.find(ex => ex.id === id && ex.day === currentDay);
    }).length;
    
    const perc = total > 0 ? (done / total) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${total} DONE`;
}

function finishWorkout() {
    document.getElementById('modal-congrats').classList.remove('hidden');
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function closeModal() {
    document.getElementById('modal-congrats').classList.add('hidden');
    completedIds = [];
    localStorage.removeItem('completed_exercises');
    render();
}

init();
