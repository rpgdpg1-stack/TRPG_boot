// ... (SHEET_ID и прочие константы остаются прежними)

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
                            <div class="img-box"><img src="${item.main.img}" onerror="this.src='https://via.placeholder.com/110'"></div>
                            <div class="info-content">
                                <div class="muscle-row">${item.main.muscle}</div>
                                <div class="ex-name">${item.main.name}</div>
                                <div class="ex-sets">3 x 8-10</div>
                            </div>
                        </div>
                        <div class="weight-side" onclick="event.stopPropagation()">
                            <input type="number" 
                                   class="weight-input" 
                                   value="${item.weight}" 
                                   inputmode="numeric" 
                                   pattern="[0-9]*"
                                   onclick="this.select()"
                                   onfocus="this.select(); isEditingWeight=true" 
                                   onblur="setTimeout(()=>isEditingWeight=false,200)"
                                   oninput="if(this.value.length>3)this.value=this.value.slice(0,3); updateWeight('${item.rowId}', this.value)">
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

function handleCardClick(id, event) {
    // Если клавиатура открыта, закрываем её и не засчитываем тап по карточке
    if (isEditingWeight) {
        document.querySelectorAll('input').forEach(i => i.blur());
        return;
    }
    
    // Обычная логика выполнения
    if (completedIds.includes(id)) {
        completedIds = completedIds.filter(i => i !== id);
    } else {
        completedIds.push(id);
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    localStorage.setItem('completed_exercises', JSON.stringify(completedIds));
    render();
}

// ... (остальные функции loadData, openDayPicker и т.д. без изменений)
