/**
 * イベントエディタ用ロジック
 * Step 7: レイヤーD&D、プレビューZoom、尺制限、ショートカット修正
 */

// --- 変数定義 ---
let event_ctxPreview, event_canvasPreview;
let event_ctxTimeline, event_canvasTimeline;
let event_timelineContainer;
let event_previewContainer, event_timelinePanel;

let event_initialized = false;
let event_isPlaying = false;
let event_currentTime = 0;
let event_lastTimestamp = 0;

// 表示・操作関連
let event_pixelsPerSec = 50;
let event_viewStartTime = 0;
let event_previewZoomMode = 'fit'; // 'fit' or number
let event_previewScale = 1.0;

// データ構造
let event_data = {
    composition: {
        name: "New Composition",
        width: 800,
        height: 450,
        duration: 10 // 秒
    },
    layers: []
};

// UI定数
const EVENT_HEADER_HEIGHT = 25;
const EVENT_TRACK_HEIGHT = 30;
const EVENT_LEFT_PANEL_WIDTH = 250;
const EVENT_KEYFRAME_SIZE = 6;
const EVENT_KEYFRAME_HIT_RADIUS = 8;
const EVENT_VALUE_CLICK_WIDTH = 80;
const EVENT_LAYER_HANDLE_WIDTH = 6; // レイヤー端の判定幅

// 操作ステート
// 'idle', 'scrub-time', 'drag-key', 'check-value-edit', 'scrub-value', 
// 'resize-panel', 'drag-preview', 'drag-layer-move', 'drag-layer-in', 'drag-layer-out'
let event_state = 'idle';
let event_dragStartPos = { x: 0, y: 0 };
let event_dragTarget = null; 
let event_selectedLayerIndex = -1;
let event_selectedKey = null;

// --- 初期化 ---
window.initEventEditor = function () {
    if (event_initialized) return;

    console.log("Event Editor Initializing...");

    // DOM取得
    event_canvasPreview = document.getElementById('event-preview-canvas');
    event_ctxPreview = event_canvasPreview.getContext('2d');
    event_canvasTimeline = document.getElementById('event-timeline-canvas');
    event_ctxTimeline = event_canvasTimeline.getContext('2d');
    event_timelineContainer = document.getElementById('event-timeline-container');
    event_previewContainer = document.getElementById('event-preview-container');
    event_timelinePanel = document.getElementById('event-timeline-panel');
    const resizeHandle = document.getElementById('event-resize-handle');

    // イベントリスナー
    event_canvasTimeline.addEventListener('mousedown', event_onTimelineMouseDown);
    window.addEventListener('mousemove', event_onGlobalMouseMove);
    window.addEventListener('mouseup', event_onGlobalMouseUp);
    
    resizeHandle.addEventListener('mousedown', (e) => {
        event_state = 'resize-panel';
        event_dragStartPos = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    });

    event_canvasPreview.addEventListener('mousedown', event_onPreviewMouseDown);

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (!document.getElementById('mode-event').classList.contains('active')) return;

        if (e.code === 'Space') { e.preventDefault(); event_togglePlay(); }
        else if (e.code === 'KeyJ') { event_jumpToPrevKeyframe(); }
        else if (e.code === 'KeyK') { event_jumpToNextKeyframe(); }
        else if (e.code === 'Delete' || e.code === 'Backspace') { event_deleteSelectedKeyframe(); }
        
        // レイヤートリミング (Alt + [ / ])
        // Code判定に変更
        if (e.altKey && event_selectedLayerIndex !== -1) {
            if (e.code === 'BracketLeft') {
                e.preventDefault(); // ブラウザバック等を防止
                event_data.layers[event_selectedLayerIndex].inPoint = event_currentTime;
                // Out点を超えないように
                if (event_data.layers[event_selectedLayerIndex].inPoint > event_data.layers[event_selectedLayerIndex].outPoint) {
                    event_data.layers[event_selectedLayerIndex].inPoint = event_data.layers[event_selectedLayerIndex].outPoint;
                }
                event_draw();
            } else if (e.code === 'BracketRight') {
                e.preventDefault();
                event_data.layers[event_selectedLayerIndex].outPoint = event_currentTime;
                if (event_data.layers[event_selectedLayerIndex].outPoint < event_data.layers[event_selectedLayerIndex].inPoint) {
                    event_data.layers[event_selectedLayerIndex].outPoint = event_data.layers[event_selectedLayerIndex].inPoint;
                }
                event_draw();
            }
        }
    });

    // 初期データ作成
    if (event_data.layers.length === 0) {
        event_addLayer("Player", "image/char.png");
    }

    event_applyCompSettings(true);
    event_pixelsPerSec = parseInt(document.getElementById('event-zoom').value);
    
    requestAnimationFrame(event_loop);
    event_initialized = true;
};

// --- プレビューズーム管理 ---
window.event_updatePreviewZoomUI = function() {
    const sel = document.getElementById('event-preview-zoom-mode');
    const slider = document.getElementById('event-preview-zoom-slider');
    const text = document.getElementById('event-preview-zoom-text');
    
    if (sel.value === 'fit') {
        event_previewZoomMode = 'fit';
        slider.disabled = true;
        text.textContent = 'Fit';
    } else {
        event_previewZoomMode = parseFloat(sel.value);
        slider.disabled = false;
        slider.value = event_previewZoomMode * 100;
        text.textContent = Math.round(event_previewZoomMode * 100) + '%';
    }
    event_draw();
};

