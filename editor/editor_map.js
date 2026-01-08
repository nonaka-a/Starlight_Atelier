/** 定数 */
const TILE_SIZE = 64;
// ルートフォルダの画像を参照するためパス変更
const TILESET_SRC = '../tileset.png';

// 属性（プロパティ）定義リスト
const PROPERTY_TYPES = [
    { value: 'air', name: '空気 (Air)', defaultSolid: false },
    { value: 'wall', name: '壁 (Wall)', defaultSolid: true },
    { value: 'ground', name: '床 (Ground)', defaultSolid: true },
    { value: 'spike', name: 'トゲ (Spike)', defaultSolid: false },
    { value: 'item', name: 'アイテム (Item)', defaultSolid: false }, // ★ここを変更 (coin -> item)
    { value: 'enemy', name: '敵 (Enemy)', defaultSolid: false },
    { value: 'start', name: '開始地点 (Start)', defaultSolid: false },
    { value: 'goal', name: 'ゴール (Goal)', defaultSolid: false }
];

// ゲーム本体との互換用デフォルトマッピング (ID -> Type)
const DEFAULT_ID_MAPPING = {
    0: 'air',
    1: 'wall',
    2: 'ground',
    3: 'spike',
    4: 'item', // ★ここを変更 (coin -> item)
    5: 'enemy',
    6: 'start',
    7: 'goal'
};

/** グローバル変数 */
let mapData = [];
let mapWidth = 20;
let mapHeight = 15;

let currentTileId = 1; // 選択中のタイルID
let currentTool = 'brush'; 
let brushTransform = { rot: 0, fx: false, fy: false };

// タイルごとの設定を保持する配列 [{ type: 'wall', solid: true }, ...]
let tileSettings = [];

let selection = null;
let isDragSelecting = false;
let dragStartPos = { tx: 0, ty: 0 };
let isMovingSelection = false;
let moveOffset = { x: 0, y: 0 };

const MAX_HISTORY = 10;
let historyStack = [];

let zoomLevel = 1.0;
let isDrawing = false;
let isResizing = false;
let tilesetImage = new Image();
let isImageLoaded = false;
let isInitialized = false;

// DOM要素
let canvas, ctx, container, viewport;
let paletteCanvas, paletteCtx;

/** 初期化（外部から呼び出し可能） */
window.initMapEditor = function() {
    if (isInitialized) return;

    canvas = document.getElementById('editor-canvas');
    ctx = canvas.getContext('2d');
    container = document.getElementById('canvas-container');
    viewport = document.getElementById('viewport');
    
    paletteCanvas = document.getElementById('palette-canvas');
    paletteCtx = paletteCanvas.getContext('2d');

    initMapData(mapWidth, mapHeight);
    setupPropertyUI();

    tilesetImage.src = TILESET_SRC;
    tilesetImage.onload = () => {
        isImageLoaded = true;
        initTileSettings(); // 画像サイズからタイル設定配列を初期化
        drawPalette();      // パレット描画
        draw();             // マップ描画
    };
    tilesetImage.onerror = () => {
        console.warn("画像読み込み失敗");
        isImageLoaded = false;
        // 画像がない場合でも最低限動くように
        initTileSettings(8); 
        drawPalette();
        draw();
    };

    setupEvents();
    updateTransformDisplay();
    saveHistory();
    
    isInitialized = true;
};

// タイルセット画像に基づき設定配列を初期化
function initTileSettings(forceCount = null) {
    let count = 0;
    if (forceCount) {
        count = forceCount;
    } else if (isImageLoaded) {
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        const rows = Math.floor(tilesetImage.height / TILE_SIZE);
        count = cols * rows;
    }

    // 既存の設定があれば維持、なければデフォルト作成
    // 配列サイズを画像に合わせて拡張
    for (let i = 0; i < count; i++) {
        if (!tileSettings[i]) {
            const defaultType = DEFAULT_ID_MAPPING[i] || 'wall';
            // プロパティ定義からデフォルトのSolid値を取得
            const propDef = PROPERTY_TYPES.find(p => p.value === defaultType);
            const defaultSolid = propDef ? propDef.defaultSolid : true;

            tileSettings[i] = {
                id: i,
                type: defaultType,
                solid: defaultSolid
            };
        }
    }
    
    // UIを現在の選択タイルに合わせて更新
    updateTileInfoUI();
}

