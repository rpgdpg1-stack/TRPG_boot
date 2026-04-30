const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655';
const GID_EX = '0';

let workoutPlan = [];
let completedIds = [];
let currentDay = 'A';
let isEditingWeight = false;

const tg = window.Telegram?.WebApp;
const typeTranslation = { 'base': 'БАЗА', 'isolation': 'ИЗОЛЯЦИЯ', 'accessory': 'ДОП' };

async function init() {
    if (tg) { tg.expand(); tg.ready(); }
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    
    await loadData();
    
    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('main-content').style.display = 'block';
    }, 1500);
}

async function fetchSheet(gid) {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
        const res = await fetch(url);
        const text = await res.text();
        const json = JSON.parse(text.substring(47).slice(0, -2));
        return json.table.rows;
    } catch (e) {
        console.error("Ошибка сети:", e);
        return [];
    }
}

async function loadData() {
    const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);
    
    if (!exRows.length || !dayRows.length) return;

    const library = exRows.filter(r => r.c[0]?.v).map(row => ({
        name: row.c[1]?.v || "",
        muscle: row.c[2]?.v || "",
        sub: String(row.c[3]?.v || "").trim(),
        type: String(row.c[4]?.v || "base").toLowerCase(),
        img: row.c[9]?.v || ""
    }));

    workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
        const sub = String(row.c[6]?.v || "").trim();
        const mainEx = library.find(ex => ex.sub.toLowerCase() === sub.toLowerCase());
        return {
            rowId: 'row-' + idx,
            day: String(row.c[2]?.v).toUpperCase(),
            type: String(row.c[4]?.v || 'base').toLowerCase(),
            main: mainEx || { name: sub || "Упр-е", muscle: "—", img: "" },
            weight: "0"
        };
    });
    render();
}

function render() {
    const list = document.getElementById('exercise-list');
    document.getElementById('day-display').innerText = currentDay;
    const filtered = workoutPlan.filter(it => it.day === currentDay);
    
    let html = '';
    ['base', 'isolation', 'accessory'].forEach(secKey => {
        const items = filtered.filter(it => it.type === secKey);
        if (items.length > 0) {
            html += `<div class="section-title">${typeTranslation[secKey]}</div>`;
            items.forEach(item => {
                const isDone = completedIds.includes(item.rowId);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" onclick="handleCardClick('${item.rowId}', event)">
                        <div class="card-inner-content">
                            <div class="img-box"><img src="${item.main.img}" onerror="this.src='https://via.placeholder.com/110'"></div>
                            <div class="info-content">
                                <div class="muscle-row">${item.main.muscle}</div>
                                <div class="ex-name">${item.main.name}</div>
                                <div class="ex-sets">3 x 8-10</div>
                            </div>
                        </div>
                        <div class="weight-side" onclick="event.stopPropagation()">
                            <input type="number" class="weight-input" value="${item.weight}" 
                                   inputmode="decimal"
                                   oninput="if(this.value.length>3)this.value=this.value.slice(0,3)"
                                   onfocus="isEditingWeight=true" 
                                   onblur="setTimeout(()=>isEditingWeight=false,200)">
                            <div class="weight-done-btn" onclick="this.previousElementSibling.blur()">ГОТОВО</div>
                            <div class="w-label">КГ</div>
                        </div>
                        <div class="info-btn" onclick="openInfo('${item.rowId}', event)">i</div>
                    </div>`;
            });
        }
    });
    list.innerHTML = html;
    updateProgress();
}

function handleCardClick(id, event) {
    if (isEditingWeight) {
        document.querySelectorAll('input').forEach(i => i.blur());
        return;
    }
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    render();
}

function finishWorkout() {
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    tg?.close();
}

function openDayPicker() { document.getElementById('day-picker-overlay').classList.remove('hidden'); }
function closeDayPicker() { document.getElementById('day-picker-overlay').classList.add('hidden'); }
function changeDay(day) { currentDay = day; closeDayPicker(); render(); }
function openInfo(id, event) {
    event.stopPropagation();
    const item = workoutPlan.find(it => it.rowId === id);
    document.getElementById('info-content-body').innerHTML = `<h2 style="font-family:'Tiny5';color:var(--accent);">${item.main.name}</h2><p>${item.main.muscle}</p>`;
    document.getElementById('info-modal').classList.remove('hidden');
}
function closeInfo() { document.getElementById('info-modal').classList.add('hidden'); }
function updateProgress() {
    const dayEx = workoutPlan.filter(ex => ex.day === currentDay);
    const done = dayEx.filter(ex => completedIds.includes(ex.rowId)).length;
    const perc = dayEx.length > 0 ? (done / dayEx.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${dayEx.length} ПРОГРЕСС`;
}

window.addEventListener('load', init);