window.event_onPreviewZoomSlider = function() {
    const slider = document.getElementById('event-preview-zoom-slider');
    const text = document.getElementById('event-preview-zoom-text');
    const sel = document.getElementById('event-preview-zoom-mode');
    
    const val = parseInt(slider.value);
    event_previewZoomMode = val / 100;
    
    // プルダウンの選択を解除っぽくする(値が一致すれば選択される)
    sel.value = event_previewZoomMode.toString(); 
    if (sel.value === "") {
        // 選択肢にないカスタム値の場合
        // UI上はどうするか... とりあえずFit以外にする
    }
    
    text.textContent = val + '%';
    event_draw();
};

function event_calcPreviewScale() {
    if (event_previewZoomMode === 'fit') {
        const container = document.getElementById('event-preview-container');
        const cw = container.clientWidth - 20; // 余白
        const ch = container.clientHeight - 40; // コントロールバー分
        const compW = event_data.composition.width;
        const compH = event_data.composition.height;
        
        const scaleW = cw / compW;
        const scaleH = ch / compH;
        event_previewScale = Math.min(scaleW, scaleH);
    } else {
        event_previewScale = event_previewZoomMode;
    }
}

// --- コンポジション設定 ---
window.event_openCompSettings = function() {
    const comp = event_data.composition;
    document.getElementById('inp-comp-name').value = comp.name;
    document.getElementById('inp-comp-w').value = comp.width;
    document.getElementById('inp-comp-h').value = comp.height;
    document.getElementById('inp-comp-duration').value = comp.duration;
    document.getElementById('event-comp-modal').style.display = 'flex';
};

window.event_applyCompSettings = function(isInit = false) {
    if (!isInit) {
        const name = document.getElementById('inp-comp-name').value;
        const w = parseInt(document.getElementById('inp-comp-w').value) || 800;
        const h = parseInt(document.getElementById('inp-comp-h').value) || 450;
        const dur = parseFloat(document.getElementById('inp-comp-duration').value) || 10;
        
        event_data.composition.name = name;
        event_data.composition.width = w;
        event_data.composition.height = h;
        event_data.composition.duration = dur;
        document.getElementById('event-comp-modal').style.display = 'none';
    }
    if (event_currentTime > event_data.composition.duration) {
        event_currentTime = event_data.composition.duration;
    }
    event_draw();
};

// --- データ操作 ---
function event_addLayer(name, source) {
    const img = new Image();
    img.src = source;
    img.onload = () => event_draw();

    const cx = event_data.composition.width / 2;
    const cy = event_data.composition.height / 2;

    event_data.layers.push({
        name: name,
        source: source,
        imgObj: img,
        expanded: true,
        inPoint: 0,
        outPoint: event_data.composition.duration,
        tracks: {
            "position": { label: "Position", type: "vector2", keys: [{ time: 0, value: {x: cx, y: cy} }], step: 1 },
            "scale": { label: "Scale", type: "number", keys: [{ time: 0, value: 1.0 }], min: 0, max: 10, step: 0.1 },
            "rotation": { label: "Rotation", type: "rotation", keys: [{ time: 0, value: 0 }], min: -3600, max: 3600, step: 1 },
            "opacity": { label: "Opacity", type: "number", keys: [{ time: 0, value: 100 }], min: 0, max: 100, step: 1 }
        }
    });
    event_selectedLayerIndex = event_data.layers.length - 1;
}

function event_updateKeyframe(layerIndex, prop, time, value) {
    const track = event_data.layers[layerIndex].tracks[prop];
    if (track.type === 'number') {
        if (track.min !== undefined) value = Math.max(track.min, value);
        if (track.max !== undefined) value = Math.min(track.max, value);
    }
    const existingKey = track.keys.find(k => Math.abs(k.time - time) < 0.05);
    const valToSave = (typeof value === 'object') ? { ...value } : value;
    if (existingKey) {
        existingKey.value = valToSave;
        return existingKey;
    } else {
        const newKey = { time: time, value: valToSave };
        track.keys.push(newKey);
        track.keys.sort((a, b) => a.time - b.time);
        return newKey;
    }
}

function event_deleteSelectedKeyframe() {
    if (!event_selectedKey) return;
    const { layerIdx, prop, keyObj } = event_selectedKey;
    const track = event_data.layers[layerIdx].tracks[prop];
    const index = track.keys.indexOf(keyObj);
    if (index !== -1) {
        track.keys.splice(index, 1);
        event_selectedKey = null;
        event_draw();
    }
}

function event_jumpToPrevKeyframe() {
    let targetTime = -1;
    event_data.layers.forEach(l => {
        Object.values(l.tracks).forEach(t => {
            t.keys.forEach(k => {
                if (k.time < event_currentTime - 0.01) {
                    if (k.time > targetTime) targetTime = k.time;
                }
            });
        });
    });
    if (targetTime !== -1) event_seekTo(targetTime);
}

function event_jumpToNextKeyframe() {
    let targetTime = Infinity;
    event_data.layers.forEach(l => {
        Object.values(l.tracks).forEach(t => {
            t.keys.forEach(k => {
                if (k.time > event_currentTime + 0.01) {
                    if (k.time < targetTime) targetTime = k.time;
                }
            });
        });
    });
    if (targetTime !== Infinity) event_seekTo(targetTime);
}

