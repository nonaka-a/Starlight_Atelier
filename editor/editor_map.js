/** 定数 */
const TILE_SIZE = 64;
// ルートフォルダの画像を参照するためパス変更
const TILESET_SRC = '../image/forest_tileset.png';

// 属性（プロパティ）定義リスト
const PROPERTY_TYPES = [
    { value: 'air', name: '空気 (Air)', defaultSolid: false },
    { value: 'wall', name: '壁 (Wall)', defaultSolid: true },
    { value: 'ground', name: '床 (Ground)', defaultSolid: true },
    { value: 'spike', name: 'トゲ (Spike)', defaultSolid: false },
    { value: 'item', name: 'アイテム (Item)', defaultSolid: false },
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
    4: 'item',
    5: 'enemy',
    118: 'start', // ★追加
    119: 'goal',  // ★追加
    // 6, 7 は必要に応じて残すか削除
};

/** グローバル変数 */
// mapData は 3つのレイヤーを持つ配列になります: [BG(0), Main(1), FG(2)]
let mapData = [];
let mapWidth = 20;
let mapHeight = 15;

let currentTileId = 1; // 選択中のタイルID
let currentTool = 'brush';
let currentLayerIndex = 1; // 0:BG, 1:Main, 2:FG (初期値はMain)
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
// ★追加: タイルセットのパスを保持する変数 (保存用)
let currentTilesetJsonPath = "image/forest_tileset.png";
let isImageLoaded = false;
let isInitialized = false;

// DOM要素
let canvas, ctx, container, viewport;
let paletteCanvas, paletteCtx;

/** 初期化（外部から呼び出し可能） */
window.initMapEditor = function () {
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
        initTileSettings();
        drawPalette();
        draw();
    };
    tilesetImage.onerror = () => {
        console.warn("画像読み込み失敗");
        isImageLoaded = false;
        initTileSettings(8);
        drawPalette();
        draw();
    };

    setupEvents();
    updateTransformDisplay();
    saveHistory();

    isInitialized = true;
};

// --- 追加: タイルセット読み込み ---
window.changeTileset = function (file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        tilesetImage.src = e.target.result;
        // ファイル名を保存 (パス全体はブラウザセキュリティで取れないため、ファイル名のみ)
        // 実際のゲーム動作時は 'image/' + filename となる想定
        // 保存用にパス形式を整える
        currentTilesetJsonPath = 'image/' + file.name;
        console.log("Tileset changed to:", currentTilesetJsonPath);
    };
    reader.readAsDataURL(file);
};

// --- レイヤー操作 ---
window.setLayer = function (layerIndex) {
    currentLayerIndex = parseInt(layerIndex);
    // UIのラジオボタンのアクティブ表示更新（CSS依存）
    document.querySelectorAll('input[name="layer"]').forEach(input => {
        input.parentElement.classList.toggle('active', parseInt(input.value) === currentLayerIndex);
    });
    draw(); // 再描画（非アクティブレイヤーを薄くするため）
};

// --- 初期化関連 ---

function initTileSettings(forceCount = null) {
    let count = 0;
    if (forceCount) {
        count = forceCount;
    } else if (isImageLoaded) {
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        const rows = Math.floor(tilesetImage.height / TILE_SIZE);
        count = cols * rows;
    }

    for (let i = 0; i < count; i++) {
        if (!tileSettings[i]) {
            const defaultType = DEFAULT_ID_MAPPING[i] || 'wall';
            const propDef = PROPERTY_TYPES.find(p => p.value === defaultType);
            const defaultSolid = propDef ? propDef.defaultSolid : true;

            tileSettings[i] = {
                id: i,
                type: defaultType,
                solid: defaultSolid
            };
        }
    }
    updateTileInfoUI();
}

