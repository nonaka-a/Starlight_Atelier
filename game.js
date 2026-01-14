

/**
 * --- ゲームの状態 ---
 */
let mapData = [];
let mapCols = 0;
let mapRows = 0;
let tileDefs = {};

const BG_SRC = 'image/BG01.jpg';

let tilesetImage = new Image();
let charImage = new Image();
let bgImage = new Image();
let animData = {};

let currentLevelData = null;
let gameLoopId = null;

let totalItemCount = 0; // ほしのもと累計 (ステージ持ち越し分)
let totalStarCount = 0;
let isAtelierMode = false;
let spawnPoint = { x: 0, y: 0 }; // ★追加: 初期位置保存用

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
    hp: 3,
    maxHp: 3,
    invincible: 0,
    downPressTime: 0
};

let enemies = [];
let bullets = [];
let atelierStations = [];
let score = 0; // 現在のステージ内での「ほしのもと」取得数

/**
 * --- 初期化処理 ---
 */
window.onload = () => {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    tilesetImage.src = TILESET_SRC;
    charImage.src = CHAR_SRC;
    bgImage.src = BG_SRC;

    if (typeof AudioSys !== 'undefined' && AudioSys.loadBGM) {
        AudioSys.loadBGM('forest', FOREST_BGM_SRC);
        AudioSys.loadBGM('atelier', ATELIER_BGM_SRC);
    }

    document.getElementById('file-input').addEventListener('change', manualLoadMap);

    setupControls();
    window.addEventListener('resize', fitWindow);

    // デバッグ: hキーで素材増加
    window.addEventListener('keydown', (e) => {
        if (e.key === 'h' || e.key === 'H') {
            totalItemCount += 5;
            updateScoreDisplay();
        }
    });

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

    // ★追加: 譜面データの自動読み込み
    fetch('json/chart.json')
        .then(res => {
            if (!res.ok) throw new Error("Chart not found");
            return res.json();
        })
        .then(data => {
            if (typeof CraftManager !== 'undefined') {
                CraftManager.loadChart(data);
                console.log("譜面データ(chart.json)を自動読み込みしました");
            }
        })
        .catch(err => {
            console.log("chart.jsonが見つかりませんでした (ランダム生成モード)");
        });
};

function tryAutoLoad() {
    loadStage(ATELIER_MAP_SRC, true);
}

function manualLoadMap(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target.result);
            currentLevelData = json;
            initGameWithData(json);
        } catch {
            alert("読み込み失敗");
        }
    };
    reader.readAsText(file);
}

function updateScoreDisplay() {
    const st = document.getElementById('score-text');
    if (st) {
        // 現在所持数 = ステージ内(score) + 持ち越し(totalItemCount)
        st.textContent = totalItemCount + score;
    }
    const starText = document.getElementById('star-text');
    if (starText) {
        starText.textContent = totalStarCount;
    }
}

function updateHPDisplay() {
    const hpContainer = document.getElementById('hp-counter');
    if (!hpContainer) return;

    hpContainer.innerHTML = '';
    for (let i = 0; i < player.maxHp; i++) {
        const img = document.createElement('img');
        img.src = 'image/heart.png';
        img.className = 'heart-icon';
        if (i >= player.hp) {
            img.style.filter = 'grayscale(100%) opacity(0.3)';
            img.style.animation = 'none';
        }
        hpContainer.appendChild(img);
    }
}