function event_getInterpolatedValue(layerIndex, prop, time) {
    const track = event_data.layers[layerIndex].tracks[prop];
    if (!track.keys.length) {
        if (track.type === 'vector2') return {x:0, y:0};
        return 0;
    }
    const keys = track.keys;
    if (keys.length === 1) return keys[0].value;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i + 1];
        if (time >= k1.time && time < k2.time) {
            const t = (time - k1.time) / (k2.time - k1.time);
            if (typeof k1.value === 'number') {
                return k1.value + (k2.value - k1.value) * t;
            } else if (typeof k1.value === 'object') {
                return {
                    x: k1.value.x + (k2.value.x - k1.value.x) * t,
                    y: k1.value.y + (k2.value.y - k1.value.y) * t
                };
            }
        }
    }
    return keys[0].value;
}

// --- メインループ ---
function event_loop(timestamp) {
    if (document.getElementById('mode-event').classList.contains('active')) {
        if (event_isPlaying) {
            if (!event_lastTimestamp) event_lastTimestamp = timestamp;
            const deltaTime = (timestamp - event_lastTimestamp) / 1000;
            event_currentTime += deltaTime;
            
            if (event_currentTime > event_data.composition.duration) {
                event_currentTime = 0; // ループ
            }
            
            const canvasW = event_canvasTimeline.width;
            const timelineW = canvasW - EVENT_LEFT_PANEL_WIDTH;
            const headScreenX = (event_currentTime - event_viewStartTime) * event_pixelsPerSec;
            if (headScreenX > timelineW * 0.9) {
                event_viewStartTime = event_currentTime - (timelineW * 0.1) / event_pixelsPerSec;
            }
        }
        event_lastTimestamp = timestamp;
        event_draw();
    } else {
        event_isPlaying = false;
    }
    requestAnimationFrame(event_loop);
}

// --- 描画関連 ---
function event_formatValue(val, type) {
    if (type === 'vector2') return `${val.x.toFixed(1)}, ${val.y.toFixed(1)}`;
    else if (type === 'rotation') {
        const rev = Math.floor(val / 360);
        const deg = Math.floor(val % 360);
        return `${rev}+${deg}°`;
    } else return val.toFixed(1);
}

