const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; // Лист program_days
const GID_EX = '0';          // Лист exercises (ID может быть другим, проверь!)

const tg = window.Telegram.WebApp;
let exercisesLibrary = []; 
let workoutPlan = [];      
let completedIds = [];
let currentDay = 'A';

async function init() {
    tg.expand();
    await loadFullData();
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

async function loadFullData() {
    try {
        // 1. Загружаем все упражнения и сортируем их по приоритету
        const exRows = await fetchSheet(GID_EX);
        exercisesLibrary = exRows.map(row => ({
            id: row.c[0]?.v,
            name: row.c[1]?.v || "Упражнение",
            muscle: row.c[2]?.v || "",
            sub: row.c[3]?.v || "",
            type: row.c[4]?.v || "base",
            meta: row.c[6]?.v || "",
            priority: parseInt(row.c[8]?.v) || 99, // Колонка I: Priority
            img: row.c[9]?.v || ""
        })).sort((a, b) => a.priority - b.priority);

        // 2. Загружаем план на день
        const dayRows = await fetchSheet(GID_DAYS);
        workoutPlan = dayRows.map((row, idx) => {
            const day = row.c[2]?.v || 'A';
            const subGroup = row.c[6]?.v; // Колонка G в program_days: sub_group
            
            // Ищем все упражнения из этой подгруппы в библиотеке
            const alternatives = exercisesLibrary.filter(ex => ex.sub === subGroup);
            // Основное упражнение — это первое по приоритету (уже отсортировано выше)
            const mainEx = alternatives[0] || {};

            return {
                rowId: 'row-' + idx,
                day: day,
                type: row.c[4]?.v || 'base',
                sub: subGroup,
                main: mainEx,
                alternatives: alternatives.slice(1) // Остальные пойдут в замены
            };
        });

        render();
    } catch (e) {
        console.error("Ошибка:", e);
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
            secEx.forEach(item => {
                const ex = item.main;
                const isDone = completedIds.includes(item.rowId);
                
                html += `
                    <div class="card ${isDone ? 'done' : ''}" id="${item.rowId}">
                        <div class="img-box" onclick="toggleCard('${item.rowId}')">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150?text=${ex.sub}'">
                        </div>
                        <div class="info" onclick="toggleCard('${item.rowId}')">
                            <div class="cat-label">${ex.muscle} (${ex.sub})</div>
                            <div class="name">${ex.name}</div>
                            <div class="meta">${ex.meta}</div>
                        </div>
                        <div class="side-controls">
                            <div class="replace-btn" onclick="showAlternatives('${item.rowId}')">🔄</div>
                            <div class="weight-control">
                                <input type="number" class="weight-val" placeholder="0">
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    });

    list.innerHTML = html || `<p style="text-align:center; padding:20px;">План пуст</p>`;
    updateProgress();
}

function showAlternatives(rowId) {
    const item = workoutPlan.find(p => p.rowId === rowId);
    if (!item || item.alternatives.length === 0) {
        alert("Нет замен для этой подгруппы");
        return;
    }
    
    // Простая логика: при клике на 🔄 мы просто меняем основное упражнение на следующее по списку
    const current = item.main;
    item.alternatives.push(current); // Старое в конец списка
    item.main = item.alternatives.shift(); // Новое из начала списка
    
    render(); // Перерисовываем
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
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
