const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655';
const GID_EX = '0';

// Словарь перевода
const TRANSLATIONS = {
    'BACK': 'СПИНА', 'CHEST': 'ГРУДЬ', 'LEGS': 'НОГИ', 'SHOULDERS': 'ПЛЕЧИ',
    'ARMS': 'РУКИ', 'ABS': 'ПРЕСС', 'WIDTH': 'ШИРИНА', 'THICKNESS': 'ТОЛЩИНА'
};

let workoutPlan = [];
let library = [];
let completedIds = [];
let currentDay = 'A';
let isEditingWeight = false;

const tg = window.Telegram?.WebApp;
document.body.style.opacity = "1";

// Логика свайпа
let startX = 0;
let currentTranslate = 0;
let activeCard = null;

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
    const clean = text.replace(/_/g, ' ').toUpperCase();
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
                        <div class="action-btn btn-info" onclick="openInfoScreen('${item.rowId}')">ИНФО</div>
                        <div class="action-btn btn-swap" onclick="openReplaceScreen('${item.rowId}')">СМЕНА</div>
                    </div>
                    <div class="card ${isDone ? 'done' : ''}" 
                         data-id="${item.rowId}"
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
                                   inputmode="numeric" onfocus="isEditingWeight=true; this.select()" 
                                   onblur="setTimeout(()=>isEditingWeight=false,200)"
                                   oninput="updateWeight('${item.rowId}', this.value)">
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

// TOUCH ОБРАБОТЧИКИ
function handleTouchStart(e) {
    if (isEditingWeight) return;
    startX = e.touches[0].clientX;
    activeCard = e.currentTarget;
    activeCard.style.transition = 'none';
}

function handleTouchMove(e) {
    if (!activeCard || isEditingWeight) return;
    let x = e.touches[0].clientX;
    let diff = x - startX;
    if (diff > 0) diff = 0; // Запрещаем свайп вправо
    if (diff < -140) diff = -140; // Макс. сдвиг для 2 кнопок
    activeCard.style.transform = `translateX(${diff}px)`;
}

function handleTouchEnd(e) {
    if (!activeCard) return;
    activeCard.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
    let matrix = new WebKitCSSMatrix(window.getComputedStyle(activeCard).transform);
    if (matrix.m41 < -70) {
        activeCard.style.transform = 'translateX(-140px)';
    } else {
        activeCard.style.transform = 'translateX(0)';
    }
}

// ОКНА
function openInfoScreen(id) {
    const item = workoutPlan.find(it => it.rowId === id);
    document.getElementById('info-body').innerHTML = `
        <h2>${item.main.name}</h2>
        <p>Группа: ${item.main.muscle} ${item.main.subgroup}</p>
        <p style="margin-top:20px;">Здесь будет подробное описание техники выполнения упражнения, советы и работающие мышцы.</p>
    `;
    document.getElementById('info-screen').classList.remove('hidden');
}

function openReplaceScreen(id) {
    const item = workoutPlan.find(it => it.rowId === id);
    const subID = item.main.subgroup.replace(/[()]/g, '');
    const options = library.filter(ex => ex.subgroup.includes(subID));
    
    let html = '';
    options.forEach(ex => {
        html += `
            <div class="replace-item" onclick="confirmReplace('${id}', '${ex.name}')">
                <img src="${ex.img}">
                <div class="replace-info">
                    <div class="name">${ex.name}</div>
                    <div class="muscle-sub" style="font-size:10px;">${ex.muscle}</div>
                </div>
            </div>`;
    });
    document.getElementById('replace-list').innerHTML = html;
    document.getElementById('replace-screen').classList.remove('hidden');
}

function confirmReplace(rowId, newName) {
    const item = workoutPlan.find(it => it.rowId === rowId);
    const newEx = library.find(ex => ex.name === newName);
    if (item && newEx) {
        item.main = newEx;
        render();
        closeReplace();
    }
}

function closeInfo() { document.getElementById('info-screen').classList.add('hidden'); }
function closeReplace() { document.getElementById('replace-screen').classList.add('hidden'); }

// Базовые функции (остались без изменений)
function handleCardClick(id, event) {
    if (isEditingWeight) return;
    let matrix = new WebKitCSSMatrix(window.getComputedStyle(event.currentTarget).transform);
    if (matrix.m41 < -10) return; // Если карточка сдвинута, клик не засчитываем как выполнение

    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    render();
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

function updateWeight(id, val) {
    const item = workoutPlan.find(it => it.rowId === id);
    if (item) item.weight = val;
}

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

window.addEventListener('load', init);