window.event_draw = function () {
    if (!event_canvasTimeline) return;
    event_pixelsPerSec = parseInt(document.getElementById('event-zoom').value);

    // Canvasリサイズ
    const containerW = event_timelineContainer.clientWidth;
    let totalTracks = 0;
    event_data.layers.forEach(l => {
        totalTracks++;
        if (l.expanded) totalTracks += Object.keys(l.tracks).length;
    });
    const requiredHeight = Math.max(event_timelineContainer.clientHeight, EVENT_HEADER_HEIGHT + totalTracks * EVENT_TRACK_HEIGHT + 50);
    
    if (event_canvasTimeline.width !== containerW || event_canvasTimeline.height !== requiredHeight) {
        event_canvasTimeline.width = containerW;
        event_canvasTimeline.height = requiredHeight;
    }

    const ctx = event_ctxTimeline;
    const w = event_canvasTimeline.width;
    const h = event_canvasTimeline.height;
    
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);

    // --- プレビュー描画 ---
    // ズーム計算
    event_calcPreviewScale();
    const scale = event_previewScale;
    
    // Canvasサイズをコンポジション×スケールに合わせる
    const pW = event_data.composition.width * scale;
    const pH = event_data.composition.height * scale;
    if (event_canvasPreview.width !== pW || event_canvasPreview.height !== pH) {
        event_canvasPreview.width = pW;
        event_canvasPreview.height = pH;
    }

    event_ctxPreview.fillStyle = '#000';
    event_ctxPreview.fillRect(0, 0, pW, pH);

    event_ctxPreview.save();
    event_ctxPreview.scale(scale, scale); // 全体をスケール

    // グリッド (中央線)
    event_ctxPreview.strokeStyle = '#333';
    event_ctxPreview.lineWidth = 1;
    event_ctxPreview.beginPath();
    event_ctxPreview.moveTo(event_data.composition.width / 2, 0);
    event_ctxPreview.lineTo(event_data.composition.width / 2, event_data.composition.height);
    event_ctxPreview.moveTo(0, event_data.composition.height / 2);
    event_ctxPreview.lineTo(event_data.composition.width, event_data.composition.height / 2);
    event_ctxPreview.stroke();

    event_data.layers.forEach((layer, idx) => {
        if (event_currentTime < layer.inPoint || event_currentTime > layer.outPoint) return;

        const pos = event_getInterpolatedValue(idx, "position", event_currentTime);
        const lScale = event_getInterpolatedValue(idx, "scale", event_currentTime);
        const rot = event_getInterpolatedValue(idx, "rotation", event_currentTime);
        const opacity = event_getInterpolatedValue(idx, "opacity", event_currentTime);

        event_ctxPreview.save();
        event_ctxPreview.translate(pos.x, pos.y);
        event_ctxPreview.rotate(rot * Math.PI / 180);
        event_ctxPreview.scale(lScale, lScale);
        event_ctxPreview.globalAlpha = opacity / 100;

        if (layer.imgObj && layer.imgObj.complete && layer.imgObj.naturalWidth > 0) {
            const iw = layer.imgObj.naturalWidth;
            const ih = layer.imgObj.naturalHeight;
            event_ctxPreview.drawImage(layer.imgObj, -iw/2, -ih/2);
            if (event_selectedLayerIndex === idx) {
                event_ctxPreview.strokeStyle = '#0ff';
                event_ctxPreview.lineWidth = 2 / lScale;
                event_ctxPreview.strokeRect(-iw/2, -ih/2, iw, ih);
            }
        } else {
            event_ctxPreview.fillStyle = '#48f';
            event_ctxPreview.fillRect(-32, -32, 64, 64);
        }
        event_ctxPreview.restore();
    });
    event_ctxPreview.restore(); // ズーム解除

    // --- タイムライン描画 ---
    
    // ヘッダー
    ctx.save();
    ctx.fillStyle = '#333';
    ctx.fillRect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.strokeStyle = '#555';
    ctx.beginPath(); ctx.moveTo(0, EVENT_HEADER_HEIGHT); ctx.lineTo(w, EVENT_HEADER_HEIGHT); ctx.stroke();

    const viewEndTime = event_viewStartTime + ((w - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
    const secStep = event_pixelsPerSec > 100 ? 0.5 : 1.0;

    // 尺外の背景
    const compDurationX = EVENT_LEFT_PANEL_WIDTH + (event_data.composition.duration - event_viewStartTime) * event_pixelsPerSec;
    ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, h); ctx.clip();
    
    // 尺外を暗く
    ctx.fillStyle = '#111';
    ctx.fillRect(compDurationX, 0, w - compDurationX, h);

    // グリッド
    for (let t = Math.floor(event_viewStartTime); t <= viewEndTime; t += secStep) {
        if (t < 0) continue;
        if (t > event_data.composition.duration) break; // 尺超えたらグリッド描かない

        const x = EVENT_LEFT_PANEL_WIDTH + (t - event_viewStartTime) * event_pixelsPerSec;
        ctx.strokeStyle = '#444'; ctx.beginPath(); ctx.moveTo(x, EVENT_HEADER_HEIGHT); ctx.lineTo(x, h); ctx.stroke();
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, EVENT_HEADER_HEIGHT); ctx.stroke();
        if (Math.floor(t) === t) {
            ctx.fillStyle = '#aaa';
            ctx.fillText(t + 's', x + 3, 14);
        }
    }
    
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(compDurationX, 0); ctx.lineTo(compDurationX, h); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.restore();

    let currentY = EVENT_HEADER_HEIGHT;
    event_data.layers.forEach((layer, layerIdx) => {
        // レイヤー行
        ctx.fillStyle = (layerIdx === event_selectedLayerIndex) ? '#444' : '#3a3a3a';
        ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);
        ctx.strokeStyle = '#222'; ctx.strokeRect(0, currentY, w, EVENT_TRACK_HEIGHT);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif';
        const expandMark = layer.expanded ? "▼" : "▶";
        ctx.fillText(`${expandMark} 📁 ${layer.name}`, 10, currentY + 20);
        
        // --- レイヤーバー (青い部分) ---
        const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
        const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
        const barX = Math.max(EVENT_LEFT_PANEL_WIDTH, inX);
        const barW = Math.max(0, outX - barX);
        
        ctx.save();
        ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, h); ctx.clip();
        if (barW > 0) {
            ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
            ctx.fillRect(barX, currentY + 4, barW, EVENT_TRACK_HEIGHT - 8);
            
            // In/Outハンドル
            ctx.fillStyle = 'rgba(100, 150, 255, 0.8)';
            if (inX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(inX, currentY+4, EVENT_LAYER_HANDLE_WIDTH, EVENT_TRACK_HEIGHT-8);
            if (outX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(outX-EVENT_LAYER_HANDLE_WIDTH, currentY+4, EVENT_LAYER_HANDLE_WIDTH, EVENT_TRACK_HEIGHT-8);
        }
        ctx.restore();
        currentY += EVENT_TRACK_HEIGHT;

        if (layer.expanded) {
            Object.keys(layer.tracks).forEach(propName => {
                const track = layer.tracks[propName];
                ctx.fillStyle = '#2d2d2d'; ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);
                ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.moveTo(0, currentY + EVENT_TRACK_HEIGHT); ctx.lineTo(w, currentY + EVENT_TRACK_HEIGHT); ctx.stroke();
                ctx.fillStyle = '#ddd'; ctx.font = '11px sans-serif'; ctx.fillText(track.label, 30, currentY + 19);

                // 値
                const val = event_getInterpolatedValue(layerIdx, propName, event_currentTime);
                const valText = event_formatValue(val, track.type);
                const valX = EVENT_LEFT_PANEL_WIDTH - 40;
                ctx.fillStyle = '#3a3a3a'; ctx.fillRect(valX - EVENT_VALUE_CLICK_WIDTH, currentY + 4, EVENT_VALUE_CLICK_WIDTH, EVENT_TRACK_HEIGHT - 8);
                ctx.fillStyle = '#8f8'; ctx.textAlign = 'right'; ctx.fillText(valText, valX, currentY + 19); ctx.textAlign = 'left';

                // キーフレーム追加ボタン
                const btnX = EVENT_LEFT_PANEL_WIDTH - 20;
                const btnY = currentY + EVENT_TRACK_HEIGHT / 2;
                ctx.strokeStyle = '#aaa';
                ctx.beginPath(); ctx.moveTo(btnX, btnY - 5); ctx.lineTo(btnX + 5, btnY); ctx.lineTo(btnX, btnY + 5); ctx.lineTo(btnX - 5, btnY); ctx.closePath(); ctx.stroke();
                const hasKey = track.keys.some(k => Math.abs(k.time - event_currentTime) < 0.05);
                if (hasKey) { ctx.fillStyle = '#48f'; ctx.fill(); }

                // キーフレーム
                ctx.save();
                ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, currentY, w - EVENT_LEFT_PANEL_WIDTH, EVENT_TRACK_HEIGHT); ctx.clip();
                track.keys.forEach(key => {
                    // In/Out外のキーフレームは描画しない、または薄くする？ AE仕様だと描画されるが見えなくなる。
                    // 今回は描画するが、レイヤー自体が非表示になるのでプレビューには影響しない。
                    // 視認性のため、In/Out外は少し薄くする処理を入れてもいいが、とりあえずそのまま
                    
                    const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                    const ky = currentY + EVENT_TRACK_HEIGHT / 2;
                    const isSelected = (event_selectedKey && event_selectedKey.keyObj === key);
                    const isDragging = (event_dragTarget && event_dragTarget.type === 'key' && event_dragTarget.obj === key);
                    if (isSelected || isDragging) { ctx.fillStyle = '#ff0'; ctx.strokeStyle = '#fff'; } 
                    else { ctx.fillStyle = '#ddd'; ctx.strokeStyle = '#000'; }
                    ctx.beginPath(); ctx.moveTo(kx, ky - EVENT_KEYFRAME_SIZE); ctx.lineTo(kx + EVENT_KEYFRAME_SIZE, ky); ctx.lineTo(kx, ky + EVENT_KEYFRAME_SIZE); ctx.lineTo(kx - EVENT_KEYFRAME_SIZE, ky); ctx.closePath(); ctx.fill(); ctx.stroke();
                });
                ctx.restore();
                currentY += EVENT_TRACK_HEIGHT;
            });
        }
    });

    // 再生ヘッド
    const headX = EVENT_LEFT_PANEL_WIDTH + (event_currentTime - event_viewStartTime) * event_pixelsPerSec;
    if (headX >= EVENT_LEFT_PANEL_WIDTH && headX <= w) {
        ctx.strokeStyle = '#f00'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(headX, EVENT_HEADER_HEIGHT); ctx.lineTo(headX, h); ctx.stroke();
        ctx.fillStyle = '#f00';
        ctx.beginPath(); ctx.moveTo(headX, EVENT_HEADER_HEIGHT); ctx.lineTo(headX - 6, EVENT_HEADER_HEIGHT - 10); ctx.lineTo(headX + 6, EVENT_HEADER_HEIGHT - 10); ctx.fill();
    }

    ctx.clearRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.fillStyle = '#444'; ctx.fillRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.strokeStyle = '#555'; ctx.strokeRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.fillStyle = '#48f'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'left';
    ctx.fillText(event_currentTime.toFixed(2) + "s", 10, 19);
};