// プロパティ設定用UIの選択肢生成など
function setupPropertyUI() {
    const select = document.getElementById('tile-type-select');
    select.innerHTML = '';
    PROPERTY_TYPES.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.value;
        opt.textContent = p.name;
        select.appendChild(opt);
    });

    // イベントリスナー設定
    select.addEventListener('change', (e) => {
        if (tileSettings[currentTileId]) {
            tileSettings[currentTileId].type = e.target.value;
            // 属性を変えたらデフォルトのSolid値も連動させる（親切設計）
            const def = PROPERTY_TYPES.find(p => p.value === e.target.value);
            if (def) {
                tileSettings[currentTileId].solid = def.defaultSolid;
                document.getElementById('tile-collision-check').checked = def.defaultSolid;
            }
        }
    });

    const check = document.getElementById('tile-collision-check');
    check.addEventListener('change', (e) => {
        if (tileSettings[currentTileId]) {
            tileSettings[currentTileId].solid = e.target.checked;
        }
    });
}

// 選択中のタイル情報をUIに反映
function updateTileInfoUI() {
    const setting = tileSettings[currentTileId];
    if (!setting) return;

    document.getElementById('tile-id-display').value = currentTileId;
    document.getElementById('tile-type-select').value = setting.type;
    document.getElementById('tile-collision-check').checked = setting.solid;
}

// パレット（タイルセット画像）の描画
function drawPalette() {
    if (!paletteCtx) return;

    if (isImageLoaded) {
        paletteCanvas.width = tilesetImage.width;
        paletteCanvas.height = tilesetImage.height;
        paletteCtx.clearRect(0, 0, paletteCanvas.width, paletteCanvas.height);
        paletteCtx.drawImage(tilesetImage, 0, 0);

        // グリッド線
        paletteCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        paletteCtx.lineWidth = 1;
        paletteCtx.beginPath();
        for (let x = 0; x <= tilesetImage.width; x += TILE_SIZE) {
            paletteCtx.moveTo(x, 0);
            paletteCtx.lineTo(x, tilesetImage.height);
        }
        for (let y = 0; y <= tilesetImage.height; y += TILE_SIZE) {
            paletteCtx.moveTo(0, y);
            paletteCtx.lineTo(tilesetImage.width, y);
        }
        paletteCtx.stroke();

        // 選択枠
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        const tx = (currentTileId % cols) * TILE_SIZE;
        const ty = Math.floor(currentTileId / cols) * TILE_SIZE;

        paletteCtx.strokeStyle = '#ffff00';
        paletteCtx.lineWidth = 3;
        paletteCtx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
    } else {
        // 画像がない場合のフォールバック（簡易表示）
        paletteCanvas.width = TILE_SIZE * 4;
        paletteCanvas.height = TILE_SIZE * 2;
        paletteCtx.fillStyle = '#444';
        paletteCtx.fillRect(0,0,paletteCanvas.width, paletteCanvas.height);
        paletteCtx.fillStyle = '#fff';
        paletteCtx.fillText("No Image", 10, 20);
    }
}

function initMapData(w, h) {
    mapData = [];
    mapWidth = w;
    mapHeight = h;
    for(let y = 0; y < h; y++) {
        const row = [];
        for(let x = 0; x < w; x++) {
            row.push({ id: 0, rot: 0, fx: false, fy: false });
        }
        mapData.push(row);
    }
    updateCanvasSize();
}

