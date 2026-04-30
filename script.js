// Переключение экранов
function showScreen(screenId) {
    tg?.HapticFeedback.impactOccurred('medium');
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// Улучшенная вибрация для дней
function openDayPicker() {
    tg?.HapticFeedback.impactOccurred('light'); // Вибрация при нажатии на А внизу
    document.getElementById('day-picker-overlay').classList.remove('hidden');
}

function changeDay(day) {
    tg?.HapticFeedback.notificationOccurred('success'); // Вибрация при выборе дня
    currentDay = day;
    document.getElementById('current-day-tab').innerText = day;
    closeDayPicker();
    render();
}

// Замена с плавной логикой
function confirmReplace(rowId, newExName) {
    // ... логика смены данных ...
    tg?.HapticFeedback.notificationOccurred('success');
    
    // Плавный возврат
    const modal = document.getElementById('replace-screen');
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.opacity = '1';
        render();
    }, 300);
}

// Модалка "Скоро"
function showSoon() {
    tg?.HapticFeedback.impactOccurred('warning');
    const msg = document.createElement('div');
    msg.className = 'soon-toast';
    msg.innerText = 'Скоро будет доступно!';
    document.body.appendChild(msg);
    
    const close = () => { msg.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 100);
}

// Финиш
function finishWorkout() {
    tg?.HapticFeedback.notificationOccurred('success');
    document.getElementById('finish-modal').classList.remove('hidden');
}

function closeFinish() {
    document.getElementById('finish-modal').classList.add('hidden');
    showScreen('home-screen');
}