// --- インライン入力表示 (変更なし) ---
function event_showInlineInput(x, y, initialValue, trackType, callback) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialValue;
    input.style.position = 'absolute';
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.width = '80px';
    input.style.zIndex = '1000';
    const commit = () => {
        const valStr = input.value;
        let finalVal = null;
        if (trackType === 'vector2') {
            const parts = valStr.split(',');
            if (parts.length === 2) {
                const px = parseFloat(parts[0]);
                const py = parseFloat(parts[1]);
                if (!isNaN(px) && !isNaN(py)) finalVal = { x: px, y: py };
            }
        } else if (trackType === 'rotation') {
            if (valStr.includes('+')) {
                const parts = valStr.split('+');
                const rev = parseFloat(parts[0]);
                const deg = parseFloat(parts[1]);
                if (!isNaN(rev) && !isNaN(deg)) finalVal = rev * 360 + deg;
            } else {
                const f = parseFloat(valStr);
                if (!isNaN(f)) finalVal = f;
            }
        } else {
            const f = parseFloat(valStr);
            if (!isNaN(f)) finalVal = f;
        }
        if (finalVal !== null) callback(finalVal);
        if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    input.addEventListener('blur', commit);
    event_timelineContainer.appendChild(input);
    input.focus();
}

// --- 操作イベント ---
function event_onTimelineMouseDown(e) {
    const rect = event_canvasTimeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + event_timelineContainer.scrollTop;

    if (y < EVENT_HEADER_HEIGHT && x > EVENT_LEFT_PANEL_WIDTH) {
        event_state = 'scrub-time';
        event_updateSeekFromMouse(x);
        return;
    }

    let currentY = EVENT_HEADER_HEIGHT;
    for (let i = 0; i < event_data.layers.length; i++) {
        const layer = event_data.layers[i];
        
        // レイヤー行
        if (y >= currentY && y < currentY + EVENT_TRACK_HEIGHT) {
            if (x < EVENT_LEFT_PANEL_WIDTH) {
                layer.expanded = !layer.expanded;
                event_selectedLayerIndex = i;
                event_selectedKey = null;
                event_draw();
            } else {
                // レイヤーバーの判定 (In/Out/Body)
                const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
                
                // 判定幅
                const hw = EVENT_LAYER_HANDLE_WIDTH;
                
                // 左端
                if (Math.abs(x - inX) <= hw) {
                    event_state = 'drag-layer-in';
                    event_selectedLayerIndex = i;
                    event_dragTarget = { layerIdx: i };
                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                }
                // 右端
                else if (Math.abs(x - outX) <= hw) {
                    event_state = 'drag-layer-out';
                    event_selectedLayerIndex = i;
                    event_dragTarget = { layerIdx: i };
                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                }
                // 本体
                else if (x > inX && x < outX) {
                    event_state = 'drag-layer-move';
                    event_selectedLayerIndex = i;
                    event_dragTarget = { layerIdx: i, startIn: layer.inPoint, startOut: layer.outPoint };
                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                } else {
                    // 空白クリック -> 選択だけ
                    event_selectedLayerIndex = i;
                }
                event_draw();
            }
            return;
        }
        currentY += EVENT_TRACK_HEIGHT;

        if (layer.expanded) {
            const props = Object.keys(layer.tracks);
            for (let j = 0; j < props.length; j++) {
                const prop = props[j];
                const track = layer.tracks[prop];

                if (y >= currentY && y < currentY + EVENT_TRACK_HEIGHT) {
                    if (x < EVENT_LEFT_PANEL_WIDTH) {
                        const valRightX = EVENT_LEFT_PANEL_WIDTH - 40;
                        if (x > valRightX - EVENT_VALUE_CLICK_WIDTH && x < valRightX + 10) {
                            event_state = 'check-value-edit';
                            event_dragStartPos = { x: e.clientX, y: e.clientY };
                            const curVal = event_getInterpolatedValue(i, prop, event_currentTime);
                            event_dragTarget = { 
                                type: 'value', layerIdx: i, prop: prop, startVal: curVal, step: track.step, trackType: track.type,
                                originX: x, originY: y, min: track.min, max: track.max
                            };
                            return;
                        }
                        const btnX = EVENT_LEFT_PANEL_WIDTH - 20;
                        if (Math.abs(x - btnX) < 10) {
                            const val = event_getInterpolatedValue(i, prop, event_currentTime);
                            const newKey = event_updateKeyframe(i, prop, event_currentTime, val);
                            event_selectedKey = { layerIdx: i, prop: prop, keyObj: newKey };
                            event_draw();
                            return;
                        }
                    } else {
                        let hit = false;
                        for (let k = 0; k < track.keys.length; k++) {
                            const key = track.keys[k];
                            const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                            if (Math.abs(x - kx) <= EVENT_KEYFRAME_HIT_RADIUS) {
                                event_state = 'drag-key';
                                event_dragTarget = { type: 'key', obj: key, layerIdx: i, prop: prop };
                                event_selectedKey = { layerIdx: i, prop: prop, keyObj: key };
                                event_draw();
                                hit = true;
                                break;
                            }
                        }
                        if (hit) return;
                    }
                }
                currentY += EVENT_TRACK_HEIGHT;
            }
        }
    }

    if (x > EVENT_LEFT_PANEL_WIDTH) {
        event_selectedKey = null;
        event_state = 'scrub-time';
        event_updateSeekFromMouse(x);
    }
}

