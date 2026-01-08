/**
 * --- 音響システム ---
 */
const AudioSys = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.startBGM();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    playTone: function(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    playNoise: function(duration, vol = 0.2) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    },
    startBGM: function() {
        const loop = () => {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            if(Math.floor(t*4)%8==0) this.playTone(200, 'triangle', 0.1, 0.05);
            setTimeout(loop, 250);
        };
        loop();
    },
    seJump: function() { this.playTone(300, 'square', 0.1, 0.1); },
    seShoot: function() { this.playNoise(0.1, 0.1); },
    seExplosion: function() { this.playNoise(0.3, 0.2); },
    seClear: function() { 
        this.playTone(523, 'sine', 0.2); 
        setTimeout(()=>this.playTone(659, 'sine', 0.2), 200);
        setTimeout(()=>this.playTone(783, 'sine', 0.4), 400);
    },
    seGameOver: function() { this.playTone(100, 'sawtooth', 0.5, 0.2); }
};

/**
 * --- 定数・設定 ---
 */
const TILE_SIZE = 64;
const GRAVITY = 0.6;
const JUMP_POWER = -14;
const SPEED = 6;
const TILESET_SRC = 'tileset.png';
const CHAR_SRC = 'char.png';
const MAP_FILE_SRC = 'stage_data.json';
const ANIM_FILE_SRC = 'animations.json';
const BULLET_SPEED = 12;

const TILE_ID = {
    AIR: 0,
    WALL: 1,
    GROUND: 2,
    SPIKE: 3,
    COIN: 4,
    ENEMY: 5,
    START: 6,
    GOAL: 7
};

// カメラ設定 (動的に変更するためletに変更)
let CANVAS_WIDTH = 900;
let CANVAS_HEIGHT = 500;
let ZOOM_LEVEL = 1.0;

/**
 * --- ゲームの状態 ---
 */
let canvas, ctx;
let mapData = [];
let mapCols = 0;
let mapRows = 0;
let tilesetImage = new Image();
let charImage = new Image();
let animData = {};
let isGameRunning = false;
let camera = { x: 0, y: 0 };

const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowDown: false,
    Space: false,
    KeyB: false
};

const player = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    width: 48, height: 48,
    onGround: false,
    isDead: false,
    isClear: false,
    facingRight: true,
    cooldown: 0,
    state: "idle",
    animTimer: 0,
    frameIndex: 0
};

let enemies = [];
let bullets = [];

/**
 * --- 初期化処理 ---
 */
window.onload = () => {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    tilesetImage.src = TILESET_SRC;
    charImage.src = CHAR_SRC;

    document.getElementById('file-input').addEventListener('change', manualLoadMap);
    
    window.addEventListener('keydown', (e) => {
        // キーボード操作時は音を有効化
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
    window.addEventListener('resize', fitWindow);

    // アニメーションデータ読み込み
    fetch(ANIM_FILE_SRC)
        .then(res => res.json())
        .then(data => {
            animData = data;
            tryAutoLoad();
        })
        .catch(() => {
            console.warn("アニメーションデータなし");
            tryAutoLoad();
        });
};

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
    updateCamera();
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
    // UIコンテナ(160px)も含めた全体の高さを考慮
    // ゲーム画面(500) + UI(160) = 660
    const totalHeight = CANVAS_HEIGHT + 160; 
    const totalWidth = CANVAS_WIDTH; // 900

    const scaleX = (window.innerWidth - 20) / totalWidth;
    const scaleY = (window.innerHeight - 20) / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    
    wrapper.style.transform = `scale(${scale})`;
}

function tryAutoLoad() {
    fetch(MAP_FILE_SRC)
        .then(res => {
            if(!res.ok) throw new Error();
            return res.json();
        })
        .then(data => initGameWithData(data))
        .catch(() => {
            document.getElementById('screen-load').style.display = 'flex';
        });
}

function manualLoadMap(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target.result);
            initGameWithData(json);
        } catch {
            alert("読み込み失敗");
        }
    };
    reader.readAsText(file);
}

function initGameWithData(json) {
    let loadedMap = json.map || json.data;
    mapCols = json.width;
    mapRows = json.height;

    mapData = [];
    for(let y=0; y<mapRows; y++) {
        const row = [];
        for(let x=0; x<mapCols; x++) {
            let cell = loadedMap[y][x];
            if (typeof cell === 'number') {
                cell = { id: cell, rot: 0, fx: false, fy: false };
            }
            row.push(cell);
        }
        mapData.push(row);
    }

    document.getElementById('screen-load').style.display = 'none';
    setupGame();
}

