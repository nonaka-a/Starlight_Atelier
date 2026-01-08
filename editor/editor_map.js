/** 定数 */
const TILE_SIZE = 64;
// ルートフォルダの画像を参照するためパス変更
const TILESET_SRC = '../tileset.png';
const TILE_TYPES = [
    { id: 0, color: 'rgba(0,0,0,0)', name: '空気' },
    { id: 1, color: '#888', name: '壁' },
    { id: 2, color: '#6a4', name: '地面' },
    { id: 3, color: '#a00', name: 'トゲ' },
    { id: 4, color: '#dd4', name: 'コイン' },
    { id: 5, color: '#c44', name: '敵' },
    { id: 6, color: '#44c', name: '開始地点' },
    { id: 7, color: '#0ff', name: 'ゴール' },
];

/** グローバル変数 */
let mapData = [];
let mapWidth = 20;
let mapHeight = 15;

let currentTileId = 1;
let currentTool = 'brush'; 
let brushTransform = { rot: 0, fx: false, fy: false };

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

// DOM要素取得用（初期化時に取得）
let canvas, ctx, container, viewport;

/** 初期化（外部から呼び出し可能） */
window.initMapEditor = function() {
    if (isInitialized) return;

    canvas = document.getElementById('editor-canvas');
    ctx = canvas.getContext('2d');
    container = document.getElementById('canvas-container');
    viewport = document.getElementById('viewport');

    initMapData(mapWidth, mapHeight);

    tilesetImage.src = TILESET_SRC;
    tilesetImage.onload = () => {
        isImageLoaded = true;
        createPalette();
        draw();
    };
    tilesetImage.onerror = () => {
        console.warn("画像読み込み失敗");
        isImageLoaded = false;
        createPalette();
        draw();
    };

    setupEvents();
    updateTransformDisplay();
    saveHistory();
    
    isInitialized = true;
};

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
        ctx.drawImage(
            tilesetImage,
            tile.id * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE,
            -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE
        );
    } else {
        const def = TILE_TYPES.find(t => t.id === tile.id);
        ctx.fillStyle = def ? def.color : '#fff';
        ctx.fillRect(-TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
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
        brushTransform.rot = (brushTransform.rot + deg + 360) % 360;
        updateTransformDisplay();
    }
};

window.flipAction = function(axis) {
    if (selection) {
        saveHistory();
        transformSelection('flip', axis);
    } else {
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
            version: "3.0",
            name: name,
            width: mapWidth,
            height: mapHeight,
            tileSize: TILE_SIZE,
            map: mapData
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
                let loaded = d.map || d.data;
                for(let y=0; y<d.height; y++){
                    for(let x=0; x<d.width; x++){
                        let cell = loaded[y][x];
                        if(typeof cell === 'number') cell = {id:cell, rot:0, fx:false, fy:false};
                        mapData[y][x] = cell;
                    }
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

function createPalette() {
    const p = document.getElementById('palette');
    if(!p) return;
    p.innerHTML = '';
    TILE_TYPES.forEach(type => {
        const div = document.createElement('div');
        div.className = 'palette-item';
        if(type.id === currentTileId) div.classList.add('selected');
        const icon = document.createElement('div');
        icon.className = 'palette-icon';
        if(isImageLoaded) {
            icon.style.backgroundImage = `url(${TILESET_SRC})`;
            const totalW = (TILE_TYPES.length * TILE_SIZE) / 2;
            icon.style.backgroundSize = `${totalW}px 32px`;
            icon.style.backgroundPosition = `-${type.id*32}px 0`;
        } else {
            icon.style.backgroundColor = type.color;
        }
        const span = document.createElement('span');
        span.textContent = type.name;
        div.appendChild(icon);
        div.appendChild(span);
        div.onclick = () => {
            currentTileId = type.id;
            document.querySelectorAll('.palette-item').forEach(e=>e.classList.remove('selected'));
            div.classList.add('selected');
        };
        p.appendChild(div);
    });
}