function event_onGlobalMouseMove(e) {
    if (!document.getElementById('mode-event').classList.contains('active')) return;
    
    // カーソル処理 (ホバー時)
    if (event_state === 'idle') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top + event_timelineContainer.scrollTop;
        
        let cursor = 'default';
        if (x > EVENT_LEFT_PANEL_WIDTH && y > EVENT_HEADER_HEIGHT) {
            cursor = 'default';
            // レイヤーバー端判定
            let currentY = EVENT_HEADER_HEIGHT;
            for (let i = 0; i < event_data.layers.length; i++) {
                const layer = event_data.layers[i];
                if (y >= currentY && y < currentY + EVENT_TRACK_HEIGHT) {
                    const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                    const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
                    if (Math.abs(x - inX) <= EVENT_LAYER_HANDLE_WIDTH || Math.abs(x - outX) <= EVENT_LAYER_HANDLE_WIDTH) {
                        cursor = 'ew-resize';
                    } else if (x > inX && x < outX) {
                        cursor = 'move';
                    }
                }
                currentY += EVENT_TRACK_HEIGHT;
                if (layer.expanded) currentY += Object.keys(layer.tracks).length * EVENT_TRACK_HEIGHT;
            }
        }
        event_canvasTimeline.style.cursor = cursor;
        return;
    }

    if (event_state === 'resize-panel') {
        const workspace = document.getElementById('event-workspace');
        const workspaceRect = workspace.getBoundingClientRect();
        const relativeY = e.clientY - workspaceRect.top;
        const percentage = (relativeY / workspaceRect.height) * 100;
        if (percentage > 20 && percentage < 80) {
            event_previewContainer.style.height = `${percentage}%`;
            event_draw();
        }
    }
    else if (event_state === 'check-value-edit') {
        if (Math.abs(e.clientX - event_dragStartPos.x) > 3) event_state = 'scrub-value';
    }
    else if (event_state === 'scrub-value') {
        const delta = e.clientX - event_dragStartPos.x;
        const target = event_dragTarget;
        let newVal;
        if (target.trackType === 'vector2') {
            newVal = { ...target.startVal };
            newVal.x += delta * target.step;
        } else {
            newVal = target.startVal + delta * target.step;
            if (target.min !== undefined) newVal = Math.max(target.min, newVal);
            if (target.max !== undefined) newVal = Math.min(target.max, newVal);
        }
        event_updateKeyframe(target.layerIdx, target.prop, event_currentTime, newVal);
        event_draw();
    }
    else if (event_state === 'scrub-time') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x > EVENT_LEFT_PANEL_WIDTH) {
            let time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
            time = Math.min(time, event_data.composition.duration); // 尺制限
            event_seekTo(time);
        }
    }
    else if (event_state === 'drag-key') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
        event_dragTarget.obj.time = Math.max(0, time);
        event_draw();
    }
    else if (event_state === 'drag-preview') {
        const rect = event_canvasPreview.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // ズーム考慮
        const dx = (mx - event_dragStartPos.x) / event_previewScale;
        const dy = (my - event_dragStartPos.y) / event_previewScale;
        const newX = event_dragTarget.startX + dx;
        const newY = event_dragTarget.startY + dy;
        event_updateKeyframe(event_dragTarget.layerIdx, "position", event_currentTime, {x: newX, y: newY});
        event_draw();
    }
    // レイヤー操作
    else if (event_state === 'drag-layer-in') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
        const layer = event_data.layers[event_dragTarget.layerIdx];
        layer.inPoint = Math.min(time, layer.outPoint);
        event_draw();
    }
    else if (event_state === 'drag-layer-out') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
        const layer = event_data.layers[event_dragTarget.layerIdx];
        layer.outPoint = Math.max(time, layer.inPoint);
        event_draw();
    }
    else if (event_state === 'drag-layer-move') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const dt = (x - event_dragStartPos.x) / event_pixelsPerSec;
        const layer = event_data.layers[event_dragTarget.layerIdx];
        
        // 移動後のIn/Out
        let newIn = event_dragTarget.startIn + dt;
        let newOut = event_dragTarget.startOut + dt;
        
        // キーフレームも一緒に動かす
        const timeOffset = newIn - layer.inPoint;
        layer.inPoint = newIn;
        layer.outPoint = newOut;
        
        // 全キーフレームを移動
        Object.values(layer.tracks).forEach(track => {
            track.keys.forEach(key => {
                key.time += timeOffset;
            });
        });
        
        // ドラッグ開始位置更新（連続移動のため）
        // キーフレーム移動のために前の位置を覚えておく必要があるが、
        // 上記ロジックだとstartPos基準で差分計算しているため、
        // 毎回startIn基準で計算しなおせば累積誤差が出ない。
        // ただしキーフレームは破壊的に更新しているので、差分を加算する必要がある。
        // -> いや、startIn/Outを基準にしているので、layer.inPointへの代入はOKだが、
        // キーフレームへの加算は「前フレームからの差分」か「初期位置からの差分」にする必要がある。
        // ここでは簡単に実装するため、dragStartPosを更新していくスタイルにする。
        
        // 修正: 差分(dt)を計算して適用後、現在位置をstartPosとして更新
        event_dragStartPos = { x: e.clientX, y: e.clientY };
        
        // dtは (今回X - 前回X) / pixelsPerSec
        const stepDt = (e.clientX - (event_dragStartPos.x - (e.clientX - event_dragStartPos.x))) / event_pixelsPerSec; 
        // ↑わかりにくいので再計算
        // event_dragStartPosは「前回のマウス位置」として使う
    }
}
// moveイベント修正 (レイヤー移動用)
// 上記のdrag-layer-moveロジックは少しバグりやすいので、MouseUpまで待たずにリアルタイム反映する場合、
// 直前のマウス位置からの差分を使うのが安全。

