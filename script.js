const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655';
const GID_EX = '0';

const tg = window.Telegram?.WebApp;
let workoutPlan = [];
let library = [];
let completedIds = [];
let currentDay = 'A';
let activeCard = null;
let startX = 0;

// Инициализация
async function init() {
    if (tg) {
        tg.expand();
        tg.enableClosingConfirmation();
        tg.headerColor = '#0d0d0d';
        tg.backgroundColor = '#0d0d0d';
        
        // Загрузка из облака
        tg.CloudStorage.getItem('completed_ids', (err, val) => {
            if (val) completedIds = JSON.parse(val);
        });
    }

    await loadData();
    document.getElementById('loader').style.display = 'none';
}

async function loadData() {
    try {
        const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);
        
        library = exRows.filter(r => r.c[0]?.v).map(row => ({
            name: row.c[1]?.v || "",
            muscle: String(row.c[2]?.v || "").toUpperCase(),
            subgroup: row.c[3]?.v || "",
            img: row.c[9]?.v || ""
        }));

        workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => ({
            rowId: 'row-' + idx,
            day: String(row.c[2]?.v).toUpperCase().replace('Б', 'B'), // Исправляем кириллицу Б на B
            type: String(row.c[4]?.v || 'base').toLowerCase(),
            main: library.find(ex => ex.subgroup === row.c[6]?.v) || { name: row.c[6]?.v, muscle: "УПРАЖНЕНИЕ", img: "" },
            weight: localStorage.getItem(`w_${idx}`) || "0"
        }));
        
        render();
    } catch (e) { console.error("Ошибка загрузки:", e); }
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = workoutPlan.filter(it => it.day === currentDay);
    
    // Обновляем таб-бар и активный день
    document.getElementById('current-day-tab').innerText = currentDay;
    document.querySelectorAll('.day-option').forEach(el => el.classList.remove('active'));
    document.getElementById(`btn-day-${currentDay}`)?.classList.add('active');

    let html = '';
    filtered.forEach(item => {
        const isDone = completedIds.includes(item.rowId);
        html += `
        <div class="card-wrapper" data-id="${item.rowId}">
            <div class="card-actions">
                <div class="action-btn btn-info" onclick="openInfo('${item.rowId}')">ИНФО</div>
                <div class="action-btn btn-swap" onclick="openReplace('${item.rowId}')">СМЕНА</div>
            </div>
            <div class="card ${isDone ? 'done' : ''}" 
                 ontouchstart="hTouchStart(event)" ontouchmove="hTouchMove(event)" ontouchend="hTouchEnd(event)"
                 onclick="toggleDone('${item.rowId}')">
                <div class="img-box"><img src="${item.main.img}"></div>
                <div class="info-content">
                    <div class="muscle-row">${item.main.muscle}</div>
                    <div class="ex-name">${item.main.name}</div>
                </div>
                <div class="weight-side" onclick="event.stopPropagation()">
                    <input type="number" inputmode="decimal" class="weight-input" value="${item.weight}" 
                           oninput="saveWeight('${item.rowId}', this.value)">
                </div>
            </div>
        </div>`;
    });
    list.innerHTML = html;
    updateProgress();
}

// Навигация
function showScreen(id) {
    tg?.HapticFeedback.impactOccurred('medium');
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function changeDay(day) {
    tg?.HapticFeedback.notificationOccurred('success');
    currentDay = day;
    closeDayPicker();
    render();
}

// Функции карточек
function toggleDone(id) {
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
        tg?.HapticFeedback.notificationOccurred('success');
    }
    saveCloud();
    render();
}

function saveWeight(id, val) {
    const item = workoutPlan.find(it => it.rowId === id);
    if (item) {
        item.weight = val;
        localStorage.setItem(`w_${id.split('-')[1]}`, val);
    }
}

// Свайпы (плавные)
function hTouchStart(e) { startX = e.touches[0].clientX; activeCard = e.currentTarget; activeCard.style.transition = 'none'; }
function hTouchMove(e) {
    let diff = e.touches[0].clientX - startX;
    if (diff > 0) diff = 0;
    if (diff < -150) diff = -150;
    activeCard.style.transform = `translateX(${diff}px)`;
}
function hTouchEnd() {
    activeCard.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
    const x = new WebKitCSSMatrix(window.getComputedStyle(activeCard).transform).m41;
    if (x < -60) {
        activeCard.style.transform = 'translateX(-140px)';
        tg?.HapticFeedback.impactOccurred('light');
    } else {
        activeCard.style.transform = 'translateX(0)';
    }
}

function closeAllSwipes() {
    document.querySelectorAll('.card').forEach(c => c.style.transform = 'translateX(0)');
}

// Модалки
function openDayPicker() { tg?.HapticFeedback.impactOccurred('light'); document.getElementById('day-picker-overlay').classList.remove('hidden'); }
function closeDayPicker() { document.getElementById('day-picker-overlay').classList.add('hidden'); }

function openReplace(id) {
    const item = workoutPlan.find(it => it.rowId === id);
    const filterText = `${item.main.muscle} (${item.main.subgroup || 'БАЗА'})`;
    document.getElementById('replace-filter-info').innerText = filterText;
    
    const options = library.filter(ex => ex.muscle === item.main.muscle);
    let html = '';
    options.forEach(ex => {
        const isActive = ex.name === item.main.name;
        html += `
        <div class="replace-card ${isActive ? 'active' : ''}" onclick="confirmReplace('${id}', '${ex.name}')">
            <div class="img-box" style="width:60px; height:60px;"><img src="${ex.img}"></div>
            <div class="replace-info">
                <div class="ex-name" style="font-size:13px;">${ex.name}</div>
            </div>
            <div class="replace-check"></div>
        </div>`;
    });
    document.getElementById('replace-list').innerHTML = html;
    document.getElementById('replace-screen').classList.remove('hidden');
}

function confirmReplace(rowId, name) {
    tg?.HapticFeedback.notificationOccurred('success');
    const item = workoutPlan.find(it => it.rowId === rowId);
    item.main = library.find(l => l.name === name);
    setTimeout(() => { closeReplace(); render(); }, 200);
}

function closeReplace() { document.getElementById('replace-screen').classList.add('hidden'); }

function finishWorkout() {
    tg?.HapticFeedback.notificationOccurred('success');
    document.getElementById('finish-modal').classList.remove('hidden');
}
function closeFinish() { document.getElementById('finish-modal').classList.add('hidden'); showScreen('home-screen'); }

function showSoon() {
    tg?.HapticFeedback.impactOccurred('light');
    alert("Скоро будет!");
}

// Вспомогательные
function updateProgress() {
    const dayEx = workoutPlan.filter(it => it.day === currentDay);
    const done = dayEx.filter(it => completedIds.includes(it.rowId)).length;
    const perc = dayEx.length ? (done / dayEx.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-digits').innerText = `${done} / ${dayEx.length}`;
}

function saveCloud() {
    if (tg?.CloudStorage) tg.CloudStorage.setItem('completed_ids', JSON.stringify(completedIds));
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

window.addEventListener('load', init);