function resizeMapData(newW, newH) {
    const newMap = [];
    for(let y = 0; y < newH; y++) {
        const row = [];
        for(let x = 0; x < newW; x++) {
            if(y < mapData.length && x < mapData[y].length) {
                row.push({ ...mapData[y][x] });
            } else {
                row.push({ id: 0, rot: 0, fx: false, fy: false });
            }
        }
        newMap.push(row);
    }
    mapData = newMap;
    mapWidth = newW;
    mapHeight = newH;
    updateCanvasSize();
}

function updateCanvasSize() {
    if(!canvas) return;
    canvas.width = mapWidth * TILE_SIZE;
    canvas.height = mapHeight * TILE_SIZE;
    container.style.transform = `scale(${zoomLevel})`;
    container.style.width = `${canvas.width}px`;
    container.style.height = `${canvas.height}px`;
    draw();
}

function saveHistory() {
    if(historyStack.length >= MAX_HISTORY) {
        historyStack.shift();
    }
    const snapshot = {
        data: JSON.parse(JSON.stringify(mapData)),
        w: mapWidth,
        h: mapHeight,
        sel: selection ? { ...selection } : null
    };
    historyStack.push(snapshot);
}

window.undo = function() {
    if(historyStack.length === 0) return;
    const prev = historyStack.pop();
    if(!prev) return;

    mapData = prev.data;
    mapWidth = prev.w;
    mapHeight = prev.h;
    selection = prev.sel;
    
    updateCanvasSize();
};

function draw() {
    if(!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            if (isMovingSelection && currentTool === 'move' && isInSelection(x, y)) {
                continue;
            }
            drawOneTile(x * TILE_SIZE, y * TILE_SIZE, mapData[y][x]);
            
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    if (isMovingSelection && selection) {
        const targetX = selection.x + moveOffset.x;
        const targetY = selection.y + moveOffset.y;
        
        ctx.save();
        ctx.globalAlpha = 0.8;
        for(let ly = 0; ly < selection.h; ly++) {
            for(let lx = 0; lx < selection.w; lx++) {
                const mapY = selection.y + ly;
                const mapX = selection.x + lx;
                if(mapY < mapHeight && mapX < mapWidth) {
                    const tile = mapData[mapY][mapX];
                    drawOneTile((targetX + lx) * TILE_SIZE, (targetY + ly) * TILE_SIZE, tile);
                }
            }
        }
        ctx.restore();
        
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(targetX * TILE_SIZE, targetY * TILE_SIZE, selection.w * TILE_SIZE, selection.h * TILE_SIZE);
    }

    if (selection && !isMovingSelection) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(selection.x * TILE_SIZE, selection.y * TILE_SIZE, selection.w * TILE_SIZE, selection.h * TILE_SIZE);
        ctx.setLineDash([]);
    }
}

function drawOneTile(px, py, tile) {
    if (tile.id === 0) return;
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tile.rot * Math.PI / 180);
    const scaleX = tile.fx ? -1 : 1;
    const scaleY = tile.fy ? -1 : 1;
    ctx.scale(scaleX, scaleY);

    if (isImageLoaded) {
        // ★修正: 画像が複数行になっても正しく参照できるように計算
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        const srcX = (tile.id % cols) * TILE_SIZE;
        const srcY = Math.floor(tile.id / cols) * TILE_SIZE;

        ctx.drawImage(
            tilesetImage,
            srcX, srcY, TILE_SIZE, TILE_SIZE,
            -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE
        );
    } else {
        // 画像がない場合の簡易表示
        ctx.fillStyle = '#888';
        ctx.fillRect(-TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#fff';
        ctx.fillText(tile.id, -10, 5);
    }
    ctx.restore();
}