function setupGame() {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    
    // コンテナサイズも更新
    const container = document.getElementById('game-container');
    container.style.width = CANVAS_WIDTH + "px";
    container.style.height = CANVAS_HEIGHT + "px";
    
    // UIコンテナも連動
    const ui = document.getElementById('ui-container');
    if(ui) ui.style.width = CANVAS_WIDTH + "px";

    fitWindow();

    enemies = [];
    bullets = [];
    scanMapAndSetupObjects();

    isGameRunning = true;
    requestAnimationFrame(gameLoop);
}

function scanMapAndSetupObjects() {
    for (let y = 0; y < mapRows; y++) {
        for (let x = 0; x < mapCols; x++) {
            const cell = mapData[y][x];
            const id = cell.id;

            if (id === TILE_ID.START) {
                player.x = x * TILE_SIZE + (TILE_SIZE - player.width) / 2;
                player.y = y * TILE_SIZE;
                cell.id = TILE_ID.AIR; 
            }
            else if (id === TILE_ID.ENEMY) {
                enemies.push({
                    x: x * TILE_SIZE,
                    y: y * TILE_SIZE,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    vx: 0, vy: 0,
                    onGround: false, isDead: false
                });
                cell.id = TILE_ID.AIR;
            }
        }
    }
    updateCamera();
}

function gameLoop() {
    if (!isGameRunning) return;
    update();
    updateCamera();
    draw();
    requestAnimationFrame(gameLoop);
}

function updateCamera() {
    const viewportW = CANVAS_WIDTH / ZOOM_LEVEL;
    const viewportH = CANVAS_HEIGHT / ZOOM_LEVEL;

    let camX = player.x + player.width / 2 - viewportW / 2;
    let camY = player.y + player.height / 2 - viewportH / 2;

    const mapPixelW = mapCols * TILE_SIZE;
    const mapPixelH = mapRows * TILE_SIZE;

    if (mapPixelW > viewportW) {
        camX = Math.max(0, Math.min(camX, mapPixelW - viewportW));
    } else {
        camX = -(viewportW - mapPixelW) / 2;
    }

    if (mapPixelH > viewportH) {
        camY = Math.max(0, Math.min(camY, mapPixelH - viewportH));
    } else {
        camY = -(viewportH - mapPixelH) / 2;
    }

    camera.x = camX;
    camera.y = camY;
}

function update() {
    if (player.isDead || player.isClear) return;

    let newState = "idle";

    if (keys.ArrowLeft) {
        player.vx = -SPEED;
        player.facingRight = false;
        newState = "run";
    } else if (keys.ArrowRight) {
        player.vx = SPEED;
        player.facingRight = true;
        newState = "run";
    } else {
        player.vx = 0;
    }

    if (keys.Space && player.onGround) {
        player.vy = JUMP_POWER;
        player.onGround = false;
        AudioSys.seJump();
    }

    if (!player.onGround) {
        newState = "jump";
    } else if (keys.ArrowDown) {
        player.vx = 0;
        newState = "crouch";
    }

    if (player.state !== newState) {
        player.state = newState;
        player.animTimer = 0;
        player.frameIndex = 0;
    }

    if (animData[player.state]) {
        const anim = animData[player.state];
        player.animTimer++;
        const interval = 60 / anim.fps;
        if (player.animTimer >= interval) {
            player.animTimer = 0;
            player.frameIndex++;
            if (player.frameIndex >= anim.frames.length) {
                if (anim.loop) player.frameIndex = 0;
                else player.frameIndex = anim.frames.length - 1;
            }
        }
    }

    player.x += player.vx;
    checkObjectCollisionX(player);

    if (keys.KeyB && player.cooldown <= 0) {
        shootBullet();
        player.cooldown = 20;
    }
    if (player.cooldown > 0) player.cooldown--;

    player.vy += GRAVITY;
    player.y += player.vy;
    player.onGround = false;
    checkObjectCollisionY(player);

    if (player.y > mapRows * TILE_SIZE) showGameOver();

    updateBullets();
    updateEnemies();
    checkInteraction();
}

function shootBullet() {
    AudioSys.seShoot();
    const vx = player.facingRight ? BULLET_SPEED : -BULLET_SPEED;
    bullets.push({
        x: player.x + player.width / 2 - 4,
        y: player.y + player.height / 2 - 4,
        width: 16, height: 16,
        vx: vx
    });
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        
        if (isSolid(b.x + b.width/2, b.y + b.height/2)) {
            bullets.splice(i, 1);
            continue;
        }
        if (b.x < 0 || b.x > mapCols * TILE_SIZE) {
            bullets.splice(i, 1);
            continue;
        }
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (checkRectCollision(b, enemies[j])) {
                AudioSys.seExplosion();
                enemies.splice(j, 1);
                bullets.splice(i, 1);
                break;
            }
        }
    }
}

function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.onGround) {
            e.vy = -6; 
            e.onGround = false;
        }
        e.vy += GRAVITY;
        e.y += e.vy;
        e.onGround = false;
        checkObjectCollisionY(e);
        if (e.y > mapRows * TILE_SIZE) enemies.splice(i, 1);
    }
}