// event_onGlobalMouseMoveの一部書き換え
/*
    else if (event_state === 'drag-layer-move') {
        const deltaX = e.clientX - event_dragStartPos.x;
        const dt = deltaX / event_pixelsPerSec;
        const layer = event_data.layers[event_dragTarget.layerIdx];
        
        layer.inPoint += dt;
        layer.outPoint += dt;
        Object.values(layer.tracks).forEach(track => {
            track.keys.forEach(key => key.time += dt);
        });
        
        event_dragStartPos = { x: e.clientX, y: e.clientY }; // 位置更新
        event_draw();
    }
*/

function event_onGlobalMouseUp(e) {
    if (event_state === 'check-value-edit') {
        const target = event_dragTarget;
        let initStr = "";
        if (target.trackType === 'vector2') initStr = `${target.startVal.x},${target.startVal.y}`;
        else if (target.trackType === 'rotation') {
            const r = Math.floor(target.startVal/360);
            const d = Math.floor(target.startVal%360);
            initStr = `${r}+${d}`;
        } else {
            initStr = target.startVal.toString();
        }
        event_showInlineInput(target.originX - 40, target.originY, initStr, target.trackType, (newVal) => {
            event_updateKeyframe(target.layerIdx, target.prop, event_currentTime, newVal);
            event_draw();
        });
    }
    else if (event_state === 'drag-key') {
        const t = event_dragTarget;
        const layer = event_data.layers[t.layerIdx];
        layer.tracks[t.prop].keys.sort((a, b) => a.time - b.time);
        event_draw();
    }
    else if (event_state === 'drag-preview') {
        const layer = event_data.layers[event_dragTarget.layerIdx];
        const track = layer.tracks["position"];
        const key = track.keys.find(k => Math.abs(k.time - event_currentTime) < 0.05);
        if (key) {
            event_selectedKey = { layerIdx: event_dragTarget.layerIdx, prop: "position", keyObj: key };
            event_draw();
        }
    }
    // レイヤー移動後の後処理などがあればここ
    
    event_state = 'idle';
    event_dragTarget = null;
}