function initGameWithData(json) {
    isGameRunning = false;
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }

    mapCols = json.width;
    mapRows = json.height;

    tileDefs = {};
    if (json.tileDefs && Array.isArray(json.tileDefs)) {
        json.tileDefs.forEach(def => {
            tileDefs[def.id] = def;
        });
    }

    tileDefs[119] = { id: 119, type: 'goal', solid: false };

    return new Promise((resolve) => {
        const onReady = () => {
            finishInitGame(json);
            resolve();
        };

        if (json.tilesetImage) {
            if (tilesetImage.src.includes(json.tilesetImage) && tilesetImage.complete) {
                onReady();
            } else {
                tilesetImage.onload = onReady;
                tilesetImage.onerror = () => {
                    console.error("Tileset image load failed:", json.tilesetImage);
                    onReady();
                };
                tilesetImage.src = json.tilesetImage;

                if (tilesetImage.complete) {
                    tilesetImage.onload = null;
                    onReady();
                }
            }
        } else {
            onReady();
        }

        setTimeout(() => {
            if (!isGameRunning) {
                console.warn("Loading timeout - forcing start");
                onReady();
            }
        }, 3000);
    });
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
            if (typeof cell === 'number') {
                cell = { id: cell, rot: 0, fx: false, fy: false };
            } else {
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
    updateScoreDisplay();
    player.hp = player.maxHp;
    player.invincible = 0;
    updateHPDisplay();

    enemies = [];
    bullets = [];
    scanMapAndSetupObjects();

    isGameRunning = true;

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

function scanMapAndSetupObjects() {
    const mainLayer = mapData[1];
    spawnPoint = { x: 0, y: 0 }; // 初期化

    for (let y = 0; y < mapRows; y++) {
        for (let x = 0; x < mapCols; x++) {
            const cell = mainLayer[y][x];
            const prop = getTileProp(cell.id);

            if (prop.type === 'start' || cell.id === 118) {
                player.x = x * TILE_SIZE + (TILE_SIZE - player.width) / 2;
                player.y = y * TILE_SIZE;

                // ★追加: スタート位置を保存
                spawnPoint.x = player.x;
                spawnPoint.y = player.y;

                cell.id = 0;
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
                cell.id = 0;
            }
            else if ([112, 113, 114, 115].includes(cell.id)) {
                let text = "";
                if (cell.id === 112) text = "さがす";
                if (cell.id === 113) text = "つくる";
                if (cell.id === 114) text = "うちあげる";
                if (cell.id === 115) text = "ほしを見る";

                atelierStations.push({
                    x: x * TILE_SIZE + TILE_SIZE / 2,
                    y: y * TILE_SIZE + TILE_SIZE / 2,
                    text: text,
                    id: cell.id
                });

                cell.id = 0;
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
    gameLoopId = requestAnimationFrame(gameLoop);
}

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
        if (!isAtelierMode) {
            shootBullet();
            player.cooldown = 20;
        }
    }
    if (player.cooldown > 0) player.cooldown--;

    player.vy += GRAVITY;
    player.y += player.vy;
    player.onGround = false;
    checkObjectCollisionY(player);

    if (player.invincible > 0) player.invincible--;

    if (player.y > mapRows * TILE_SIZE) {
        player.hp = 0;
        updateHPDisplay();
        showGameOver();
    }

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

        if (cell.id === 112) {
            if (!player.isClear && !player.isDead) {
                loadStage('json/atume_stage2.json');
            }
            return;
        }
        // ★修正: つくる
        if (cell.id === 113) {
            startCraftMode();
            return;
        }
        if (cell.id === 114) {
            return;
        }

        if (prop.type === 'spike') {
            takeDamage();
        }
        else if (prop.type === 'goal' || cell.id === 119) {
            showGameClear();
        }
        else if (prop.type === 'item' || prop.type === 'coin') {
            cell.id = 0;
            AudioSys.playTone(1000, 'sine', 0.1);
            score++;
            updateScoreDisplay();
            const st = document.getElementById('score-text');
            if (st) {
                st.parentElement.style.transform = "scale(1.2)";
                setTimeout(() => st.parentElement.style.transform = "scale(1.0)", 100);
            }
        }
    }
}

function checkInteraction() {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;

    if (isAtelierMode) {
        for (const st of atelierStations) {
            if (Math.abs(cx - st.x) < TILE_SIZE && Math.abs(cy - st.y) < TILE_SIZE) {
                if (st.id === 112) {
                    if (!player.isClear && !player.isDead) {
                        loadStage('json/atume_stage2.json');
                    }
                    return;
                }
                // ★修正: つくる
                if (st.id === 113) {
                    startCraftMode();
                    return;
                }
            }
        }
    }

    checkTileAt(cx, cy);
    checkTileAt(cx, player.y + player.height - 2);

    for (const e of enemies) {
        if (checkRectCollision(player, e)) {
            takeDamage();
        }
    }
}

function takeDamage() {
    if (player.invincible > 0 || player.isDead || player.isClear) return;

    player.hp--;
    updateHPDisplay();

    if (player.hp <= 0) {
        showGameOver();
    } else {
        AudioSys.playTone(200, 'square', 0.2);
        player.invincible = 60;
    }
}

function showGameOver() {
    if (player.isDead) return;
    player.isDead = true;
    AudioSys.seGameOver();

    score = 0;
    updateScoreDisplay();

    document.getElementById('screen-gameover').style.display = 'flex';
}

function showGameClear() {
    if (player.isClear) return;
    player.isClear = true;
    AudioSys.seClear();

    totalItemCount += score;
    score = 0;
    updateScoreDisplay();

    document.getElementById('screen-clear').style.display = 'flex';
}

function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    ctx.save();
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    drawLayer(0);
    drawLayer(1);

    drawAtelierWindows();

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

    if (!isAtelierMode) {
        drawVignette();
    }
}

