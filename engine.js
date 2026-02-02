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
    KeyB: false,
    KeyC: false
};

// ★追加: ポインター入力管理 (マルチタッチ対応)
const Input = {
    x: 0,
    y: 0,
    isDown: false,
    isJustPressed: false,
    touches: [], // {x, y, isJustPressed, id} の配列
    _pressedThisFrame: false,

    update: function () {
        this.isJustPressed = this._pressedThisFrame;
        this._pressedThisFrame = false;
        // 各タッチのisJustPressedをリセット
        for (let t of this.touches) {
            t.isJustPressed = false;
        }
    },

    reset: function () {
        this.isJustPressed = false;
        this._pressedThisFrame = false;
        for (let t of this.touches) {
            t.isJustPressed = false;
        }
    },

    updatePosition: function (clientX, clientY) {
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }
};

// --- 入力処理 ---
function setupControls() {
    window.addEventListener('keydown', (e) => {
        // BGM再生トリガー
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
        if (e.code === 'KeyC') keys.KeyC = true;
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') keys.Space = false;
        if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
        if (e.code === 'ArrowRight') keys.ArrowRight = false;
        if (e.code === 'ArrowDown') keys.ArrowDown = false;
        if (e.code === 'KeyB' || e.code === 'KeyZ') keys.KeyB = false;
        if (e.code === 'KeyC') keys.KeyC = false;
    });

    // --- マウス入力 ---
    window.addEventListener('mousedown', (e) => {
        Input.isDown = true;
        Input._pressedThisFrame = true;
        const pos = Input.updatePosition(e.clientX, e.clientY);
        Input.x = pos.x;
        Input.y = pos.y;
        if (typeof AudioSys !== 'undefined') AudioSys.init();
    });
    window.addEventListener('mousemove', (e) => {
        const pos = Input.updatePosition(e.clientX, e.clientY);
        Input.x = pos.x;
        Input.y = pos.y;
    });
    window.addEventListener('mouseup', () => {
        Input.isDown = false;
    });

    // --- スマホ用マルチタッチ ---
    const onTouchStart = (e) => {
        if (e.cancelable) e.preventDefault();
        if (typeof AudioSys !== 'undefined') AudioSys.init();

        Input.isDown = true;
        Input._pressedThisFrame = true;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const pos = Input.updatePosition(t.clientX, t.clientY);
            Input.touches.push({
                id: t.identifier,
                x: pos.x,
                y: pos.y,
                isJustPressed: true
            });
            // 互換性のためのメイン座標更新
            if (i === 0) {
                Input.x = pos.x;
                Input.y = pos.y;
            }
        }
    };

    const onTouchMove = (e) => {
        if (e.cancelable) e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const pos = Input.updatePosition(t.clientX, t.clientY);
            const found = Input.touches.find(it => it.id === t.identifier);
            if (found) {
                found.x = pos.x;
                found.y = pos.y;
            }

            // 互換性のためにメイン座標も更新 (最後に動かした指の座標にする)
            Input.x = pos.x;
            Input.y = pos.y;
        }
    };

    const onTouchEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const idx = Input.touches.findIndex(it => it.id === t.identifier);
            if (idx !== -1) {
                Input.touches.splice(idx, 1);
            }
        }
        if (Input.touches.length === 0) {
            Input.isDown = false;
        }
    };

    setTimeout(() => {
        if (canvas) {
            canvas.addEventListener('touchstart', onTouchStart, { passive: false });
            canvas.addEventListener('touchmove', onTouchMove, { passive: false });
            canvas.addEventListener('touchend', onTouchEnd);
            canvas.addEventListener('touchcancel', onTouchEnd);
        }
    }, 500);

    setupTouchControls();
}

function setupTouchControls() {
    const bindTouch = (id, code) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        // ブラウザのジェスチャー（スクロール、ズーム）を完全に無効化
        btn.style.touchAction = 'none';
        btn.style.userSelect = 'none';
        btn.style.webkitUserSelect = 'none';

        // タッチIDを追跡するための変数
        let activeTouchId = null;

        const down = (e) => {
            if (e.cancelable) e.preventDefault();

            // すでにこのボタンが別の指で押されている場合は無視
            if (activeTouchId !== null) return;

            // 新しく触れた指のIDを記憶
            if (e.changedTouches) {
                activeTouchId = e.changedTouches[0].identifier;
            }

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

            if (e.changedTouches) {
                // 離れた指が、このボタンを押し始めた指と同じか確認
                let match = false;
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === activeTouchId) {
                        match = true;
                        break;
                    }
                }
                if (!match) return; // 別の指が離れただけなら無視
            }

            activeTouchId = null;
            keys[code] = false;
            btn.classList.remove('active');
        };

        // タッチイベント
        btn.addEventListener('touchstart', down, { passive: false });
        btn.addEventListener('touchend', up, { passive: false });
        btn.addEventListener('touchcancel', up, { passive: false }); // iPadでの中断対策

        // マウスイベント（PC用）
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // 左クリック以外除外
            keys[code] = true;
            btn.classList.add('active');
        });
        const mouseUp = () => {
            keys[code] = false;
            btn.classList.remove('active');
        };
        btn.addEventListener('mouseup', mouseUp);
        btn.addEventListener('mouseleave', mouseUp);
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
    if (typeof updateCamera === 'function') updateCamera();
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

function toggleMute() {
    AudioSys.isMuted = !AudioSys.isMuted;
    if (AudioSys.ctx) {
        if (AudioSys.isMuted) {
            AudioSys.ctx.suspend();
        } else {
            AudioSys.ctx.resume();
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
    const totalHeight = CANVAS_HEIGHT;
    const totalWidth = CANVAS_WIDTH;

    const scaleX = window.innerWidth / totalWidth;
    const scaleY = window.innerHeight / totalHeight;
    const scale = Math.min(scaleX, scaleY);

    wrapper.style.transform = `scale(${scale})`;
}

// --- 衝突判定ユーティリティ ---
function checkRectCollision(r1, r2) {
    return r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y;
}