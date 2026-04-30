const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655';
const GID_EX = '0';

let workoutPlan = [];
let completedIds = [];
let currentDay = 'A';
let isEditingWeight = false;

const tg = window.Telegram?.WebApp;

async function init() {
    if (tg) { tg.expand(); tg.ready(); }
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    await loadData();
    setTimeout(() => {
        document.getElementById('loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    }, 1000);
}

async function fetchSheet(gid) {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
        const res = await fetch(url);
        const text = await res.text();
        return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
    } catch (e) { return []; }
}

async function loadData() {
    const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);
    
    const library = exRows.filter(r => r.c[0]?.v).map(row => ({
        name: row.c[1]?.v || "",
        muscle: row.c[2]?.v || "",
        subgroup: row.c[3]?.v ? `(${row.c[3].v})` : "",
        subID: String(row.c[3]?.v || "").trim(),
        type: String(row.c[4]?.v || "base").toLowerCase(),
        img: row.c[9]?.v || ""
    }));

    workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
        const sub = String(row.c[6]?.v || "").trim();
        const mainEx = library.find(ex => ex.subID.toLowerCase() === sub.toLowerCase());
        return {
            rowId: 'row-' + idx,
            day: String(row.c[2]?.v).toUpperCase(),
            type: String(row.c[4]?.v || 'base').toLowerCase(),
            main: mainEx || { name: sub, muscle: "УПРАЖНЕНИЕ", subgroup: "", img: "" },
            weight: "0"
        };
    });
    render();
}

function render() {
    const list = document.getElementById('exercise-list');
    document.getElementById('day-display').innerText = currentDay;
    const filtered = workoutPlan.filter(it => it.day === currentDay);
    
    const typeNames = { 'base': 'БАЗА', 'isolation': 'ИЗОЛЯЦИЯ', 'accessory': 'ДОП' };
    let html = '';

    ['base', 'isolation', 'accessory'].forEach(secKey => {
        const items = filtered.filter(it => it.type === secKey);
        if (items.length > 0) {
            html += `<div class="section-title">${typeNames[secKey]}</div>`;
            items.forEach(item => {
                const isDone = completedIds.includes(item.rowId);
                html += `
                    <div class="card ${isDone ? 'done' : ''}" onclick="handleCardClick('${item.rowId}', event)">
                        <div class="card-inner-content">
                            <div class="img-box"><img src="${item.main.img}" onerror="this.src='https://via.placeholder.com/118'"></div>
                            <div class="info-content">
                                <div class="muscle-row">
                                    <span class="muscle-main">${item.main.muscle}</span> 
                                    <span class="muscle-sub">${item.main.subgroup}</span>
                                </div>
                                <div class="ex-name">${item.main.name}</div>
                                <div class="ex-sets">3×8-10</div>
                            </div>
                        </div>
                        <div class="weight-side" onclick="event.stopPropagation()">
                            <input type="number" class="weight-input" value="${item.weight}" 
                                   inputmode="numeric" onclick="this.select()"
                                   onfocus="isEditingWeight=true; this.select()" 
                                   onblur="setTimeout(()=>isEditingWeight=false,200)"
                                   oninput="updateWeight('${item.rowId}', this.value)">
                            <div class="w-label">KG</div>
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
    if (isEditingWeight) { document.activeElement.blur(); return; }
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    render();
}

function updateWeight(id, val) {
    const item = workoutPlan.find(it => it.rowId === id);
    if (item) item.weight = val;
}

function openDayPicker() { document.getElementById('day-picker-overlay').classList.remove('hidden'); }
function closeDayPicker() { document.getElementById('day-picker-overlay').classList.add('hidden'); }
function changeDay(day) { currentDay = day; closeDayPicker(); render(); }

function openInfo(id, event) {
    event.stopPropagation();
    const item = workoutPlan.find(it => it.rowId === id);
    if (!item) return;
    document.getElementById('info-content-body').innerHTML = `
        <h2 style="font-family:Geist; color:var(--accent);">${item.main.name}</h2>
        <p style="color:var(--gray-text); text-transform:uppercase;">${item.main.muscle} ${item.main.subgroup}</p>
    `;
    document.getElementById('info-modal').classList.remove('hidden');
}
function closeInfo() { document.getElementById('info-modal').classList.add('hidden'); }

function finishWorkout() { tg?.close(); }

function updateProgress() {
    const dayEx = workoutPlan.filter(ex => ex.day === currentDay);
    const done = dayEx.filter(ex => completedIds.includes(ex.rowId)).length;
    const perc = dayEx.length > 0 ? (done / dayEx.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${dayEx.length} ПРОГРЕСС`;
}

window.addEventListener('load', init);