function setupPropertyUI() {
    const select = document.getElementById('tile-type-select');
    select.innerHTML = '';
    PROPERTY_TYPES.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.value;
        opt.textContent = p.name;
        select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
        if (tileSettings[currentTileId]) {
            tileSettings[currentTileId].type = e.target.value;
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

function updateTileInfoUI() {
    const setting = tileSettings[currentTileId];
    if (!setting) return;

    document.getElementById('tile-id-display').value = currentTileId;
    document.getElementById('tile-type-select').value = setting.type;
    document.getElementById('tile-collision-check').checked = setting.solid;
}

function drawPalette() {
    if (!paletteCtx) return;

    if (isImageLoaded) {
        paletteCanvas.width = tilesetImage.width;
        paletteCanvas.height = tilesetImage.height;
        paletteCtx.clearRect(0, 0, paletteCanvas.width, paletteCanvas.height);
        paletteCtx.drawImage(tilesetImage, 0, 0);

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

        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        const tx = (currentTileId % cols) * TILE_SIZE;
        const ty = Math.floor(currentTileId / cols) * TILE_SIZE;

        paletteCtx.strokeStyle = '#ffff00';
        paletteCtx.lineWidth = 3;
        paletteCtx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
    } else {
        paletteCanvas.width = TILE_SIZE * 4;
        paletteCanvas.height = TILE_SIZE * 2;
        paletteCtx.fillStyle = '#444';
        paletteCtx.fillRect(0, 0, paletteCanvas.width, paletteCanvas.height);
        paletteCtx.fillStyle = '#fff';
        paletteCtx.fillText("No Image", 10, 20);
    }
}

// --- マップデータ操作 ---

function initMapData(w, h) {
    // 3レイヤー分の配列を作成
    mapData = [];
    for (let l = 0; l < 3; l++) {
        const layer = [];
        for (let y = 0; y < h; y++) {
            const row = [];
            for (let x = 0; x < w; x++) {
                row.push({ id: 0, rot: 0, fx: false, fy: false });
            }
            layer.push(row);
        }
        mapData.push(layer);
    }
    mapWidth = w;
    mapHeight = h;
    updateCanvasSize();
}

function resizeMapData(newW, newH) {
    const newMapData = [];
    for (let l = 0; l < 3; l++) {
        const newLayer = [];
        for (let y = 0; y < newH; y++) {
            const row = [];
            for (let x = 0; x < newW; x++) {
                if (y < mapData[l].length && x < mapData[l][y].length) {
                    row.push({ ...mapData[l][y][x] });
                } else {
                    row.push({ id: 0, rot: 0, fx: false, fy: false });
                }
            }
            newLayer.push(row);
        }
        newMapData.push(newLayer);
    }
    mapData = newMapData;
    mapWidth = newW;
    mapHeight = newH;
    updateCanvasSize();
}

function updateCanvasSize() {
    if (!canvas) return;
    canvas.width = mapWidth * TILE_SIZE;
    canvas.height = mapHeight * TILE_SIZE;
    container.style.transform = `scale(${zoomLevel})`;
    container.style.width = `${canvas.width}px`;
    container.style.height = `${canvas.height}px`;
    draw();
}

function saveHistory() {
    if (historyStack.length >= MAX_HISTORY) {
        historyStack.shift();
    }
    const snapshot = {
        data: JSON.parse(JSON.stringify(mapData)),
        w: mapWidth,
        h: mapHeight,
        sel: selection ? { ...selection } : null,
        layer: currentLayerIndex
    };
    historyStack.push(snapshot);
}

window.undo = function () {
    if (historyStack.length === 0) return;
    const prev = historyStack.pop();
    if (!prev) return;

    mapData = prev.data;
    mapWidth = prev.w;
    mapHeight = prev.h;
    selection = prev.sel;

    // 履歴のレイヤーに戻すかどうかはお好みですが、戻したほうが自然
    if (prev.layer !== undefined) {
        setLayer(prev.layer);
        // ラジオボタンのチェック状態も同期
        const radios = document.getElementsByName('layer');
        if (radios[currentLayerIndex]) radios[currentLayerIndex].checked = true;
    }

    updateCanvasSize();
};

// --- 描画 ---

function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // BG(0) -> Main(1) -> FG(2) の順に描画
    // 現在選択中のレイヤー以外は半透明にして、編集対象をわかりやすくする
    for (let l = 0; l < 3; l++) {
        ctx.save();
        if (l !== currentLayerIndex) {
            ctx.globalAlpha = 0.4; // 非アクティブレイヤーは薄く
        } else {
            ctx.globalAlpha = 1.0;
        }

        drawLayer(l);

        ctx.restore();
    }

    // 選択枠やグリッドの描画（現在のレイヤーに対して）
    drawOverlays();
}

function drawLayer(layerIdx) {
    const layer = mapData[layerIdx];
    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            // 移動中の選択範囲は元の位置を描画しない（現在のレイヤーのみ）
            if (layerIdx === currentLayerIndex && isMovingSelection && currentTool === 'move' && isInSelection(x, y)) {
                continue;
            }
            drawOneTile(x * TILE_SIZE, y * TILE_SIZE, layer[y][x]);
        }
    }
}