window.setTool = function(tool) {
    currentTool = tool;
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
    const btnId = tool === 'copy' ? 'tool-copy' : `tool-${tool}`;
    const btn = document.getElementById(btnId);
    if(btn) btn.classList.add('active');

    if (tool === 'select') canvas.style.cursor = 'crosshair';
    else if (tool === 'move' || tool === 'copy') canvas.style.cursor = 'move';
    else canvas.style.cursor = 'default';
};

window.deselect = function() {
    selection = null;
    draw();
};

window.rotateAction = function(deg) {
    if (selection) {
        saveHistory();
        transformSelection('rotate', deg);
    } else {
        // 現在の角度に加算して360度で丸める
        brushTransform.rot = (brushTransform.rot + deg + 360) % 360;
        updateTransformDisplay();
    }
};

window.flipAction = function(axis) {
    if (selection) {
        saveHistory();
        transformSelection('flip', axis);
    } else {
        // ブラシ自体の反転フラグをトグル
        if(axis === 'x') brushTransform.fx = !brushTransform.fx;
        if(axis === 'y') brushTransform.fy = !brushTransform.fy;
        updateTransformDisplay();
    }
};

function updateTransformDisplay() {
    const el = document.getElementById('brush-status');
    if(el) el.textContent = `ブラシ: ${brushTransform.rot}° / ${brushTransform.fx?'反転':''} ${brushTransform.fy?'反転':''}`;
}

function transformSelection(type, val) {
    if (!selection) return;
    
    const subMap = [];
    for(let y=0; y<selection.h; y++) {
        const row = [];
        for(let x=0; x<selection.w; x++) {
            const ty = selection.y + y;
            const tx = selection.x + x;
            if(ty < mapHeight && tx < mapWidth) row.push({...mapData[ty][tx]});
            else row.push({id:0, rot:0, fx:false, fy:false});
        }
        subMap.push(row);
    }
    
    let newSubMap = [];
    let newW = selection.w;
    let newH = selection.h;

    if (type === 'rotate') {
        newW = selection.h;
        newH = selection.w;
        for(let y=0; y<newH; y++) {
            const row = [];
            for(let x=0; x<newW; x++) {
                let srcX, srcY;
                if (val === 90) { 
                    srcX = y;
                    srcY = newW - 1 - x;
                } else { 
                    srcX = newH - 1 - y;
                    srcY = x;
                }
                const tile = {...subMap[srcY][srcX]};
                if (tile.id !== 0) {
                    tile.rot = (tile.rot + val + 360) % 360;
                }
                row.push(tile);
            }
            newSubMap.push(row);
        }
    } else if (type === 'flip') {
        newSubMap = subMap; 
        if (val === 'x') {
            newSubMap.forEach(row => row.reverse());
            newSubMap.forEach(row => row.forEach(t => t.fx = !t.fx));
        } else {
            newSubMap.reverse();
            newSubMap.forEach(row => row.forEach(t => t.fy = !t.fy));
        }
    }

    for(let y=0; y<selection.h; y++) {
        for(let x=0; x<selection.w; x++) {
             const ty = selection.y + y;
             const tx = selection.x + x;
             if(ty < mapHeight && tx < mapWidth) mapData[ty][tx] = {id:0,rot:0,fx:false,fy:false};
        }
    }

    selection.w = newW;
    selection.h = newH;
    for(let y=0; y<selection.h; y++) {
        for(let x=0; x<selection.w; x++) {
             const ty = selection.y + y;
             const tx = selection.x + x;
             if(ty < mapHeight && tx < mapWidth) {
                 mapData[ty][tx] = newSubMap[y][x];
             }
        }
    }
    draw();
}

function getTilePos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;
    return {
        tx: Math.floor(x / TILE_SIZE),
        ty: Math.floor(y / TILE_SIZE)
    };
}

