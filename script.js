const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; // ТВОЙ ИД ПРОГРАМ ДЕЙС
const GID_EX = '0';          

const tg = window.Telegram?.WebApp;
let workoutPlan = [];      
let completedIds = [];
let currentDay = 'A';

async function init() {
    if (tg) { tg.expand(); tg.ready(); }
    const saved = localStorage.getItem('completed_exercises');
    if (saved) completedIds = JSON.parse(saved);
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
        const [exRows, dayRows] = await Promise.all([fetchSheet(GID_EX), fetchSheet(GID_DAYS)]);
        
        const library = exRows.filter(r => r.c[0]?.v).map(row => ({
            name: row.c[1]?.v,
            muscle: row.c[2]?.v,
            sub: String(row.c[3]?.v || "").trim().toLowerCase(),
            type: String(row.c[4]?.v || "base").toLowerCase(),
            meta: row.c[6]?.v || "",
            priority: parseInt(row.c[8]?.v) || 99,
            img: row.c[9]?.v || ""
        }));

        workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
            const sub = String(row.c[6]?.v || "").trim().toLowerCase();
            const alts = library.filter(ex => ex.sub === sub).sort((a,b) => a.priority - b.priority);
            return {
                rowId: 'row-' + idx,
                day: String(row.c[2]?.v).toUpperCase(),
                type: String(row.c[4]?.v || 'base').toLowerCase(),
                main: alts[0] || { name: "Не найдено", muscle: "Error", sub: sub },
                sub: sub
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
    ['base', 'isolation', 'accessory'].forEach(sec => {
        const items = filtered.filter(it => it.type === sec);
        if (items.length > 0) {
            html += `<div class="section-title">${sec.toUpperCase()}</div>`;
            items.forEach(item => {
                const isDone = completedIds.includes(item.rowId);
                const weight = item.main.meta ? (item.main.meta.match(/\d+/)?.[0] || "0") : "0";
                html += `
                    <div class="card ${isDone ? 'done' : ''}" onclick="toggleCard('${item.rowId}')">
                        <div class="info-btn">i</div>
                        <div class="img-box"><img src="${item.main.img}"></div>
                        <div class="info-content">
                            <div class="muscle-row">
                                <span class="m-group">${item.main.muscle}</span>
                                <span class="s-group">${item.sub}</span>
                            </div>
                            <div class="ex-name">${item.main.name}</div>
                            <div class="ex-meta">${item.main.meta || '3 x 10'}</div>
                        </div>
                        <div class="weight-box">
                            <div class="w-num">${weight}</div>
                            <div class="w-unit">KG</div>
                        </div>
                    </div>`;
            });
        }
    });
    list.innerHTML = html || `<p style="text-align:center; color:#555;">REST DAY</p>`;
    updateProgress();
}

function toggleCard(id) {
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    render();
}

function openDayPicker() { document.getElementById('day-picker').classList.remove('hidden'); }
function closeDayPicker() { document.getElementById('day-picker').classList.add('hidden'); }

function changeDay(day) {
    currentDay = day;
    closeDayPicker();
    render();
}

function updateProgress() {
    const dayEx = workoutPlan.filter(ex => ex.day === currentDay);
    const done = dayEx.filter(ex => completedIds.includes(ex.rowId)).length;
    const perc = dayEx.length > 0 ? (done / dayEx.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = perc + '%';
    document.getElementById('progress-text').innerText = `${done} / ${dayEx.length} DONE`;
}

window.addEventListener('load', init);
