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
                            <div class="img-box"><img src="${item.main.img}"></div>
                            <div class="info-content">
                                <div class="muscle-row">${item.main.muscle}</div>
                                <div class="ex-name">${item.main.name}</div>
                                <div class="ex-sets">3 x 8-10</div>
                            </div>
                        </div>
                        <div class="weight-side" onclick="event.stopPropagation()">
                            <input type="number" class="weight-input" value="${item.weight}" 
                                   inputmode="decimal"
                                   pattern="[0-9]*"
                                   oninput="if(this.value.length>3)this.value=this.value.slice(0,3)"
                                   onfocus="isEditingWeight=true" 
                                   onblur="setTimeout(()=>isEditingWeight=false,150)"
                                   onchange="updateWeight('${item.rowId}', this.value)">
                            <div class="weight-done-btn" onclick="this.previousElementSibling.blur()">ГОТОВО</div>
                            <div class="w-label">КГ</div>
                        </div>
                        <div class="info-btn" onclick="openInfo('${item.rowId}', event)">i</div>
                    </div>`;
            });
        }
    });
    list.innerHTML = html || '<p style="text-align:center; color:gray; font-family:Tiny5;">НЕТ ДАННЫХ</p>';
    updateProgress();
}
