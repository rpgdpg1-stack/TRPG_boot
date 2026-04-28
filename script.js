const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; 
const GID_EX = '0';          

const tg = window.Telegram?.WebApp;
let exercisesLibrary = []; 
let workoutPlan = [];      
let completedIds = [];
let currentDay = 'A';

async function init() {
    if (tg) {
        tg.expand();
        tg.ready();
    }
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

        // Библиотека упражнений
        exercisesLibrary = exRows.filter(r => r.c[0]?.v).map(row => ({
            id: row.c[0]?.v,
            name: row.c[1]?.v || "Упражнение",
            muscle: row.c[2]?.v || "",
            sub: String(row.c[3]?.v || "").trim().toLowerCase(),
            type: String(row.c[4]?.v || "base").toLowerCase(),
            meta: row.c[6]?.v || "",
            priority: parseInt(row.c[8]?.v) || 99,
            img: row.c[9]?.v || ""
        }));

        // План тренировок
        workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
            const subGroup = String(row.c[6]?.v || "").trim().toLowerCase();
            const day = String(row.c[2]?.v || 'A').toUpperCase();
            const type = String(row.c[4]?.v || 'base').toLowerCase();

            const alts = exercisesLibrary
                .filter(ex => ex.sub === subGroup)
                .sort((a, b) => a.priority - b.priority);

            return {
                rowId: 'row-' + idx,
                day: day,
                type: type,
                main: alts[0] || { name: "Не найдено", muscle: "None", sub: subGroup, meta: "" },
                alternatives: alts.slice(1)
            };
        });

        render();
    } catch (e) {
        console.error("Ошибка загрузки:", e);
    }
}

function changeDay(day) {
    currentDay = day;
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${day}`).classList.add('active');
    render();
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = workoutPlan.filter(item => item.day === currentDay);
    
    let html = '';
    const sections = ['base', 'isolation', 'accessory'];

    sections.forEach(sec => {
        const items = filtered.filter(it => it.type === sec);
        if (items.length > 0) {
            html += `<div class="section-title">${sec}</div>`;
            items.forEach(item => {
                const ex = item.main;
                const isDone = completedIds.includes(item.rowId);
                const weight = ex.meta ? (ex.meta.match(/\d+/)?.[0] || "0") : "0";

                html += `
                    <div class="card ${isDone ? 'done' : ''}" onclick="toggleCard('${item.rowId}')">
                        <div class="info-btn" onclick="event.stopPropagation(); alert('Info about ${ex.name}')">i</div>
                        <div class="img-box">
                            <img src="${ex.img}" onerror="this.src='https://via.placeholder.com/150?text=FIT'">
                        </div>
                        <div class="info-content">
                            <div class="muscle-group-row">
                                <span class="muscle-label">${ex.muscle}</span>
                                <span class="subgroup-label">${ex.sub}</span>
                            </div>
                            <div class="ex-name">${ex.name}</div>
                            <div class="sets-label">${ex.meta || '3 x 10'}</div>
                        </div>
                        <div class="weight-area">
                            <div class="weight-num">${weight}</div>
                            <div class="weight-unit">KG</div>
                        </div>
                    </div>`;
            });
        }
    });
    list.innerHTML = html || `<p style="text-align:center; color:#555; margin-top:50px;">REST DAY</p>`;
    updateProgress();
}

function toggleCard(id) {
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
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