function drawOverlays() {
    // グリッド線（アクティブレイヤーの上に見えるように）
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // 移動プレビュー（現在のレイヤーのみ）
    if (isMovingSelection && selection) {
        const targetX = selection.x + moveOffset.x;
        const targetY = selection.y + moveOffset.y;
        const layer = mapData[currentLayerIndex];

        ctx.save();
        ctx.globalAlpha = 0.8;
        for (let ly = 0; ly < selection.h; ly++) {
            for (let lx = 0; lx < selection.w; lx++) {
                const mapY = selection.y + ly;
                const mapX = selection.x + lx;
                if (mapY < mapHeight && mapX < mapWidth) {
                    const tile = layer[mapY][mapX];
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
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);
        const srcX = (tile.id % cols) * TILE_SIZE;
        const srcY = Math.floor(tile.id / cols) * TILE_SIZE;

        ctx.drawImage(
            tilesetImage,
            srcX, srcY, TILE_SIZE, TILE_SIZE,
            -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE
        );
    } else {
        ctx.fillStyle = '#888';
        ctx.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#fff';
        ctx.fillText(tile.id, -10, 5);
    }
    ctx.restore();
}

// --- ツール操作 ---

// --- ツール操作 ---

window.setTool = function (tool) {
    currentTool = tool;

    // 全ボタンのactive解除
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));

    // ツールボタンのハイライト
    let btnId = `tool-${tool}`;
    // 特殊ツール名のIDマッピング
    if (tool === 'copy') btnId = 'tool-copy';
    if (tool === 'rot-left') btnId = 'btn-rot-left';
    if (tool === 'rot-right') btnId = 'btn-rot-right';
    if (tool === 'flip-x') btnId = 'btn-flip-x';
    if (tool === 'flip-y') btnId = 'btn-flip-y';

    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');

    if (tool === 'select') canvas.style.cursor = 'crosshair';
    else if (tool === 'move' || tool === 'copy') canvas.style.cursor = 'move';
    else if (tool.startsWith('rot') || tool.startsWith('flip')) canvas.style.cursor = 'pointer'; // 回転反転ツール用カーソル
    else canvas.style.cursor = 'default';
};

window.deselect = function () {
    selection = null;
    draw();
};

window.rotateAction = function (deg) {
    if (selection) {
        saveHistory();
        transformSelection('rotate', deg);
    } else {
        // 選択範囲がない場合はツールモード切り替え
        // deg = 90 -> 右回転ツール, -90 -> 左回転ツール
        if (deg === 90) setTool('rot-right');
        else if (deg === -90) setTool('rot-left');
    }
};

window.flipAction = function (axis) {
    if (selection) {
        saveHistory();
        transformSelection('flip', axis);
    } else {
        // 選択範囲がない場合はツールモード切り替え
        if (axis === 'x') setTool('flip-x');
        else if (axis === 'y') setTool('flip-y');
    }
};

function updateTransformDisplay() {
    const el = document.getElementById('brush-status');
    if (el) el.textContent = `ブラシ: ${brushTransform.rot}° / ${brushTransform.fx ? '反転' : ''} ${brushTransform.fy ? '反転' : ''}`;
}

