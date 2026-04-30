let isEditingWeight = false;

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
                    <div class="card ${isDone ? 'done' : ''}" 
                         onclick="handleCardClick('${item.rowId}', event)">
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
                                   oninput="if(this.value.length>3)this.value=this.value.slice(0,3)"
                                   onfocus="startEdit()" 
                                   onblur="endEdit()"
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
}

// Логика блокировки: если редактируем вес, клик по карте только закрывает клаву
function handleCardClick(id, event) {
    if (isEditingWeight) {
        // Просто убираем фокус со всех инпутов
        document.querySelectorAll('.weight-input').forEach(i => i.blur());
        return; 
    }
    
    // Если не редактируем, обычный тоггл
    toggleCard(id, event);
}

function startEdit() {
    isEditingWeight = true;
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function endEdit() {
    // Небольшая задержка, чтобы клик по "Готово" успел сработать до смены флага
    setTimeout(() => { isEditingWeight = false; }, 100);
}

function toggleCard(id, event) {
    // Игнорим клики по системным элементам внутри
    if (event.target.tagName === 'INPUT' || event.target.classList.contains('weight-done-btn')) return;
    
    completedIds.includes(id) ? completedIds = completedIds.filter(i => i !== id) : completedIds.push(id);
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    render();
}

function openInfo(id, event) {
    event.stopPropagation();
    if (isEditingWeight) return; // Не открываем инфо, если правим вес
    
    const item = workoutPlan.find(it => it.rowId === id);
    const modal = document.getElementById('info-modal');
    modal.innerHTML = `
        <div class="info-nav" onclick="closeInfo()">← НАЗАД</div>
        <div class="info-body">
            <video autoplay loop muted playsinline src="video_url_here"></video>
            <h2>${item.main.name}</h2>
            <p>${item.main.muscle} — ${typeTranslation[item.type]}</p>
            <div class="description">Техника: Держите спину ровно...</div>
        </div>
    `;
    modal.classList.remove('hidden');
}