function drawAtelierWindows() {
    if (!isAtelierMode) return;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 28px 'M PLUS Rounded 1c', sans-serif";

    for (const st of atelierStations) {
        const x = st.x;
        const y = st.y;

        const w = 180;
        const h = 80;
        const r = 20;

        // 影
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        const offsetX = 6;
        const offsetY = 6;
        ctx.roundRect(x - w / 2 + offsetX, y - h / 2 + offsetY, w, h, r);
        ctx.fill();

        // 窓本体
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
        ctx.fill();

        ctx.lineWidth = 6;
        if (st.id === 115) {
            ctx.strokeStyle = "#8233ff";
            ctx.stroke();
            ctx.fillStyle = "#6622dd";
        } else {
            ctx.strokeStyle = "#ffaa00";
            ctx.stroke();
            ctx.fillStyle = "#e67e22";
        }

        ctx.fillText(st.text, x, y);
    }
    ctx.restore();
}

function drawBackground() {
    if (!bgImage.complete || bgImage.width === 0) return;
    const factor = 0.2;
    const w = 1280;
    const h = 800;
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

function drawVignette() {
    const w = canvas.width;
    const h = canvas.height;
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
}

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
    if (player.invincible > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
        ctx.globalAlpha = 0.5;
    }
    const srcImg = charImage.complete ? charImage : tilesetImage;
    ctx.drawImage(srcImg, frame.x, frame.y, frame.w, frame.h, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
    ctx.restore();
    ctx.globalAlpha = 1.0;
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
        ctx.drawImage(tilesetImage, srcX, srcY, TILE_SIZE, TILE_SIZE, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    } else {
        ctx.fillStyle = '#888';
        ctx.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    }
    ctx.restore();
}

window.resetGame = function () {
    if (!currentLevelData) {
        location.reload();
        return;
    }
    player.isDead = false;
    player.isClear = false;
    player.vx = 0;
    player.vy = 0;
    player.cooldown = 0;
    player.state = "idle";
    player.dropTimer = 0;
    player.hp = player.maxHp;
    player.invincible = 0;

    isGameRunning = false;
    document.getElementById('screen-gameover').style.display = 'none';
    document.getElementById('screen-clear').style.display = 'none';
    updateHPDisplay();

    initGameWithData(currentLevelData);

    if (typeof AudioSys !== 'undefined' && !AudioSys.isMuted) {
        const bgmName = isAtelierMode ? 'atelier' : 'forest';
        AudioSys.playBGM(bgmName, 0.3);
    }
};

window.goToAtelier = function () {
    document.getElementById('screen-clear').style.display = 'none';
    loadStage(ATELIER_MAP_SRC, true);
};

window.loadStage = function (url, isAtelier = false) {
    const layer = document.getElementById('world-ui-layer');
    if (layer) layer.innerHTML = '';
    atelierStations = [];

    const startTime = Date.now();
    const transition = document.getElementById('screen-transition');
    const locText = document.getElementById('location-name');
    if (transition && locText) {
        let name = "ほしあかりの森";
        if (isAtelier || url.includes("atelier")) name = "ほしぞら工房";
        locText.textContent = name;
        transition.style.display = 'flex';
        transition.classList.remove('fade-out');
        transition.style.opacity = '1';
        requestAnimationFrame(() => {
            locText.classList.remove('fade-in-text');
            void locText.offsetWidth;
            locText.classList.add('fade-in-text');
        });
    }

    totalItemCount += score;
    score = 0;
    isAtelierMode = isAtelier;

    if (typeof AudioSys !== 'undefined' && !AudioSys.isMuted) {
        const bgmName = isAtelier ? 'atelier' : 'forest';
        AudioSys.playBGM(bgmName, 0.3);
    }

    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error('Not found');
            return res.json();
        })
        .then(async data => {
            currentLevelData = data;
            await initGameWithData(data);
            player.isDead = false;
            player.isClear = false;
            player.vx = 0;
            player.vy = 0;
            player.cooldown = 0;
            player.state = "idle";
            player.dropTimer = 0;
            player.hp = player.maxHp;
            player.invincible = 0;
            score = 0;
            updateHPDisplay();
            updateScoreDisplay();

            const remainingTime = Math.max(500, 2200 - (Date.now() - startTime));
            setTimeout(() => {
                if (transition) {
                    transition.classList.add('fade-out');
                    setTimeout(() => {
                        transition.style.display = 'none';
                    }, 1000);
                }
            }, remainingTime);

        })
        .catch(err => {
            console.error(err);
            alert("ステージデータが見つかりませんでした: " + url);
            if (transition) transition.style.display = 'none';
        });
};

