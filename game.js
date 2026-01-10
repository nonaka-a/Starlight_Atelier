/**
 * --- ゲームの状態 ---
 */
// mapData は [BGレイヤー, Mainレイヤー, FGレイヤー] の配列
let mapData = [];
let mapCols = 0;
let mapRows = 0;
let tileDefs = {};

// 定数は constants.js で定義済み

const BG_SRC = 'image/BG01.jpg'; // 背景画像のパス
const BGM_SRC = 'sounds/stage_bgm1.mp3'; // ★追加: BGMのパス

let tilesetImage = new Image();
let charImage = new Image();
let bgImage = new Image(); // 背景画像オブジェクト
let animData = {};

// ★追加: リトライ用に読み込んだレベルデータを保持する変数
let currentLevelData = null;

// ★追加: ゲームループのID管理用（倍速バグ防止）
let gameLoopId = null;

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
    frameIndex: 0,
    dropTimer: 0,
    downPressTime: 0 // 長押し計測用
};

let enemies = [];
let bullets = [];
let score = 0;

/**
 * --- 初期化処理 ---
 */
window.onload = () => {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    tilesetImage.src = TILESET_SRC;
    charImage.src = CHAR_SRC;
    bgImage.src = BG_SRC;

    // ★追加: BGMの読み込みを開始
    if (typeof AudioSys !== 'undefined' && AudioSys.loadBGM) {
        AudioSys.loadBGM(BGM_SRC);
    }

    document.getElementById('file-input').addEventListener('change', manualLoadMap);

    // engine.jsで定義されている setupControls を呼ぶ
    setupControls();
    window.addEventListener('resize', fitWindow);

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

function tryAutoLoad() {
    fetch(MAP_FILE_SRC)
        .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
        })
        .then(data => {
            currentLevelData = data; // ★追加: データを保存
            initGameWithData(data);
        })
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
            currentLevelData = json; // ★追加: データを保存
            initGameWithData(json);
        } catch {
            alert("読み込み失敗");
        }
    };
    reader.readAsText(file);
}

function initGameWithData(json) {
    mapCols = json.width;
    mapRows = json.height;

    tileDefs = {};
    if (json.tileDefs && Array.isArray(json.tileDefs)) {
        json.tileDefs.forEach(def => {
            tileDefs[def.id] = def;
        });
    }

    // ★バグ修正: ID 119 (ゴール旗) がJSONでwall定義されている場合があるので強制上書き
    tileDefs[119] = { id: 119, type: 'goal', solid: false };


    // ★追加: タイルセット画像の動的切り替え
    if (json.tilesetImage) {
        // 画像読み込み完了を待ってからゲーム開始する必要があります
        // (ゲームループ開始後に画像が変わるとチラつく可能性があるため)
        tilesetImage.src = json.tilesetImage;
        tilesetImage.onload = () => {
            finishInitGame(json);
        }
    } else {
        // 設定がない場合はデフォルトを使用（既にwindow.onloadで設定済みだが念のため）
        finishInitGame(json);
    }
}

function finishInitGame(json) {
    mapData = [];
    if (json.layers) {
        const layerNames = ["background", "main", "foreground"];
        for (let i = 0; i < 3; i++) {
            const target = json.layers.find(l => l.name === layerNames[i]);
            if (target) {
                mapData.push(normalizeLayer(target.data, mapCols, mapRows));
            } else {
                mapData.push(createEmptyLayer(mapCols, mapRows));
            }
        }
    } else {
        mapData.push(createEmptyLayer(mapCols, mapRows));
        const rawMap = json.map || json.data;
        mapData.push(normalizeLayer(rawMap, mapCols, mapRows));
        mapData.push(createEmptyLayer(mapCols, mapRows));
    }

    document.getElementById('screen-load').style.display = 'none';
    setupGame();
}

function createEmptyLayer(w, h) {
    const layer = [];
    for (let y = 0; y < h; y++) {
        const row = [];
        for (let x = 0; x < w; x++) row.push({ id: 0, rot: 0, fx: false, fy: false });
        layer.push(row);
    }
    return layer;
}

