const tg = window.Telegram.WebApp;
const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';

let state = {
    currentDay: 'A',
    workoutData: [],
    library: [],
    completed: [],
    selectedForReplace: null, // ID того, что меняем
    replacementId: null       // ID нового упражнения
};

// Запуск
async function init() {
    tg.expand();
    tg.enableClosingConfirmation();
    // Блокируем свайп вниз для закрытия
    if (tg.isVersionAtLeast('7.7')) {
        tg.disableVerticalSwipes();
    }

    await loadAllData();
    
    // Загружаем прогресс из облака
    tg.CloudStorage.getItem('completed_tasks', (err, val) => {
        if (val) state.completed = JSON.parse(val);
        renderWorkout();
        hideLoader();
    });
}

async function loadAllData() {
    try {
        const [exResp, dayResp] = await Promise.all([
            fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=0`),
            fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=1002309655`)
        ]);

        const exJson = JSON.parse((await exResp.text()).substring(47).slice(0, -2));
        const dayJson = JSON.parse((await dayResp.text()).substring(47).slice(0, -2));

        state.library = exJson.table.rows.map(r => ({
            id: r.c[0]?.v,
            name: r.c[1]?.v,
            muscle: r.c[2]?.v,
            subgroup: r.c[3]?.v,
            img: r.c[9]?.v
        }));

        state.workoutData = dayJson.table.rows.filter(r => r.c[2]?.v).map((r, i) => ({
            rowId: `row-${i}`,
            day: String(r.c[2]?.v).toUpperCase().replace('Б', 'B'),
            exercise: state.library.find(l => l.subgroup === r.c[6]?.v) || { name: r.c[6]?.v, muscle: 'УПР', img: '' },
            weight: localStorage.getItem(`weight-${i}`) || "0"
        }));

    } catch (e) { alert("Ошибка загрузки данных"); }
}

function renderWorkout() {
    const list = document.getElementById('exercise-list');
    const dayData = state.workoutData.filter(d => d.day === state.currentDay);
    
    document.getElementById('tab-day-val').innerText = state.currentDay;
    
    let html = '';
    dayData.forEach(item => {
        const isDone = state.completed.includes(item.rowId);
        html += `
            <div class="ex-wrapper" data-id="${item.rowId}">
                <div class="ex-actions">
                    <div class="act-btn btn-info" onclick="openInfo('${item.exercise.name}')">ИНФО</div>
                    <div class="act-btn btn-swap" onclick="openReplace('${item.rowId}')">СМЕНА</div>
                </div>
                <div class="ex-card ${isDone ? 'done' : ''}" 
                     onclick="toggleTask('${item.rowId}')"
                     ontouchstart="handleTS(event)" ontouchmove="handleTM(event)" ontouchend="handleTE(event)">
                    <img src="${item.exercise.img}" class="ex-img">
                    <div class="ex-info">
                        <div class="ex-muscle">${item.exercise.muscle}</div>
                        <div class="ex-name">${item.exercise.name}</div>
                    </div>
                    <div class="ex-weight-box" onclick="event.stopPropagation()">
                        <input type="number" class="weight-input" value="${item.weight}" 
                               onchange="saveWeight('${item.rowId}', this.value)">
                    </div>
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
    updateProgress();
}

// ЛОГИКА ЭКРАНА ЗАМЕНЫ
function openReplace(rowId) {
    tg.HapticFeedback.impactOccurred('medium');
    state.selectedForReplace = rowId;
    const item = state.workoutData.find(w => w.rowId === rowId);
    
    document.getElementById('replace-sub').innerText = `${item.exercise.muscle} (${item.exercise.subgroup || 'БАЗА'})`;
    
    const options = state.library.filter(l => l.muscle === item.exercise.muscle);
    let html = '';
    options.forEach(opt => {
        html += `
            <div class="rep-item" id="opt-${opt.id}" onclick="selectReplacement('${opt.id}')">
                <img src="${opt.img}" class="ex-img" style="width:50px; height:50px;">
                <div class="ex-info">
                    <div class="ex-name">${opt.name}</div>
                </div>
                <div class="act-btn btn-info" style="width:40px" onclick="event.stopPropagation(); openInfo('${opt.name}')">ⓘ</div>
                <div class="rep-check"></div>
            </div>
        `;
    });
    
    document.getElementById('replace-list').innerHTML = html;
    document.getElementById('replace-screen').classList.remove('hidden');
    document.getElementById('replace-footer').classList.add('hidden');
}

function selectReplacement(optId) {
    tg.HapticFeedback.selectionChanged();
    state.replacementId = optId;
    document.querySelectorAll('.rep-item').forEach(el => el.classList.remove('selected'));
    document.getElementById(`opt-${optId}`).classList.add('selected');
    document.getElementById('replace-footer').classList.remove('hidden');
}

function applyReplacement() {
    const newEx = state.library.find(l => String(l.id) === String(state.replacementId));
    const task = state.workoutData.find(w => w.rowId === state.selectedForReplace);
    if (newEx && task) {
        task.exercise = newEx;
        tg.HapticFeedback.notificationOccurred('success');
        closeModals();
        renderWorkout();
    }
}

// ВСПОМОГАТЕЛЬНОЕ
function toggleTask(id) {
    if (state.completed.includes(id)) {
        state.completed = state.completed.filter(i => i !== id);
    } else {
        state.completed.push(id);
        tg.HapticFeedback.notificationOccurred('success');
    }
    saveCloud();
    renderWorkout();
}

function setDay(day) {
    state.currentDay = day;
    tg.HapticFeedback.impactOccurred('light');
    closeModals();
    renderWorkout();
}

function updateProgress() {
    const dayTasks = state.workoutData.filter(d => d.day === state.currentDay);
    const doneCount = dayTasks.filter(t => state.completed.includes(t.rowId)).length;
    const total = dayTasks.length;
    document.getElementById('progress-text').innerText = `${doneCount}/${total}`;
    document.getElementById('bar-fill').style.width = total ? `${(doneCount/total)*100}%` : '0%';
    
    if (doneCount === total && total > 0) {
        setTimeout(() => document.getElementById('finish-modal').classList.remove('hidden'), 500);
    }
}

function saveWeight(id, val) {
    const task = state.workoutData.find(w => w.rowId === id);
    if (task) {
        task.weight = val;
        localStorage.setItem(`weight-${id.split('-')[1]}`, val);
    }
}

function showScreen(id) {
    tg.HapticFeedback.impactOccurred('medium');
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function openDayPicker() {
    document.getElementById('day-picker').classList.remove('hidden');
}

function closeModals() {
    document.querySelectorAll('.overlay, .full-page').forEach(m => m.classList.add('hidden'));
}

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
    document.getElementById('app').style.visibility = 'visible';
}

function showSoon() { alert("Скоро будет!"); }

function saveCloud() {
    tg.CloudStorage.setItem('completed_tasks', JSON.stringify(state.completed));
}

// СВАЙПЫ
let startX = 0, currentActive = null;
function handleTS(e) { startX = e.touches[0].clientX; currentActive = e.currentTarget; currentActive.style.transition = 'none'; }
function handleTM(e) {
    let x = e.touches[0].clientX - startX;
    if (x < -140) x = -140; if (x > 0) x = 0;
    currentActive.style.transform = `translateX(${x}px)`;
}
function handleTE() {
    currentActive.style.transition = 'transform 0.3s';
    const x = new WebKitCSSMatrix(window.getComputedStyle(currentActive).transform).m41;
    currentActive.style.transform = x < -70 ? 'translateX(-130px)' : 'translateX(0)';
}

window.onload = init;