// --- ★追加機能: クラフト開始 ---
function startCraftMode() {
    const currentTotal = totalItemCount + score;
    if (currentTotal < 1) {
        AudioSys.playTone(200, 'sawtooth', 0.2);
        console.log("ほしのもとが足りません");
        return;
    }

    // クラフトマネージャ起動 (この時点では消費しない)
    isGameRunning = false;
    if (gameLoopId) cancelAnimationFrame(gameLoopId);

    if (typeof CraftManager !== 'undefined') {
        CraftManager.init();
        CraftManager.start(currentTotal); // 現在の所持数を渡す
    } else {
        console.error("CraftManager not found");
        isGameRunning = true;
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

// --- ★追加機能: クラフト消費 ---
window.consumeCraftMaterials = function (setAmount) {
    const cost = setAmount * 1;
    if (score >= cost) {
        score -= cost;
    } else {
        const diff = cost - score;
        score = 0;
        totalItemCount -= diff;
    }
    updateScoreDisplay();
};


// --- ★追加機能: クラフト終了時の復帰 ---
window.resetGameFromCraft = function (starRewardAmount) {
    isGameRunning = true;

    if (typeof AudioSys !== 'undefined' && !AudioSys.isMuted) {
        AudioSys.playBGM('atelier', 0.3);
    }

    totalStarCount += starRewardAmount;
    if (starRewardAmount > 0) {
        AudioSys.playTone(1200, 'sine', 0.3);
    }
    updateScoreDisplay();

    // ★修正: 完了時も中断時も、常に初期位置(入り口)に戻して作業台への再接触ループを防ぐ
    if (spawnPoint) {
        player.x = spawnPoint.x;
        player.y = spawnPoint.y;
    }
    player.vx = 0;
    player.vy = 0;
    // 即座の誤操作防止のためクールダウンを設定
    player.cooldown = 30;

    updateCamera();

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
};