function setupEvents() {
    // マップキャンバスのイベント
    canvas.addEventListener('mousedown', (e) => {
        const pos = getTilePos(e);
        
        if (currentTool === 'brush') {
            saveHistory();
            isDrawing = true;
            putTile(pos.tx, pos.ty);
        } else if (currentTool === 'select') {
            isDragSelecting = true;
            dragStartPos = pos;
            selection = { x: pos.tx, y: pos.ty, w: 1, h: 1 };
            draw();
        } else if (currentTool === 'move' || currentTool === 'copy') {
            if (selection && isInSelection(pos.tx, pos.ty)) {
                isMovingSelection = true;
                dragStartPos = pos;
                moveOffset = { x: 0, y: 0 };
                draw();
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isResizing) { handleResize(e); return; }

        if (!isDrawing && !isDragSelecting && !isMovingSelection) return;

        const pos = getTilePos(e);

        if (currentTool === 'brush' && isDrawing) {
            putTile(pos.tx, pos.ty);
        } else if (currentTool === 'select' && isDragSelecting) {
            const minX = Math.min(dragStartPos.tx, pos.tx);
            const minY = Math.min(dragStartPos.ty, pos.ty);
            const absW = Math.abs(pos.tx - dragStartPos.tx) + 1;
            const absH = Math.abs(pos.ty - dragStartPos.ty) + 1;
            
            selection = {
                x: minX, y: minY,
                w: absW, h: absH
            };
            draw();
        } else if ((currentTool === 'move' || currentTool === 'copy') && isMovingSelection) {
            moveOffset = {
                x: pos.tx - dragStartPos.tx,
                y: pos.ty - dragStartPos.ty
            };
            draw();
        }
    });

    window.addEventListener('mouseup', () => {
        isDrawing = false;
        isDragSelecting = false;
        if (isMovingSelection) {
            commitMove();
            isMovingSelection = false;
        }
        isResizing = false;
    });

    // パレットキャンバスのイベント（クリックでID選択）
    paletteCanvas.addEventListener('mousedown', (e) => {
        if (!isImageLoaded) return;
        const rect = paletteCanvas.getBoundingClientRect();
        
        // ★修正: 表示サイズ(rect)とキャンバス実サイズ(width/height)の比率を計算
        const scaleX = paletteCanvas.width / rect.width;
        const scaleY = paletteCanvas.height / rect.height;

        // クリック座標にスケールを適用
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        const col = Math.floor(x / TILE_SIZE);
        const row = Math.floor(y / TILE_SIZE);
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        
        const id = row * cols + col;
        
        // 有効なIDか確認（タイルセット内）
        if (id >= 0 && id < tileSettings.length) {
            currentTileId = id;
            brushTransform = { rot: 0, fx: false, fy: false };
            updateTileInfoUI();
            drawPalette(); // 選択枠更新
        }
    });

    document.getElementById('resize-handle').onmousedown = (e) => {
        e.stopPropagation();
        saveHistory();
        isResizing = true;
    };
    
    document.getElementById('btn-zoom-in').onclick = () => {
        zoomLevel = Math.min(2.0, zoomLevel + 0.1);
        updateCanvasSize();
        document.getElementById('zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
    };
    document.getElementById('btn-zoom-out').onclick = () => {
        zoomLevel = Math.max(0.2, zoomLevel - 0.1);
        updateCanvasSize();
        document.getElementById('zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
    };
    
    document.getElementById('btn-clear').onclick = () => {
        if(confirm('マップを完全にクリアしますか？')) {
            saveHistory();
            initMapData(mapWidth, mapHeight);
            draw();
        }
    };
    
    document.getElementById('btn-export').onclick = () => {
        const name = document.getElementById('map-name').value || 'map';
        const json = JSON.stringify({
            version: "3.1",
            name: name,
            width: mapWidth,
            height: mapHeight,
            tileSize: TILE_SIZE,
            map: mapData,
            tileDefs: tileSettings // タイル定義も含める
        }, null, 2);
        const url = URL.createObjectURL(new Blob([json], {type:'application/json'}));
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.json`; a.click();
    };
    
    document.getElementById('file-input').onchange = (e) => {
        const f = e.target.files[0];
        if(!f) return;
        saveHistory();
        const r = new FileReader();
        r.onload = (ev) => {
            try {
                const d = JSON.parse(ev.target.result);
                initMapData(d.width, d.height);
                
                // マップデータ読み込み
                let loaded = d.map || d.data;
                for(let y=0; y<d.height; y++){
                    for(let x=0; x<d.width; x++){
                        let cell = loaded[y][x];
                        if(typeof cell === 'number') cell = {id:cell, rot:0, fx:false, fy:false};
                        mapData[y][x] = cell;
                    }
                }
                
                // タイル定義読み込み（あれば上書き、なければ初期化のまま）
                if (d.tileDefs && Array.isArray(d.tileDefs)) {
                    // ID順にマージする（画像サイズが変わっている可能性も考慮）
                    d.tileDefs.forEach(def => {
                        if (tileSettings[def.id]) {
                            tileSettings[def.id] = def;
                        }
                    });
                    updateTileInfoUI();
                }

                if(d.name) document.getElementById('map-name').value = d.name;
                draw();
            } catch(err) {
                console.error(err);
                alert('データ読み込みエラー');
            }
        };
        r.readAsText(f);
        e.target.value = '';
    }
}

function handleResize(e) {
    const rect = viewport.getBoundingClientRect();
    const rawX = e.clientX - rect.left - 20;
    const rawY = e.clientY - rect.top - 20;
    const realX = rawX / zoomLevel;
    const realY = rawY / zoomLevel;
    let newW = Math.max(5, Math.ceil(realX / TILE_SIZE));
    let newH = Math.max(5, Math.ceil(realY / TILE_SIZE));
    if(newW !== mapWidth || newH !== mapHeight) resizeMapData(newW, newH);
}

function putTile(tx, ty) {
    if(tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
        mapData[ty][tx] = {
            id: currentTileId,
            // ここで現在のブラシ状態を適用
            rot: brushTransform.rot,
            fx: brushTransform.fx,
            fy: brushTransform.fy
        };
        draw();
    }
}

function isInSelection(tx, ty) {
    if (!selection) return false;
    return tx >= selection.x && tx < selection.x + selection.w &&
           ty >= selection.y && ty < selection.y + selection.h;
}

function commitMove() {
    if (!selection) return;
    if (moveOffset.x === 0 && moveOffset.y === 0) return;

    saveHistory();

    const tempBuffer = [];
    for(let ly = 0; ly < selection.h; ly++) {
        const row = [];
        for(let lx = 0; lx < selection.w; lx++) {
            const y = selection.y + ly;
            const x = selection.x + lx;
            if (y<mapHeight && x<mapWidth) row.push({...mapData[y][x]});
            else row.push({id:0, rot:0, fx:false, fy:false});
        }
        tempBuffer.push(row);
    }
    
    if (currentTool !== 'copy') {
        for(let ly = 0; ly < selection.h; ly++) {
            for(let lx = 0; lx < selection.w; lx++) {
                const y = selection.y + ly;
                const x = selection.x + lx;
                if (y<mapHeight && x<mapWidth) mapData[y][x] = {id:0, rot:0, fx:false, fy:false};
            }
        }
    }
    
    const targetX = selection.x + moveOffset.x;
    const targetY = selection.y + moveOffset.y;
    
    for(let ly = 0; ly < selection.h; ly++) {
        for(let lx = 0; lx < selection.w; lx++) {
            const y = targetY + ly;
            const x = targetX + lx;
            if (y >= 0 && y < mapHeight && x >= 0 && x < mapWidth) {
                mapData[y][x] = tempBuffer[ly][lx];
            }
        }
    }
    
    selection.x = targetX;
    selection.y = targetY;
    moveOffset = { x: 0, y: 0 };
    draw();
}