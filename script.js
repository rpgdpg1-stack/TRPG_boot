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
let startX = 0;
let activeCard = null;

const tg = window.Telegram?.WebApp;

// Инициализация Fullscreen и Telegram настроек
if (tg) {
    tg.expand();
    tg.enableClosingConfirmation();
    tg.headerColor = '#0d0d0d';
    tg.backgroundColor = '#0d0d0d';
    if (tg.requestFullscreen) tg.requestFullscreen();
}

document.body.style.opacity = "1";

async function init() {
    // Загрузка данных из облака Телеграм
    if (tg?.CloudStorage) {
        tg.CloudStorage.getItem('completed_exercises', (err, val) => {
            if (val) completedIds = JSON.parse(val);
        });
    } else {
        const saved = localStorage.getItem('completed_exercises');
        if (saved) completedIds = JSON.parse(saved);
    }
    
    await loadData();
    setTimeout(() => {
        document.body.classList.add('loaded');
        document.getElementById('loader').style.display = 'none';
    }, 600);
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
            weight: localStorage.getItem(`weight_row-${idx}`) || "0"
        };
    });
    render();
}

function translate(text) {
    if (!text) return "";
    let clean = text.replace(/_/g, ' ').replace(/[()]/g, '').toUpperCase();
    return TRANSLATIONS[clean] || clean;
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
                <div class="card-wrapper" data-id="${item.rowId}">
                    <div class="card-actions">
                        <div class="action-btn btn-info" onclick="openInfoScreen('${item.rowId}')">
                            <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M5.11523 2.52002V0.77002H6.86523V2.52002H5.11523ZM6.86523 11.27H5.11523V4.27002H6.86523V11.27Z" fill="#4B90C9"/></svg>
                            <span class="action-label label-info">ИНФО</span>
                        </div>
                        <div class="action-btn btn-swap" onclick="openReplaceScreen('${item.rowId}')">
                            <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M6.01172 0.5C7.6804 0.5 9.17502 1.24355 10.1836 2.41699L11.4902 1.08301V5.42773H7.23828L9.12891 3.49414C8.39591 2.58312 7.27206 2 6.01172 2C3.80266 2 2.01185 3.79097 2.01172 6C2.01172 8.20914 3.80258 10 6.01172 10C7.71963 10 9.17636 8.9294 9.75 7.42285H11.3252C10.6982 9.77075 8.55725 11.5 6.01172 11.5C2.97415 11.5 0.511719 9.03757 0.511719 6C0.511851 2.96255 2.97423 0.5 6.01172 0.5Z" fill="#9ED153"/></svg>
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
                                   onfocus="isEditingWeight=true; this.select()" 
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

// Умный свайп
function handleTouchStart(e) {
    if (isEditingWeight) return;
    startX = e.touches[0].clientX;
    const card = e.currentTarget;
    if (activeCard && activeCard !== card) closeAllSwipes();
    activeCard = card;
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
    activeCard.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
    let currentX = new WebKitCSSMatrix(window.getComputedStyle(activeCard).transform).m41;
    if (currentX < -70) {
        activeCard.style.transform = 'translateX(-150px)';
        tg?.HapticFeedback.impactOccurred('light');
    } else {
        activeCard.style.transform = 'translateX(0)';
    }
}

// Авто-закрытие при клике мимо или скролле
function closeAllSwipes(e) {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        if (e && card.contains(e.target)) return;
        card.style.transform = 'translateX(0)';
    });
    activeCard = null;
}

// Сохранение веса
function updateWeight(id, val) {
    const item = workoutPlan.find(it => it.rowId === id);
    if (item) {
        item.weight = val;
        localStorage.setItem(`weight_${id}`, val);
    }
}

// Клики и Вибро
function handleCardClick(id, event) {
    if (isEditingWeight) { document.activeElement.blur(); isEditingWeight=false; return; }
    let x = new WebKitCSSMatrix(window.getComputedStyle(event.currentTarget).transform).m41;
    if (x < -10) return;

    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
        tg?.HapticFeedback.notificationOccurred('success');
    }
    
    saveToCloud('completed_exercises', completedIds);
    render();
}

function openInfoScreen(id) {
    tg?.HapticFeedback.impactOccurred('medium');
    const item = workoutPlan.find(it => it.rowId === id);
    document.getElementById('info-body').innerHTML = `<h2>${item.main.name}</h2><p>${item.main.muscle}</p>`;
    document.getElementById('info-screen').classList.remove('hidden');
}

function openReplaceScreen(id) {
    tg?.HapticFeedback.impactOccurred('medium');
    const item = workoutPlan.find(it => it.rowId === id);
    const sub = item.main.subgroup.replace(/[()]/g, '');
    const options = library.filter(ex => ex.subgroup.includes(sub));
    let html = '';
    options.forEach(ex => {
        html += `<div class="day-option" style="font-size:14px; margin-bottom:10px;" onclick="confirmReplace('${id}', '${ex.name}')">${ex.name}</div>`;
    });
    document.getElementById('replace-list').innerHTML = html;
    document.getElementById('replace-screen').classList.remove('hidden');
}

function confirmReplace(rowId, newName) {
    tg?.HapticFeedback.notificationOccurred('success');
    const item = workoutPlan.find(it => it.rowId === rowId);
    const newEx = library.find(ex => ex.name === newName);
    if (item && newEx) {
        item.main = newEx;
        render();
        closeReplace();
    }
}

function changeDay(day) {
    tg?.HapticFeedback.impactOccurred('light');
    currentDay = day;
    closeDayPicker();
    render();
}

// Работа с облаком Телеграм
function saveToCloud(key, data) {
    const json = JSON.stringify(data);
    localStorage.setItem(key, json);
    if (tg?.CloudStorage) {
        tg.CloudStorage.setItem(key, json);
    }
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
function updateProgress() {
    const dayEx = workoutPlan.filter(ex => ex.day === currentDay);
    const done = dayEx.filter(ex => completedIds.includes(ex.rowId)).length;
    const perc = dayEx.length > 0 ? (done / dayEx.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${dayEx.length} ПРОГРЕСС`;
}
function finishWorkout() { tg?.close(); }

window.addEventListener('load', init);
