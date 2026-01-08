// カメラ設定
let CANVAS_WIDTH = 900;
let CANVAS_HEIGHT = 500;
let ZOOM_LEVEL = 1.0;

let canvas, ctx;
let isGameRunning = false;
let camera = { x: 0, y: 0 };

const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowDown: false,
    Space: false,
    KeyB: false
};

// --- 入力処理 ---
function setupControls() {
    window.addEventListener('keydown', (e) => {
        AudioSys.init();
        if (e.code === 'Space') keys.Space = true;
        if (e.code === 'ArrowLeft') keys.ArrowLeft = true;
        if (e.code === 'ArrowRight') keys.ArrowRight = true;
        if (e.code === 'ArrowDown') keys.ArrowDown = true;
        if (e.code === 'KeyB' || e.code === 'KeyZ') keys.KeyB = true;
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') keys.Space = false;
        if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
        if (e.code === 'ArrowRight') keys.ArrowRight = false;
        if (e.code === 'ArrowDown') keys.ArrowDown = false;
        if (e.code === 'KeyB' || e.code === 'KeyZ') keys.KeyB = false;
    });
    setupTouchControls();
}

function setupTouchControls() {
    const bindTouch = (id, code) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const down = (e) => {
            if(e.cancelable) e.preventDefault();
            AudioSys.init();
            keys[code] = true;
            btn.classList.add('active');
        };
        const up = (e) => {
            if(e.cancelable) e.preventDefault();
            keys[code] = false;
            btn.classList.remove('active');
        };
        btn.addEventListener('touchstart', down, {passive: false});
        btn.addEventListener('touchend', up);
        btn.addEventListener('mousedown', down);
        btn.addEventListener('mouseup', up);
        btn.addEventListener('mouseleave', up);
    };

    bindTouch('btn-left', 'ArrowLeft');
    bindTouch('btn-right', 'ArrowRight');
    bindTouch('btn-down', 'ArrowDown');
    bindTouch('btn-jump', 'Space');
    bindTouch('btn-attack', 'KeyB');

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => changeZoom(0.1));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => changeZoom(-0.1));
    document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullScreen);
    document.getElementById('btn-mute')?.addEventListener('click', toggleMute);
}

function changeZoom(delta) {
    ZOOM_LEVEL = Math.max(0.5, Math.min(3.0, ZOOM_LEVEL + delta));
    updateCamera(); // game.jsで定義
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

let isMuted = false;
function toggleMute() {
    isMuted = !isMuted;
    if(AudioSys.ctx) {
        if(isMuted) AudioSys.ctx.suspend();
        else AudioSys.ctx.resume();
    }
    const btn = document.getElementById('btn-mute');
    btn.textContent = isMuted ? "🔇" : "🔊";
}

function fitWindow() {
    const wrapper = document.getElementById('main-wrapper');
    const totalHeight = CANVAS_HEIGHT + 160; 
    const totalWidth = CANVAS_WIDTH;
    const scaleX = (window.innerWidth - 20) / totalWidth;
    const scaleY = (window.innerHeight - 20) / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    wrapper.style.transform = `scale(${scale})`;
}

// --- 衝突判定ユーティリティ ---
function checkRectCollision(r1, r2) {
    return r1.x < r2.x + r2.width &&
           r1.x + r1.width > r2.x &&
           r1.y < r2.y + r2.height &&
           r1.y + r1.height > r2.y;
}