function normalizeLayer(data, w, h) {
    const layer = [];
    for (let y = 0; y < h; y++) {
        const row = [];
        for (let x = 0; x < w; x++) {
            let cell = data[y][x];
            // ★修正: 元データを変更しないよう、必ず新しいオブジェクトとしてコピーする
            if (typeof cell === 'number') {
                cell = { id: cell, rot: 0, fx: false, fy: false };
            } else {
                // 既存オブジェクトの場合もコピーを作成して参照を切る
                cell = {
                    id: cell.id,
                    rot: cell.rot || 0,
                    fx: cell.fx || false,
                    fy: cell.fy || false
                };
            }
            row.push(cell);
        }
        layer.push(row);
    }
    return layer;
}

function getTileProp(id) {
    if (tileDefs[id]) return tileDefs[id];
    const type = DEFAULT_ID_TYPE[id] || 'air';
    const solid = (type === 'wall' || type === 'ground');
    return { id, type, solid };
}

function getTileId(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return null;
    return mapData[1][row][col].id;
}

function setupGame() {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const container = document.getElementById('game-container');
    container.style.width = CANVAS_WIDTH + "px";
    container.style.height = CANVAS_HEIGHT + "px";

    const ui = document.getElementById('ui-container');
    if (ui) ui.style.width = CANVAS_WIDTH + "px";

    fitWindow();

    score = 0;
    const st = document.getElementById('score-text');
    if (st) st.textContent = score;

    enemies = [];
    bullets = [];
    scanMapAndSetupObjects();

    isGameRunning = true;

    // ★修正: 既存のループがあればキャンセルして二重起動を防止
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

function scanMapAndSetupObjects() {
    const mainLayer = mapData[1];
    for (let y = 0; y < mapRows; y++) {
        for (let x = 0; x < mapCols; x++) {
            const cell = mainLayer[y][x];
            const prop = getTileProp(cell.id);

            if (prop.type === 'start' || cell.id === 118) {
                player.x = x * TILE_SIZE + (TILE_SIZE - player.width) / 2;
                player.y = y * TILE_SIZE;
                cell.id = 0; // マップ上からスタート地点タイルを消す
            }
            else if (prop.type === 'enemy') {
                enemies.push({
                    x: x * TILE_SIZE,
                    y: y * TILE_SIZE,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    vx: 0, vy: 0,
                    onGround: false,
                    isDead: false,
                    tileId: cell.id,
                    rot: cell.rot,
                    fx: cell.fx,
                    fy: cell.fy
                });
                cell.id = 0; // マップ上から敵タイルを消す
            }
        }
    }
    updateCamera();
}

function gameLoop() {
    if (!isGameRunning) return;
    update();
    updateCamera(); // engine.js または game.js 内で定義が必要
    draw();
    // ★修正: ループIDを保存
    gameLoopId = requestAnimationFrame(gameLoop);
}

// engine.js から呼ばれる、または engine.js で定義したものを上書きする形で定義
window.updateCamera = function () {
    const viewportW = CANVAS_WIDTH;
    const viewportH = CANVAS_HEIGHT;

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

    if (player.dropTimer > 0) player.dropTimer--;

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

    // 下キー長押し判定
    if (keys.ArrowDown) {
        player.downPressTime++;

        if (player.onGround && player.downPressTime >= 18) {
            const checkY = player.y + player.height + 2;
            const leftId = getTileId(player.x + 4, checkY);
            const rightId = getTileId(player.x + player.width - 4, checkY);

            if ((leftId && TILE_HITBOX_OFFSET[leftId]) || (rightId && TILE_HITBOX_OFFSET[rightId])) {
                player.y += 1;
                player.dropTimer = 10;
                player.onGround = false;
                player.downPressTime = 0;
            }
        }

        if (player.onGround) {
            player.vx = 0;
            newState = "crouch";
        }
    } else {
        player.downPressTime = 0;
    }

    if (keys.Space && player.onGround) {
        if (keys.ArrowDown) {
            player.vy = JUMP_POWER * 1.4;
            AudioSys.playTone(400, 'square', 0.15, 0.1);
        } else {
            player.vy = JUMP_POWER;
            AudioSys.seJump();
        }
        player.onGround = false;
    }

    if (!player.onGround) {
        newState = "jump";
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

        if (isSolid(b.x + b.width / 2, b.y + b.height / 2)) {
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

function getTileTopY(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return null;

    const id = mapData[1][row][col].id;
    const prop = getTileProp(id);
    if (!prop.solid) return null;

    const offset = TILE_HITBOX_OFFSET[id] || 0;
    return row * TILE_SIZE + offset;
}

function isSolid(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return false;

    const id = mapData[1][row][col].id;
    const prop = getTileProp(id);
    return prop.solid;
}

function isSolidWall(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return false;

    const id = mapData[1][row][col].id;
    const prop = getTileProp(id);

    if (!prop.solid) return false;
    if (TILE_HITBOX_OFFSET[id]) return false;
    return true;
}

function isWall(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return false;

    const id = mapData[1][row][col].id;
    const prop = getTileProp(id);

    if (!prop.solid) return false;
    if (TILE_HITBOX_OFFSET[id]) return false;
    return true;
}

function checkObjectCollisionX(obj) {
    const padding = 4;
    const left = obj.x;
    const right = obj.x + obj.width;
    const top = obj.y + padding;
    const bottom = obj.y + obj.height - padding;

    if (isWall(left, top) || isWall(left, bottom)) {
        obj.x = (Math.floor(left / TILE_SIZE) + 1) * TILE_SIZE;
        obj.vx = 0;
    } else if (isWall(right, top) || isWall(right, bottom)) {
        obj.x = Math.floor(right / TILE_SIZE) * TILE_SIZE - obj.width;
        obj.vx = 0;
    }
}

function checkObjectCollisionY(obj) {
    const padding = 12;
    const left = obj.x + padding;
    const right = obj.x + obj.width - padding;
    const top = obj.y;
    const bottom = obj.y + obj.height;

    if (obj.vy < 0) {
        if (isSolidWall(left, top) || isSolidWall(right, top)) {
            obj.y = (Math.floor(top / TILE_SIZE) + 1) * TILE_SIZE;
            obj.vy = 0;
        }
    }
    else if (obj.vy >= 0) {
        if (obj.dropTimer > 0) return;

        const groundY_L = getTileTopY(left, bottom);
        const groundY_R = getTileTopY(right, bottom);
        let groundY = null;
        if (groundY_L !== null && bottom >= groundY_L) groundY = groundY_L;
        if (groundY_R !== null && bottom >= groundY_R) {
            if (groundY === null || groundY_R < groundY) groundY = groundY_R;
        }

        if (groundY !== null) {
            const maxSnap = Math.max(TILE_SIZE, obj.vy + 10);
            if (bottom <= groundY + maxSnap) {
                obj.y = groundY - obj.height;
                obj.vy = 0;
                obj.onGround = true;
            }
        }
    }
}

function checkTileAt(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);

    if (row >= 0 && row < mapRows && col >= 0 && col < mapCols) {
        const cell = mapData[1][row][col];
        const prop = getTileProp(cell.id);

        if (prop.type === 'spike') {
            showGameOver();
        }
        else if (prop.type === 'goal' || cell.id === 119) {
            showGameClear();
        }
        else if (prop.type === 'item' || prop.type === 'coin') {
            cell.id = 0;
            AudioSys.playTone(1000, 'sine', 0.1);
            score++;
            const st = document.getElementById('score-text');
            if (st) {
                st.textContent = score;
                st.parentElement.style.transform = "scale(1.2)";
                setTimeout(() => st.parentElement.style.transform = "scale(1.0)", 100);
            }
        }
    }
}

function checkInteraction() {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    checkTileAt(cx, cy);
    checkTileAt(cx, player.y + player.height - 2);

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

    // ★追加: 背景画像のパララックス描画（最背面）
    drawBackground();

    ctx.save();
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    drawLayer(0);
    drawLayer(1);

    for (const e of enemies) {
        drawTile(e.x, e.y, { id: e.tileId, rot: e.rot, fx: e.fx, fy: e.fy });
    }
    ctx.fillStyle = '#ffec47';
    for (const b of bullets) {
        ctx.fillRect(b.x, b.y, b.width, b.height);
    }
    drawPlayer();

    drawLayer(2);

    ctx.restore();

    // ★追加: ビネット効果（最前面）
    drawVignette();
}

function drawBackground() {
    if (!bgImage.complete || bgImage.width === 0) return;

    // カメラ移動量の係数（小さいほど遠くにあるように見える）
    const factor = 0.2;

    // ★調整済みサイズ
    const w = 1280;
    const h = 800;

    // カメラ位置に応じたオフセット計算（画像をループさせるための剰余算）
    let offsetX = -(camera.x * factor) % w;
    let offsetY = -(camera.y * factor) % h;

    if (offsetX > 0) offsetX -= w;
    if (offsetY > 0) offsetY -= h;

    for (let x = offsetX; x < CANVAS_WIDTH; x += w) {
        for (let y = offsetY; y < CANVAS_HEIGHT; y += h) {
            ctx.drawImage(bgImage, Math.floor(x), Math.floor(y), w, h);
        }
    }
}

// ★追加: ビネット描画関数（濃さ0.8）
function drawVignette() {
    const w = canvas.width;
    const h = canvas.height;

    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);

    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)'); // 濃さ0.8

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
}

// 欠落していた描画関数群を復元
function drawLayer(layerIndex) {
    if (!mapData[layerIndex]) return;
    const layer = mapData[layerIndex];
    for (let y = 0; y < mapRows; y++) {
        for (let x = 0; x < mapCols; x++) {
            const cell = layer[y][x];
            if (cell.id !== 0) {
                drawTile(x * TILE_SIZE, y * TILE_SIZE, cell);
            }
        }
    }
}

function drawPlayer() {
    let frame = { x: 0, y: 0, w: TILE_SIZE, h: TILE_SIZE };

    if (animData[player.state] && animData[player.state].frames.length > 0) {
        const anim = animData[player.state];
        frame = anim.frames[player.frameIndex % anim.frames.length];
    } else {
        drawTile(player.x, player.y, { id: 6, rot: 0, fx: false, fy: false });
        return;
    }

    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    if (!player.facingRight) ctx.scale(-1, 1);

    const srcImg = charImage.complete ? charImage : tilesetImage;
    ctx.drawImage(
        srcImg,
        frame.x, frame.y, frame.w, frame.h,
        -frame.w / 2, -frame.h / 2, frame.w, frame.h
    );

    ctx.restore();
}

function drawTile(px, py, cell) {
    if (cell.id === 0) return;

    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cell.rot * Math.PI / 180);
    const scaleX = cell.fx ? -1 : 1;
    const scaleY = cell.fy ? -1 : 1;
    ctx.scale(scaleX, scaleY);

    if (tilesetImage.complete && tilesetImage.width > 0) {
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        const srcX = (cell.id % cols) * TILE_SIZE;
        const srcY = Math.floor(cell.id / cols) * TILE_SIZE;

        ctx.drawImage(
            tilesetImage,
            srcX, srcY, TILE_SIZE, TILE_SIZE,
            -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE
        );
    } else {
        ctx.fillStyle = '#888';
        ctx.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    }

    ctx.restore();
}

// ★追加: ゲームリセット関数 (グローバルスコープで呼べるように window に割り当て)
window.resetGame = function () {
    if (!currentLevelData) {
        location.reload(); // データがない場合は通常リロード
        return;
    }

    // 1. フラグのリセット
    player.isDead = false;
    player.isClear = false;
    player.vx = 0;
    player.vy = 0;
    player.cooldown = 0;
    player.state = "idle";
    player.dropTimer = 0;

    isGameRunning = false; // 一旦停止

    // 2. UIを隠す
    document.getElementById('screen-gameover').style.display = 'none';
    document.getElementById('screen-clear').style.display = 'none';

    // 3. マップとオブジェクトの再初期化
    // initGameWithDataを呼ぶと mapDataの再生成と setupGame -> scanMapAndSetupObjects が走る
    initGameWithData(currentLevelData);

    // 4. BGM再開 (止まっていた場合)
    if (typeof AudioSys !== 'undefined' && AudioSys.bgmBuffer && !isMuted) {
        AudioSys.playBGM(0.3);
    }
};