function transformSelection(type, val) {
    if (!selection) return;

    // 現在のレイヤーのみ対象
    const layer = mapData[currentLayerIndex];

    const subMap = [];
    for (let y = 0; y < selection.h; y++) {
        const row = [];
        for (let x = 0; x < selection.w; x++) {
            const ty = selection.y + y;
            const tx = selection.x + x;
            if (ty < mapHeight && tx < mapWidth) row.push({ ...layer[ty][tx] });
            else row.push({ id: 0, rot: 0, fx: false, fy: false });
        }
        subMap.push(row);
    }

    let newSubMap = [];
    let newW = selection.w;
    let newH = selection.h;

    if (type === 'rotate') {
        newW = selection.h;
        newH = selection.w;
        for (let y = 0; y < newH; y++) {
            const row = [];
            for (let x = 0; x < newW; x++) {
                let srcX, srcY;
                if (val === 90) {
                    srcX = y;
                    srcY = newW - 1 - x;
                } else {
                    srcX = newH - 1 - y;
                    srcY = x;
                }
                const tile = { ...subMap[srcY][srcX] };
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

    for (let y = 0; y < selection.h; y++) {
        for (let x = 0; x < selection.w; x++) {
            const ty = selection.y + y;
            const tx = selection.x + x;
            if (ty < mapHeight && tx < mapWidth) layer[ty][tx] = { id: 0, rot: 0, fx: false, fy: false };
        }
    }

    selection.w = newW;
    selection.h = newH;
    for (let y = 0; y < selection.h; y++) {
        for (let x = 0; x < selection.w; x++) {
            const ty = selection.y + y;
            const tx = selection.x + x;
            if (ty < mapHeight && tx < mapWidth) {
                layer[ty][tx] = newSubMap[y][x];
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
    canvas.addEventListener('mousedown', (e) => {
        const pos = getTilePos(e);

        if (currentTool === 'brush') {
            saveHistory();
            isDrawing = true;
            putTile(pos.tx, pos.ty, true); // 第3引数trueでクリック判定
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
        } else if (currentTool.startsWith('rot') || currentTool.startsWith('flip')) {
            // クリックで回転・反転ツール実行
            saveHistory();
            applySingleTileTransform(pos.tx, pos.ty, currentTool);
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

    paletteCanvas.addEventListener('mousedown', (e) => {
        if (!isImageLoaded) return;
        const rect = paletteCanvas.getBoundingClientRect();
        const scaleX = paletteCanvas.width / rect.width;
        const scaleY = paletteCanvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const col = Math.floor(x / TILE_SIZE);
        const row = Math.floor(y / TILE_SIZE);
        const cols = Math.floor(tilesetImage.width / TILE_SIZE);

        const id = row * cols + col;

        if (id >= 0 && id < tileSettings.length) {
            currentTileId = id;
            brushTransform = { rot: 0, fx: false, fy: false };
            updateTransformDisplay();
            updateTileInfoUI();
            drawPalette();
            // ★追加: 自動でペンツールに切り替え
            setTool('brush');
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
        if (confirm('マップを完全にクリアしますか？')) {
            saveHistory();
            initMapData(mapWidth, mapHeight);
            draw();
        }
    };

    document.getElementById('btn-export').onclick = () => {
        const name = document.getElementById('map-name').value || 'map';

        // レイヤー構造で保存
        const layers = [
            { name: "background", data: mapData[0] },
            { name: "main", data: mapData[1] },
            { name: "foreground", data: mapData[2] }
        ];

        const json = JSON.stringify({
            version: "4.0",
            name: name,
            width: mapWidth,
            height: mapHeight,
            tileSize: TILE_SIZE,
            tilesetImage: currentTilesetJsonPath, // ★修正: 保存していたパスを使用
            layers: layers,
            tileDefs: tileSettings
        }, null, 2);

        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.json`; a.click();
    };

    document.getElementById('file-input').onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;

        // ★追加: ファイル名を自動で入力欄に反映 (拡張子除去)
        const fileName = f.name.replace(/\.[^/.]+$/, "");
        document.getElementById('map-name').value = fileName;

        saveHistory();
        const r = new FileReader();
        r.onload = (ev) => {
            try {
                const d = JSON.parse(ev.target.result);

                // ★追加: タイルセット画像情報の読み込み
                if (d.tilesetImage) {
                    // 保存用変数を更新
                    currentTilesetJsonPath = d.tilesetImage;

                    // エディタ上では相対パスで読み込みを試みる
                    let src = d.tilesetImage;
                    // "image/tileset.png" -> "../image/tileset.png"
                    if (!src.startsWith('../') && !src.startsWith('http') && !src.startsWith('/')) {
                        src = '../' + src;
                    }
                    tilesetImage.src = src;
                    // mapData.tilesetImage = d.tilesetImage; // mapData再生成で消えるので削除
                }

                // タイル定義読み込み
                if (d.tileDefs && Array.isArray(d.tileDefs)) {
                    d.tileDefs.forEach(def => {
                        if (tileSettings[def.id]) {
                            tileSettings[def.id] = def;
                        }
                    });
                    updateTileInfoUI();
                }

                // マップデータ読み込み (バージョン判定)
                if (d.layers) {
                    // v4.0 (レイヤーあり)
                    mapWidth = d.width;
                    mapHeight = d.height;
                    mapData = [];
                    // BG, Main, FG の順序で読み込む (無ければ空で作成)
                    const layerNames = ["background", "main", "foreground"];
                    for (let i = 0; i < 3; i++) {
                        const targetLayer = d.layers.find(l => l.name === layerNames[i]);
                        if (targetLayer) {
                            mapData.push(normalizeLayer(targetLayer.data, mapWidth, mapHeight));
                        } else {
                            mapData.push(createEmptyLayer(mapWidth, mapHeight));
                        }
                    }
                } else {
                    // 旧バージョン (シングルレイヤー) -> Mainレイヤーに読み込み
                    mapWidth = d.width;
                    mapHeight = d.height;
                    mapData = [];
                    mapData.push(createEmptyLayer(mapWidth, mapHeight)); // BG
                    const rawMap = d.map || d.data;
                    mapData.push(normalizeLayer(rawMap, mapWidth, mapHeight)); // Main
                    mapData.push(createEmptyLayer(mapWidth, mapHeight)); // FG
                }

                updateCanvasSize();
                // if (d.name) document.getElementById('map-name').value = d.name; // ファイル名を優先するためコメントアウト

            } catch (err) {
                console.error(err);
                alert('データ読み込みエラー');
            }
        };
        r.readAsText(f);
        e.target.value = '';
    };

    // ★追加: タイルセット画像選択イベント
    document.getElementById('tileset-input').onchange = (e) => {
        window.changeTileset(e.target.files[0]);
    };
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
            if (typeof cell === 'number') cell = { id: cell, rot: 0, fx: false, fy: false };
            row.push(cell);
        }
        layer.push(row);
    }
    return layer;
}

function handleResize(e) {
    const rect = viewport.getBoundingClientRect();
    const rawX = e.clientX - rect.left - 20;
    const rawY = e.clientY - rect.top - 20;
    const realX = rawX / zoomLevel;
    const realY = rawY / zoomLevel;
    let newW = Math.max(5, Math.ceil(realX / TILE_SIZE));
    let newH = Math.max(5, Math.ceil(realY / TILE_SIZE));
    if (newW !== mapWidth || newH !== mapHeight) resizeMapData(newW, newH);
}

function putTile(tx, ty, isClick = false) {
    if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
        const layer = mapData[currentLayerIndex];
        const currentCell = layer[ty][tx];

        // クリック時、かつ既に同じIDのタイルがある場合、回転・反転をサイクルさせる
        if (isClick && currentCell.id === currentTileId) {
            // 現在のブラシ状態とタイルの状態が一致しているか確認
            // (一致していなければ、まずはブラシの状態を適用する = 上書き)
            // (一致していれば、ユーザーは「変えたい」ので回転させる)

            const isMatch = (currentCell.rot === brushTransform.rot &&
                currentCell.fx === brushTransform.fx &&
                currentCell.fy === brushTransform.fy);

            if (isMatch) {
                // 次のステートへ
                // ステート定義: 0, 90, 180, 270 (Normal) -> 0, 90, 180, 270 (FlipX) -> Loop

                let rot = brushTransform.rot;
                let fx = brushTransform.fx;

                rot += 90;
                if (rot >= 360) {
                    rot = 0;
                    fx = !fx; // 1周回ったら反転トグル
                }

                // ブラシ状態も同期更新
                brushTransform.rot = rot;
                brushTransform.fx = fx;

                updateTransformDisplay();
            }
        }

        // 現在のレイヤーに書き込み
        mapData[currentLayerIndex][ty][tx] = {
            id: currentTileId,
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
    const layer = mapData[currentLayerIndex];

    const tempBuffer = [];
    for (let ly = 0; ly < selection.h; ly++) {
        const row = [];
        for (let lx = 0; lx < selection.w; lx++) {
            const y = selection.y + ly;
            const x = selection.x + lx;
            if (y < mapHeight && x < mapWidth) row.push({ ...layer[y][x] });
            else row.push({ id: 0, rot: 0, fx: false, fy: false });
        }
        tempBuffer.push(row);
    }

    if (currentTool !== 'copy') {
        for (let ly = 0; ly < selection.h; ly++) {
            for (let lx = 0; lx < selection.w; lx++) {
                const y = selection.y + ly;
                const x = selection.x + lx;
                if (y < mapHeight && x < mapWidth) layer[y][x] = { id: 0, rot: 0, fx: false, fy: false };
            }
        }
    }

    const targetX = selection.x + moveOffset.x;
    const targetY = selection.y + moveOffset.y;

    for (let ly = 0; ly < selection.h; ly++) {
        for (let lx = 0; lx < selection.w; lx++) {
            const y = targetY + ly;
            const x = targetX + lx;
            if (y >= 0 && y < mapHeight && x >= 0 && x < mapWidth) {
                layer[y][x] = tempBuffer[ly][lx];
            }
        }
    }

    selection.x = targetX;
    selection.y = targetY;
    moveOffset = { x: 0, y: 0 };
    draw();
}

// ★追加: 単一タイルの変形適用
function applySingleTileTransform(tx, ty, toolType) {
    if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
        const layer = mapData[currentLayerIndex];
        const tile = layer[ty][tx];

        if (tile.id === 0) return; // 空タイルは何もしない

        if (toolType === 'rot-left') {
            tile.rot = (tile.rot - 90 + 360) % 360;
        } else if (toolType === 'rot-right') {
            tile.rot = (tile.rot + 90 + 360) % 360;
        } else if (toolType === 'flip-x') {
            tile.fx = !tile.fx;
        } else if (toolType === 'flip-y') {
            tile.fy = !tile.fy;
        }

        draw();
    }
}