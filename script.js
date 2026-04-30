:root {
    --bg: #0d0d0d;
    --card: #1C1C1E;
    --accent: #9ED153;
    --gray-text: #8E8E93;
    --safe-top: env(safe-area-inset-top, 44px);
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
body { background: var(--bg); color: #fff; font-family: 'Manrope', sans-serif; margin: 0; overflow: hidden; }

/* КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ МОРГАНИЯ */
body.js-loading .sticky-header,
body.js-loading .content-scroll {
    display: none !important;
}

/* Лоадер: всегда сверху */
.loader { 
    position: fixed; inset: 0; background: var(--bg); 
    display: flex; flex-direction: column; align-items: center; justify-content: center; 
    z-index: 9999; 
}
.bicep-emoji { font-size: 60px; animation: bicep-squeeze 0.6s infinite alternate ease-in-out; }
@keyframes bicep-squeeze { 0% { transform: scale(1) rotate(0deg); } 100% { transform: scale(0.85, 1.1) rotate(10deg); } }
.loader-text-tiny { font-family: 'Tiny5'; color: var(--accent); font-size: 16px; margin-top: 10px; letter-spacing: 1px; opacity: 0.8; }

/* Хедер */
.sticky-header { position: fixed; top: 0; left: 0; right: 0; background: var(--bg); z-index: 100; padding-top: var(--safe-top); padding-bottom: 10px; }
.header-content { padding: 0 16px; display: flex; flex-direction: column; align-items: center; }
.day-selector-trigger { cursor: pointer; display: flex; flex-direction: column; align-items: center; z-index: 110; }
#day-display { font-family: 'Tiny5'; font-size: 64px; color: var(--accent); line-height: 1; }
.arrow-down { color: var(--gray-text); font-size: 14px; margin-top: -8px; }

.progress-section { width: 100%; margin-top: 10px; margin-bottom: 20px; }
#progress-text { font-size: 10px; font-weight: 800; color: var(--gray-text); letter-spacing: 1px; display: block; margin-bottom: 6px; }
.progress-bg { height: 6px; background: #2C2C2E; border-radius: 10px; overflow: hidden; }
#progress-fill { height: 100%; background: var(--accent); width: 0%; transition: 0.5s ease; }

/* Карточки */
.content-scroll { height: 100vh; overflow-y: auto; padding: calc(var(--safe-top) + 145px) 16px 120px 16px; }
.card { 
    position: relative; background: var(--card); border-radius: 38px; 
    min-height: 150px; display: flex; align-items: center; 
    padding: 16px; margin-bottom: 16px; transition: 0.3s; overflow: hidden; 
}

.card.done .card-inner-content, .card.done .weight-side, .card.done .info-btn { filter: grayscale(100%) blur(1.9px); }
.card.done::before { 
    content: ""; position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); 
    z-index: 1; pointer-events: none; 
}

.card-inner-content { display: flex; align-items: center; width: 100%; z-index: 2; }
.img-box { width: 118px; height: 118px; border-radius: 28px; overflow: hidden; flex-shrink: 0; background: #fff; }
.img-box img { width: 100%; height: 100%; object-fit: contain; }

.info-content { margin-left: 16px; flex-grow: 1; padding-right: 60px; }
.muscle-row { font-size: 10px; font-family: 'Manrope'; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; }
.muscle-main { color: #648337; }
.muscle-sub { color: var(--gray-text); }

.ex-name { font-family: 'Geist'; font-size: 14px; font-weight: 600; line-height: 1.2; color: #fff; margin-bottom: 8px; }
.ex-sets { font-family: 'Manrope'; font-size: 10px; color: var(--gray-text); letter-spacing: -0.02em; }

.weight-side { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 55px; text-align: center; z-index: 10; }
.weight-input { background: transparent; border: none; color: var(--accent); font-family: 'Manrope'; font-weight: 800; font-size: 20px; width: 100%; text-align: center; padding: 0; }
.w-label { font-size: 10px; color: var(--gray-text); font-weight: 800; margin-top: -2px; }

.info-btn { position: absolute; top: 16px; right: 16px; color: var(--gray-text); font-family: 'Tiny5'; font-size: 18px; opacity: 0.5; z-index: 15; padding: 5px; }

.section-title { font-size: 10px; color: #C6624A; letter-spacing: 2px; text-transform: uppercase; margin: 25px 0 12px 4px; font-weight: 800; }
.btn-finish-capsule { width: 100%; padding: 20px; background: var(--accent); color: #000; border-radius: 100px; font-family: 'Tiny5'; font-size: 18px; border: none; margin-top: 20px; }
.footer-padding { padding-bottom: 80px; }

.hidden { display: none !important; }
.modal-overlay, .info-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; align-items: flex-end; }
.bottom-sheet { width: 100%; background: #1C1C1E; border-radius: 24px 24px 0 0; padding: 20px 20px 40px 20px; }
.days-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; padding: 20px 0; }
.day-option { background: #2C2C2E; padding: 20px; border-radius: 18px; text-align: center; font-family: 'Tiny5'; font-size: 24px; color: var(--accent); }
.info-container { width: 100%; height: 100%; background: var(--bg); padding: 20px; padding-top: var(--safe-top); }
.info-nav { font-family: 'Tiny5'; color: var(--accent); font-size: 20px; margin-bottom: 20px; }
