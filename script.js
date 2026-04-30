const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655';
const GID_EX = '0';          

const tg = window.Telegram?.WebApp;
let workoutPlan = [];      
let completedIds = [];
let currentDay = 'A';

const typeTranslation = { 'base': 'БАЗА', 'isolation': 'ИЗОЛЯЦИЯ', 'accessory': 'ДОП' };

async function init() {
    if (tg) { tg.expand(); tg.ready(); }
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
    await loadFullData();
    
    // Прячем лоадер через небольшую паузу после загрузки
    setTimeout(() => {
        document.getElementById('loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    }, 800);
}

async function fetchSheet(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

async function loadFullData() {
    try {
        const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);
        const library = exRows.filter(r => r.c[0]?.v).map(row => ({
            name: row.c[1]?.v || "",
            muscle: row.c[2]?.v || "",
            sub: String(row.c[3]?.v || "").trim(),
            type: String(row.c[4]?.v || "base").toLowerCase(),
            meta: row.c[6]?.v || "",
            img: row.c[9]?.v || ""
        }));

        workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
            const sub = String(row.c[6]?.v || "").trim();
            const mainEx = library.find(ex => ex.sub.toLowerCase() === sub.toLowerCase());
            return {
                rowId: 'row-' + idx,
                day: String(row.c[2]?.v).toUpperCase(),
                type: String(row.c[4]?.v || 'base').toLowerCase(),
                main: mainEx || { name: "Упр. не найдено", muscle: "—", sub: sub },
                weight: mainEx?.meta?.match(/\d+/)?.[0] || "0"
            };
        });
        render();
    } catch (e) { console.error(e); }
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
                    <div class="card ${isDone ? 'done' : ''}" onclick="toggleCard('${item.rowId}', event)">
                        <div class="card-inner-content">
                            <div class="img-box"><img src="${item.main.img}"></div>
                            <div class="info-content">
                                <div class="muscle-row"><span class="m-main">${item.main.muscle}</span></div>
                                <div class="ex-name">${item.main.name}</div>
                                <div class="ex-sets">3 x 8-10</div>
                            </div>
                        </div>
                        
                        <div class="weight-side" onclick="event.stopPropagation()">
                            <input type="number" class="weight-input" 
                                   value="${item.weight}" 
                                   onfocus="this.select();"
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

function toggleCard(id, event) {
    if (event.target.tagName === 'INPUT' || event.target.classList.contains('weight-done-btn')) return;
    
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    render();
}

function updateWeight(id, val) {
    const item = workoutPlan.find(it => it.rowId === id);
    if (item) item.weight = val;
}

// Функции для инфо и выбора дня те же...
function openInfo(id, event) {
    event.stopPropagation();
    const item = workoutPlan.find(it => it.rowId === id);
    document.getElementById('info-content-body').innerHTML = `<h3>${item.main.name}</h3><p>Инфо тут...</p>`;
    document.getElementById('info-modal').classList.remove('hidden');
}
function closeInfo() { document.getElementById('info-modal').classList.add('hidden'); }
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
