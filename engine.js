// カメラ設定
let CANVAS_WIDTH = 1000;
let CANVAS_HEIGHT = 600;
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
        // ★修正: BGM再生トリガーを追加
        AudioSys.init();
        if (typeof AudioSys.playBGM === 'function' && !AudioSys.bgmSource && !AudioSys.isMuted) {
            const bgmName = (typeof isAtelierMode !== 'undefined' && isAtelierMode) ? 'atelier' : 'forest';
            AudioSys.playBGM(bgmName, 0.3);
        }

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
            if (e.cancelable) e.preventDefault();

            // ★修正: BGM再生トリガーを追加
            AudioSys.init();
            if (typeof AudioSys.playBGM === 'function' && !AudioSys.bgmSource && !AudioSys.isMuted) {
                const bgmName = (typeof isAtelierMode !== 'undefined' && isAtelierMode) ? 'atelier' : 'forest';
                AudioSys.playBGM(bgmName, 0.3);
            }

            keys[code] = true;
            btn.classList.add('active');
        };

        const up = (e) => {
            if (e.cancelable) e.preventDefault();
            keys[code] = false;
            btn.classList.remove('active');
        };

        btn.addEventListener('touchstart', down, { passive: false });
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

// let isMuted = false; // 削除: AudioSys.isMutedを使用
function toggleMute() {
    AudioSys.isMuted = !AudioSys.isMuted;
    if (AudioSys.ctx) {
        if (AudioSys.isMuted) {
            AudioSys.ctx.suspend();
        } else {
            AudioSys.ctx.resume();
            // ミュート解除時に再生されていなければ再生
            if (typeof AudioSys.playBGM === 'function' && !AudioSys.bgmSource) {
                const bgmName = (typeof isAtelierMode !== 'undefined' && isAtelierMode) ? 'atelier' : 'forest';
                AudioSys.playBGM(bgmName, 0.3);
            }
        }
    }
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = AudioSys.isMuted ? "🔇" : "🔊";
}

function fitWindow() {
    const wrapper = document.getElementById('main-wrapper');
    // UIパネル分の高さ加算(+160)を削除し、純粋にCanvasサイズで計算
    const totalHeight = CANVAS_HEIGHT;
    const totalWidth = CANVAS_WIDTH;

    // ウィンドウサイズに合わせてスケール計算
    const scaleX = window.innerWidth / totalWidth;
    const scaleY = window.innerHeight / totalHeight;
    const scale = Math.min(scaleX, scaleY); // 画面に収まる最大サイズ

    wrapper.style.transform = `scale(${scale})`;
}

// --- 衝突判定ユーティリティ ---
function checkRectCollision(r1, r2) {
    return r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y;
}