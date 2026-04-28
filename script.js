const tg = window.Telegram.WebApp;
const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk'; // Замени на свой
const G_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let exercises = [];
let completedIds = [];

// Инициализация ТГ
tg.expand();
tg.ready();

async function init() {
    // 1. Грузим прогресс из облака ТГ
    tg.CloudStorage.getItem('completed_ids', (err, value) => {
        if (value) completedIds = JSON.parse(value);
        loadTable();
    });
}

async function loadTable() {
    try {
        const response = await fetch(G_URL);
        const text = await response.text();
        const json = JSON.parse(text.substr(47).slice(0, -2));
        
        exercises = json.table.rows.map((row, index) => ({
            id: index,
            program: row.c[0]?.v,
            day: row.c[1]?.v,
            category: row.c[2]?.v,
            name: row.c[4]?.v,
            muscle: row.c[5]?.v,
            sub: row.c[6]?.v || '',
            meta: row.c[7]?.v,
            weight: row.c[8]?.v || 0,
            img: row.c[9]?.v // Ссылка на Selectel
        }));

        renderExercises('A'); // По умолчанию День А
    } catch (e) {
        console.error("Ошибка загрузки таблицы", e);
    }
}

function renderExercises(day) {
    const list = document.getElementById('exercise-list');
    list.innerHTML = '';
    
    const filtered = exercises.filter(ex => ex.day === day);
    
    filtered.forEach(ex => {
        const isDone = completedIds.includes(ex.id);
        const card = document.createElement('div');
        card.className = `exercise-card ${isDone ? 'completed' : ''}`;
        card.onclick = () => toggleComplete(ex.id);
        
        card.innerHTML = `
            <img src="${ex.img}" class="ex-image">
            <div class="ex-info">
                <div class="ex-muscle">${ex.muscle} <span class="ex-subgroup">(${ex.sub})</span></div>
                <div class="ex-name">${ex.name}</div>
                <div class="ex-meta">${ex.meta}</div>
            </div>
            <div class="ex-stats">
                <div class="ex-weight">${ex.weight}</div>
                <div class="ex-unit">KG</div>
            </div>
            <div class="btn-info">i</div>
        `;
        list.appendChild(card);
    });
    updateProgress();
}

function toggleComplete(id) {
    tg.HapticFeedback.impactOccurred('medium');
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
    }
    
    // Сохраняем в ТГ
    tg.CloudStorage.setItem('completed_ids', JSON.stringify(completedIds));
    renderExercises(document.getElementById('current-day-label').innerText);
}

function updateProgress() {
    const total = exercises.filter(ex => ex.day === document.getElementById('current-day-label').innerText).length;
    const done = completedIds.length;
    const percent = total > 0 ? (done / total) * 100 : 0;
    
    document.getElementById('progress-fill').style.width = percent + '%';
    document.getElementById('progress-text').innerText = `${done} / ${total}`;
}

function finishWorkout() {
    tg.HapticFeedback.notificationOccurred('success');
    document.getElementById('modal-congrats').classList.remove('hidden');
}

function closeCongrats() {
    // Сбрасываем и переходим к следующему дню (логика переключения)
    completedIds = [];
    tg.CloudStorage.setItem('completed_ids', '[]');
    document.getElementById('modal-congrats').classList.add('hidden');
    // Тут можно добавить смену дня A -> B
    location.reload(); 
}

init();
