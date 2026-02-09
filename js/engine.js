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
    window.addEventListener('resize', fitWindow);

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

    // --- スマホ用マルチタッチ (Inputオブジェクト用) ---
    // ここではInputオブジェクトの状態更新のみを行う
    const onTouchStart = (e) => {
        // ここでのpreventDefaultは削除（setupTouchControls側で一括管理するため）
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
            if (i === 0) {
                Input.x = pos.x;
                Input.y = pos.y;
            }
        }
    };

    const onTouchMove = (e) => {
        // preventDefaultはsetupTouchControlsで行う
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const pos = Input.updatePosition(t.clientX, t.clientY);
            const found = Input.touches.find(it => it.id === t.identifier);
            if (found) {
                found.x = pos.x;
                found.y = pos.y;
            }
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
            // passive: false は preventDefault() を呼ぶために必須
            canvas.addEventListener('touchstart', onTouchStart, { passive: false });
            canvas.addEventListener('touchmove', onTouchMove, { passive: false });
            canvas.addEventListener('touchend', onTouchEnd);
            canvas.addEventListener('touchcancel', onTouchEnd);
        }
    }, 500);

    setupTouchControls();
}

function setupTouchControls() {
    const btnIds = ['btn-left', 'btn-right', 'btn-down', 'btn-jump', 'btn-attack'];
    const keyMap = {
        'btn-left': 'ArrowLeft',
        'btn-right': 'ArrowRight',
        'btn-down': 'ArrowDown',
        'btn-jump': 'Space',
        'btn-attack': 'KeyB'
    };

    // ボタン要素を取得
    const getButtons = () => {
        return btnIds.map(id => {
            const el = document.getElementById(id);
            return el ? { id, el, key: keyMap[id] } : null;
        }).filter(b => b !== null);
    };

    // ★重要: タッチ座標とボタンの当たり判定を行うロジック
    const updateKeysFromTouches = (touches) => {
        const buttons = getButtons();
        
        // 一旦すべてのバーチャルキーをOFFにする
        buttons.forEach(btn => {
            keys[btn.key] = false;
            btn.el.classList.remove('active');
        });

        // 現在画面にある全ての指について判定
        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            const tx = t.clientX;
            const ty = t.clientY;

            buttons.forEach(btn => {
                const rect = btn.el.getBoundingClientRect();
                // 操作性を良くするため、当たり判定を少し広げる (margin: 25px)
                const margin = 25;
                
                if (tx >= rect.left - margin && tx <= rect.right + margin &&
                    ty >= rect.top - margin && ty <= rect.bottom + margin) {
                    
                    keys[btn.key] = true;
                    btn.el.classList.add('active');
                    
                    // 初回タッチ時のオーディオ初期化
                    AudioSys.init();
                    if (typeof AudioSys.playBGM === 'function' && !AudioSys.bgmSource && !AudioSys.isMuted) {
                        const bgmName = (typeof isAtelierMode !== 'undefined' && isAtelierMode) ? 'atelier' : 'forest';
                        AudioSys.playBGM(bgmName, 0.3);
                    }
                }
            });
        }
    };

    // タッチイベントハンドラ (画面全体で監視)
    const handleGlobalTouch = (e) => {
        // ブラウザのスクロールやズーム、テキスト選択を防止
        if (e.cancelable) e.preventDefault();
        updateKeysFromTouches(e.touches);
    };

    // windowに対してイベントを設定し、どこを触っていても判定できるようにする
    // これにより「ボタンから指が外れた」判定を確実に追跡できる
    window.addEventListener('touchstart', handleGlobalTouch, { passive: false });
    window.addEventListener('touchmove', handleGlobalTouch, { passive: false });
    window.addEventListener('touchend', handleGlobalTouch, { passive: false });
    window.addEventListener('touchcancel', handleGlobalTouch, { passive: false });

    // CSS側のタッチアクション無効化もJSで補強
    btnIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.touchAction = 'none';
            el.style.userSelect = 'none';
            el.style.webkitUserSelect = 'none';
        }
    });

    // --- PCマウス操作用 (デバッグ・PCプレイ用) ---
    // タッチデバイスでは touchstart 等で preventDefault されるため、
    // ここでの mousedown は発火しない想定だが、PC操作用に残す。
    buttons.forEach(btn => {
        if (!btn) return;
        btn.el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            keys[btn.key] = true;
            btn.el.classList.add('active');
        });
    });

    window.addEventListener('mouseup', () => {
        buttons.forEach(btn => {
            if (keys[btn.key]) {
                keys[btn.key] = false;
                btn.el.classList.remove('active');
            }
        });
    });

    // 機能ボタン (クリックイベント)
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