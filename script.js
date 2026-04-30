const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655';
const GID_EX = '0';

const TRANSLATIONS = {
    'BACK': 'СПИНА', 'CHEST': 'ГРУДЬ', 'LEGS': 'НОГИ', 'SHOULDERS': 'ПЛЕЧИ',
    'ARMS': 'РУКИ', 'ABS': 'ПРЕСС', 'WIDTH': 'ШИРИНА', 'THICKNESS': 'ТОЛЩИНА',
    'NECK': 'ШЕЯ', 'EXTENSORS': 'РАЗГИБАТЕЛИ'
};

let workoutPlan = [];
let library = [];
let completedIds = [];
let currentDay = 'A';
let isEditingWeight = false;

// Swipe state
let startX = 0;
let activeCard = null;

const tg = window.Telegram?.WebApp;
document.body.style.opacity = "1";

async function init() {
    if (tg) { tg.expand(); tg.ready(); }
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    await loadData();
    setTimeout(() => {
        document.body.classList.add('loaded');
        document.getElementById('loader').style.display = 'none';
    }, 600);
}

function translate(text) {
    if (!text) return "";
    let clean = text.replace(/_/g, ' ').replace(/[()]/g, '').toUpperCase();
    return TRANSLATIONS[clean] || clean;
}

async function loadData() {
    const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);
    
    library = exRows.filter(r => r.c[0]?.v).map(row => ({
        name: row.c[1]?.v || "",
        muscle: translate(row.c[2]?.v),
        subgroup: row.c[3]?.v ? `(${translate(row.c[3].v)})` : "",
        subID: String(row.c[3]?.v || "").trim(),
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
                <div class="card-wrapper">
                    <div class="card-actions">
                        <div class="action-btn btn-info" onclick="openInfoScreen('${item.rowId}')">
                            <svg width="16" height="16" viewBox="0 0 12 12"><path d="M9.63281 2.48096V0.730957H11.3828V2.48096H9.63281ZM11.3828 11.231H9.63281V4.23096H11.3828V11.231Z" fill="#4B90C9"/></svg>
                            <span class="action-label label-info">ИНФО</span>
                        </div>
                        <div class="action-btn btn-swap" onclick="openReplaceScreen('${item.rowId}')">
                            <svg width="16" height="16" viewBox="0 0 12 12"><path d="M2 2H10V4L12 2L10 0V2H0V7H2V2ZM10 10H2V8L0 10L2 12V10H12V5H10V10Z" fill="#9ED153"/></svg>
                            <span class="action-label label-swap">СМЕНА</span>
                        </div>
                    </div>
                    <div class="card ${isDone ? 'done' : ''}" 
                         ontouchstart="handleTouchStart(event)" 
                         ontouchmove="handleTouchMove(event)" 
                         ontouchend="handleTouchEnd(event)"
                         onclick="handleCardClick('${item.rowId}', event)">
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
                                   onfocus="isEditingWeight=true; this.select()" onblur="setTimeout(()=>isEditingWeight=false,200)">
                            <div class="w-label">KG</div>
                        </div>
                    </div>
                </div>`;
            });
        }
    });
    list.innerHTML = html;
    updateProgress();
}

function handleTouchStart(e) {
    if (isEditingWeight) return;
    startX = e.touches[0].clientX;
    activeCard = e.currentTarget;
    activeCard.style.transition = 'none';
}

function handleTouchMove(e) {
    if (!activeCard) return;
    let x = e.touches[0].clientX;
    let diff = x - startX;
    if (diff > 0) diff = 0;
    if (diff < -160) diff = -160;
    activeCard.style.transform = `translateX(${diff}px)`;
}

function handleTouchEnd() {
    if (!activeCard) return;
    activeCard.style.transition = 'transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
    let currentX = new WebKitCSSMatrix(window.getComputedStyle(activeCard).transform).m41;
    activeCard.style.transform = currentX < -70 ? 'translateX(-150px)' : 'translateX(0)';
    activeCard = null;
}

function openInfoScreen(id) {
    const item = workoutPlan.find(it => it.rowId === id);
    document.getElementById('info-body').innerHTML = `<h2>${item.main.name}</h2><p>${item.main.muscle} ${item.main.subgroup}</p>`;
    document.getElementById('info-screen').classList.remove('hidden');
}

function openReplaceScreen(id) {
    const item = workoutPlan.find(it => it.rowId === id);
    const sub = item.main.subgroup.replace(/[()]/g, '');
    const options = library.filter(ex => ex.subgroup.includes(sub));
    let html = '';
    options.forEach(ex => {
        html += `<div style="background:#1C1C1E; padding:15px; border-radius:15px; margin-bottom:10px; display:flex; align-items:center;" onclick="confirmReplace('${id}', '${ex.name}')">
            <img src="${ex.img}" style="width:40px; height:40px; margin-right:15px; border-radius:5px; background:#fff;">
            <div><div style="font-weight:600; font-size:14px;">${ex.name}</div><div style="font-size:10px; color:#8E8E93;">${ex.muscle}</div></div>
        </div>`;
    });
    document.getElementById('replace-list').innerHTML = html;
    document.getElementById('replace-screen').classList.remove('hidden');
}

function confirmReplace(rowId, newName) {
    const item = workoutPlan.find(it => it.rowId === rowId);
    const newEx = library.find(ex => ex.name === newName);
    if (item && newEx) { item.main = newEx; render(); closeReplace(); }
}

function handleCardClick(id, event) {
    if (isEditingWeight) return;
    let x = new WebKitCSSMatrix(window.getComputedStyle(event.currentTarget).transform).m41;
    if (x < -10) return;
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    render();
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

function closeInfo() { document.getElementById('info-screen').classList.add('hidden'); }
function closeReplace() { document.getElementById('replace-screen').classList.add('hidden'); }
function openDayPicker() { document.getElementById('day-picker-overlay').classList.remove('hidden'); }
function closeDayPicker() { document.getElementById('day-picker-overlay').classList.add('hidden'); }
function changeDay(day) { currentDay = day; closeDayPicker(); render(); }
function updateProgress() {
    const dayEx = workoutPlan.filter(ex => ex.day === currentDay);
    const done = dayEx.filter(ex => completedIds.includes(ex.rowId)).length;
    const perc = dayEx.length > 0 ? (done / dayEx.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${dayEx.length} ПРОГРЕСС`;
}
function finishWorkout() { tg?.close(); }

window.addEventListener('load', init);
