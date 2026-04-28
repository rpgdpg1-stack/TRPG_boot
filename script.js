const SHEET_ID = '1HiOp9bNlvIt_ayUiY5P8ycBlczt6PrLn0F8BSvv8OZk';
const GID_DAYS = '1002309655'; 
const GID_EX = '0';          

const tg = window.Telegram.WebApp;
let workoutPlan = [];      
let completedIds = [];

async function loadFullData() {
    const listContainer = document.getElementById('exercise-list');
    try {
        const [exRows, dayRows] = await Promise.all([
            fetchSheet(GID_EX),
            fetchSheet(GID_DAYS)
        ]);

        // Собираем библиотеку упражнений
        const library = exRows.filter(r => r.c[0]?.v).map(row => ({
            name: row.c[1]?.v,
            sub: String(row.c[3]?.v || "").trim().toLowerCase(),
            priority: parseInt(row.c[8]?.v) || 99,
            img: row.c[9]?.v || "",
            meta: row.c[6]?.v || ""
        }));

        // Собираем план, сопоставляя по sub_group
        workoutPlan = dayRows.filter(r => r.c[2]?.v).map((row, idx) => {
            const subFromSheet = String(row.c[6]?.v || "").trim().toLowerCase();
            const alts = library
                .filter(ex => ex.sub === subFromSheet)
                .sort((a, b) => a.priority - b.priority);

            return {
                rowId: 'row-' + idx,
                day: String(row.c[2]?.v).toUpperCase(),
                type: String(row.c[4]?.v || "base").toLowerCase(),
                main: alts[0] || null,
                sub: subFromSheet
            };
        });

        render();
    } catch (e) {
        listContainer.innerHTML = `<div style="color:red; padding:20px;">Ошибка: ${e.message}. Проверь GID и доступ к таблице!</div>`;
    }
}

async function fetchSheet(gid) {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`);
    if (!res.ok) throw new Error("Таблица недоступна");
    const text = await res.text();
    return JSON.parse(text.substring(47).slice(0, -2)).table.rows;
}

function render() {
    const list = document.getElementById('exercise-list');
    const filtered = workoutPlan.filter(item => item.day === 'A');
    
    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; padding:20px; color:gray;">Нет данных для дня A. Проверь колонку 'day' в таблице.</p>`;
        return;
    }

    list.innerHTML = filtered.map(item => {
        if (!item.main) return `<div class="card" style="border:1px dashed red;">Не найдено упражнение для подгруппы: ${item.sub}</div>`;
        const isDone = completedIds.includes(item.rowId);
        return `
            <div class="card ${isDone ? 'done' : ''}" id="${item.rowId}">
                <div class="img-box" onclick="toggleCard('${item.rowId}')">
                    <img src="${item.main.img}" onerror="this.src='https://via.placeholder.com/150?text=GYM'">
                </div>
                <div class="info" onclick="toggleCard('${item.rowId}')">
                    <div class="cat-label">${item.main.sub}</div>
                    <div class="name">${item.main.name}</div>
                    <div class="meta">${item.main.meta}</div>
                </div>
            </div>`;
    }).join('');
}

function toggleCard(id) {
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    render();
}

window.onload = () => {
    tg.expand();
    loadFullData();
};