// GlobalMouseMoveの修正版再定義 (スコープの関係で上書きが必要)
window.event_onGlobalMouseMove = function(e) {
    if (!document.getElementById('mode-event').classList.contains('active')) return;
    
    // カーソル変更ロジック (idle時)
    if (event_state === 'idle') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top + event_timelineContainer.scrollTop;
        
        let cursor = 'default';
        if (x > EVENT_LEFT_PANEL_WIDTH && y > EVENT_HEADER_HEIGHT) {
            cursor = 'default';
            let currentY = EVENT_HEADER_HEIGHT;
            for (let i = 0; i < event_data.layers.length; i++) {
                const layer = event_data.layers[i];
                if (y >= currentY && y < currentY + EVENT_TRACK_HEIGHT) {
                    const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                    const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
                    if (Math.abs(x - inX) <= EVENT_LAYER_HANDLE_WIDTH || Math.abs(x - outX) <= EVENT_LAYER_HANDLE_WIDTH) {
                        cursor = 'ew-resize';
                    } else if (x > inX && x < outX) {
                        cursor = 'move';
                    }
                }
                currentY += EVENT_TRACK_HEIGHT;
                if (layer.expanded) currentY += Object.keys(layer.tracks).length * EVENT_TRACK_HEIGHT;
            }
        }
        event_canvasTimeline.style.cursor = cursor;
        return;
    }

    if (event_state === 'resize-panel') {
        const workspace = document.getElementById('event-workspace');
        const workspaceRect = workspace.getBoundingClientRect();
        const relativeY = e.clientY - workspaceRect.top;
        const percentage = (relativeY / workspaceRect.height) * 100;
        if (percentage > 20 && percentage < 80) {
            event_previewContainer.style.height = `${percentage}%`;
            event_draw();
        }
    }
    else if (event_state === 'check-value-edit') {
        if (Math.abs(e.clientX - event_dragStartPos.x) > 3) event_state = 'scrub-value';
    }
    else if (event_state === 'scrub-value') {
        const delta = e.clientX - event_dragStartPos.x;
        const target = event_dragTarget;
        let newVal;
        if (target.trackType === 'vector2') {
            newVal = { ...target.startVal };
            newVal.x += delta * target.step;
        } else {
            newVal = target.startVal + delta * target.step;
            if (target.min !== undefined) newVal = Math.max(target.min, newVal);
            if (target.max !== undefined) newVal = Math.min(target.max, newVal);
        }
        event_updateKeyframe(target.layerIdx, target.prop, event_currentTime, newVal);
        event_draw();
    }
    else if (event_state === 'scrub-time') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x > EVENT_LEFT_PANEL_WIDTH) {
            let time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
            time = Math.max(0, Math.min(time, event_data.composition.duration));
            event_seekTo(time);
        }
    }
    else if (event_state === 'drag-key') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
        event_dragTarget.obj.time = Math.max(0, time);
        event_draw();
    }
    else if (event_state === 'drag-preview') {
        const rect = event_canvasPreview.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const dx = (mx - event_dragStartPos.x) / event_previewScale;
        const dy = (my - event_dragStartPos.y) / event_previewScale;
        const newX = event_dragTarget.startX + dx;
        const newY = event_dragTarget.startY + dy;
        event_updateKeyframe(event_dragTarget.layerIdx, "position", event_currentTime, {x: newX, y: newY});
        event_draw();
    }
    else if (event_state === 'drag-layer-in') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
        const layer = event_data.layers[event_dragTarget.layerIdx];
        layer.inPoint = Math.min(time, layer.outPoint);
        event_draw();
    }
    else if (event_state === 'drag-layer-out') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = event_viewStartTime + ((x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
        const layer = event_data.layers[event_dragTarget.layerIdx];
        layer.outPoint = Math.max(time, layer.inPoint);
        event_draw();
    }
    else if (event_state === 'drag-layer-move') {
        const deltaX = e.clientX - event_dragStartPos.x;
        const dt = deltaX / event_pixelsPerSec;
        const layer = event_data.layers[event_dragTarget.layerIdx];
        
        layer.inPoint += dt;
        layer.outPoint += dt;
        Object.values(layer.tracks).forEach(track => {
            track.keys.forEach(key => key.time += dt);
        });
        
        event_dragStartPos = { x: e.clientX, y: e.clientY };
        event_draw();
    }
}

function event_onPreviewMouseDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const rect = event_canvasPreview.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // ズーム座標変換
    const compMx = mx / event_previewScale;
    const compMy = my / event_previewScale;

    for (let i = event_data.layers.length - 1; i >= 0; i--) {
        const layer = event_data.layers[i];
        if (event_currentTime < layer.inPoint || event_currentTime > layer.outPoint) continue;
        if (!layer.imgObj) continue;

        const pos = event_getInterpolatedValue(i, "position", event_currentTime);
        const iw = layer.imgObj.naturalWidth || 64;
        const ih = layer.imgObj.naturalHeight || 64;
        
        if (compMx >= pos.x - iw/2 && compMx <= pos.x + iw/2 && compMy >= pos.y - ih/2 && compMy <= pos.y + ih/2) {
            event_selectedLayerIndex = i;
            event_state = 'drag-preview';
            event_dragStartPos = { x: mx, y: my };
            event_dragTarget = { layerIdx: i, startX: pos.x, startY: pos.y };
            event_draw();
            return;
        }
    }
    event_selectedLayerIndex = -1;
    event_draw();
}

function event_updateSeekFromMouse(mouseX) {
    if (mouseX < EVENT_LEFT_PANEL_WIDTH) return;
    let time = event_viewStartTime + ((mouseX - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
    time = Math.max(0, Math.min(time, event_data.composition.duration));
    event_seekTo(time);
}

// --- 再生制御 ---
window.event_seekTo = function (time) {
    event_currentTime = Math.max(0, time);
    event_draw();
};

window.event_togglePlay = function () {
    event_isPlaying = !event_isPlaying;
    const btn = document.getElementById('btn-event-play');
    if (btn) btn.textContent = event_isPlaying ? '⏸' : '▶';
    if (event_isPlaying) event_lastTimestamp = performance.now();
};

window.event_stop = function () {
    event_isPlaying = false;
    event_currentTime = 0;
    event_viewStartTime = 0;
    document.getElementById('btn-event-play').textContent = '▶';
    event_draw();
};