function isSolid(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return false;
    
    const id = mapData[row][col].id;
    return id === TILE_ID.WALL || id === TILE_ID.GROUND;
}

function checkObjectCollisionX(obj) {
    const padding = 4;
    const left = obj.x;
    const right = obj.x + obj.width;
    const top = obj.y + padding;
    const bottom = obj.y + obj.height - padding;

    if (isSolid(left, top) || isSolid(left, bottom)) {
        obj.x = (Math.floor(left / TILE_SIZE) + 1) * TILE_SIZE;
        obj.vx = 0;
    } else if (isSolid(right, top) || isSolid(right, bottom)) {
        obj.x = Math.floor(right / TILE_SIZE) * TILE_SIZE - obj.width;
        obj.vx = 0;
    }
}

function checkObjectCollisionY(obj) {
    const padding = 4;
    const left = obj.x + padding;
    const right = obj.x + obj.width - padding;
    const top = obj.y;
    const bottom = obj.y + obj.height;

    if (obj.vy < 0) {
        if (isSolid(left, top) || isSolid(right, top)) {
            obj.y = (Math.floor(top / TILE_SIZE) + 1) * TILE_SIZE;
            obj.vy = 0;
        }
    } else if (obj.vy > 0) {
        if (isSolid(left, bottom) || isSolid(right, bottom)) {
            obj.y = Math.floor(bottom / TILE_SIZE) * TILE_SIZE - obj.height;
            obj.vy = 0;
            obj.onGround = true;
        }
    }
}

function checkInteraction() {
    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const col = Math.floor(centerX / TILE_SIZE);
    const row = Math.floor(centerY / TILE_SIZE);

    if (row >= 0 && row < mapRows && col >= 0 && col < mapCols) {
        const cell = mapData[row][col];
        const id = cell.id;
        
        if (id === TILE_ID.SPIKE) showGameOver();
        else if (id === TILE_ID.GOAL) showGameClear();
        else if (id === TILE_ID.COIN) {
            cell.id = TILE_ID.AIR; 
            AudioSys.playTone(1000, 'sine', 0.1);
        }
    }

    for (const e of enemies) {
        if (checkRectCollision(player, e)) {
            showGameOver();
        }
    }
}

function checkRectCollision(r1, r2) {
    return r1.x < r2.x + r2.width &&
           r1.x + r1.width > r2.x &&
           r1.y < r2.y + r2.height &&
           r1.y + r1.height > r2.y;
}

function showGameOver() {
    if (player.isDead) return;
    player.isDead = true;
    AudioSys.seGameOver();
    document.getElementById('screen-gameover').style.display = 'flex';
}

function showGameClear() {
    if (player.isClear) return;
    player.isClear = true;
    AudioSys.seClear();
    document.getElementById('screen-clear').style.display = 'flex';
}

function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    ctx.scale(ZOOM_LEVEL, ZOOM_LEVEL);
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    for (let y = 0; y < mapRows; y++) {
        for (let x = 0; x < mapCols; x++) {
            const cell = mapData[y][x];
            if (cell.id !== TILE_ID.AIR) {
                drawTile(x * TILE_SIZE, y * TILE_SIZE, cell);
            }
        }
    }

    for (const e of enemies) {
        ctx.drawImage(
            tilesetImage,
            TILE_ID.ENEMY * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE,
            e.x, e.y, e.width, e.height
        );
    }

    ctx.fillStyle = '#ffec47';
    for (const b of bullets) {
        ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    drawPlayer();
    
    ctx.restore();
}

function drawPlayer() {
    let frame = { x: 0, y: 0, w: TILE_SIZE, h: TILE_SIZE };
    
    if (animData[player.state] && animData[player.state].frames.length > 0) {
        const anim = animData[player.state];
        frame = anim.frames[player.frameIndex % anim.frames.length];
    } else {
        ctx.drawImage(
            tilesetImage,
            TILE_ID.START * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE,
            player.x, player.y, player.width, player.height
        );
        return;
    }

    ctx.save();
    ctx.translate(player.x + player.width/2, player.y + player.height/2);
    
    if (!player.facingRight) {
        ctx.scale(-1, 1);
    }

    const srcImg = charImage.complete ? charImage : tilesetImage;
    
    ctx.drawImage(
        srcImg,
        frame.x, frame.y, frame.w, frame.h,
        -frame.w / 2, -frame.h / 2, frame.w, frame.h
    );

    ctx.restore();
}

function drawTile(px, py, cell) {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cell.rot * Math.PI / 180);
    const scaleX = cell.fx ? -1 : 1;
    const scaleY = cell.fy ? -1 : 1;
    ctx.scale(scaleX, scaleY);
    
    ctx.drawImage(
        tilesetImage,
        cell.id * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE,
        -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE
    );
    
    ctx.restore();
}