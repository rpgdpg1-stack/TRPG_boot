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
    
    // Плавное скрытие лоадера
    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('main-content').style.display = 'block';
    }, 1000);
}

async function loadData() {
    // Тут твой fetch из Google Sheets (оставил структуру)
    // Имитация данных для теста:
    workoutPlan = [
        { rowId: '1', day: 'A', type: 'base', weight: '80', main: { name: 'Приседания', muscle: 'НОГИ', img: '' } },
        { rowId: '2', day: 'A', type: 'isolation', weight: '12', main: { name: 'Подъем на бицепс', muscle: 'РУКИ', img: '' } }
    ];
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
                            <div class="img-box"><img src="${item.main.img}" onerror="this.src='https://via.placeholder.com/150'"></div>
                            <div class="info-content">
                                <div class="muscle-row"><span class="m-main">${item.main.muscle}</span></div>
                                <div class="ex-name">${item.main.name}</div>
                                <div class="ex-sets">3 x 8-12</div>
                            </div>
                        </div>
                        
                        <div class="weight-side" onclick="event.stopPropagation()">
                            <input type="number" class="weight-input" 
                                   value="${item.weight}" 
                                   oninput="if(this.value.length>3)this.value=this.value.slice(0,3)"
                                   onfocus="startWeightEdit()" 
                                   onblur="endWeightEdit()"
                                   onchange="updateWeight('${item.rowId}', this.value)">
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

// Умный клик по карточке
function handleCardClick(id, event) {
    if (isEditingWeight) {
        // Если клавиатура открыта, просто закрываем её и ничего не делаем
        document.querySelectorAll('.weight-input').forEach(el => el.blur());
        return;
    }
    
    // Обычное переключение статуса "Выполнено"
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    render();
}

function startWeightEdit() { isEditingWeight = true; }
function endWeightEdit() { 
    // Задержка, чтобы кнопка "Готово" успела обработать клик раньше, чем сбросится флаг
    setTimeout(() => { isEditingWeight = false; }, 150); 
}

function updateWeight(id, val) {
    const item = workoutPlan.find(it => it.rowId === id);
    if (item) item.weight = val;
}

function openInfo(id, event) {
    event.stopPropagation();
    if (isEditingWeight) return;
    
    const item = workoutPlan.find(it => it.rowId === id);
    const modal = document.getElementById('info-modal');
    modal.innerHTML = `
        <div class="info-nav" onclick="closeInfo()">← НАЗАД</div>
        <div style="padding:20px">
            <h2 style="font-family:'Tiny5'; color:var(--accent)">${item.main.name}</h2>
            <div style="width:100%; height:200px; background:#333; border-radius:20px; margin-bottom:20px"></div>
            <p>${item.main.muscle}</p>
            <p style="color:var(--gray)">Описание техники упражнения будет здесь...</p>
        </div>
    `;
    modal.classList.remove('hidden');
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
