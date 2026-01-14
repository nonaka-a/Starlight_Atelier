/**
 * 譜面エディタ (かた抜きゲーム用) ロジック
 * 修正版: シーク挙動改善、ロングノーツリサイズ対応、秒数グリッド表示切替
 */

// --- 変数定義 ---
let chart_ctx;
let chart_canvas;
let chart_container;
let chart_data = []; // { time: float, lane: 'red'|'blue', type: 'normal'|'long', duration: float }

// オーディオ関連
let chart_audioCtx;
let chart_audioBuffer = null;
let chart_sourceNode = null;
let chart_isPlaying = false;
let chart_startTime = 0; // 再生開始時のコンテキスト時間
let chart_pauseTime = 0; // 一時停止時の再生位置(秒)

// エディタ表示・操作関連
let chart_pixelsPerSec = 100;
let chart_viewStartTime = 0;
let chart_initialized = false;

// 編集操作用ステート
let chart_selectedIndices = new Set();

// ドラッグ操作（移動）
let chart_isDragging = false;
let chart_dragStartX = 0;
let chart_dragStartY = 0;
let chart_dragStartTimes = {}; // index -> originalTime
let chart_dragStartLanes = {}; // index -> originalLane

// リサイズ操作（ロングノーツ）
let chart_isResizing = false;
let chart_resizeIndex = -1;
let chart_resizeStartDuration = 0;

// 範囲選択
let chart_isSelecting = false;
let chart_selectionRect = { startX: 0, startY: 0, endX: 0, endY: 0 };

// 定数
const CHART_LANE_HEIGHT = 80;
const CHART_RED_LANE_Y = 100;
const CHART_BLUE_LANE_Y = 220;
const RESIZE_HANDLE_WIDTH = 10; // ロングノーツ端のリサイズ判定幅

// --- 初期化 ---
window.initChartEditor = function () {
    if (chart_initialized) return;
    
    console.log("Chart Editor Initializing...");
    
    chart_canvas = document.getElementById('chart-canvas');
    chart_ctx = chart_canvas.getContext('2d');
    chart_container = document.getElementById('chart-canvas-container');

    // イベントリスナー設定
    chart_canvas.addEventListener('mousedown', chart_onCanvasMouseDown);
    window.addEventListener('mousemove', chart_onCanvasMouseMove);
    window.addEventListener('mouseup', chart_onCanvasMouseUp);
    chart_canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // キーイベント
    window.addEventListener('keydown', chart_onKeyDown);

    // 音楽ファイル読み込み
    document.getElementById('chart-music-input').addEventListener('change', chart_loadMusic);

    // Zoom初期値反映
    chart_pixelsPerSec = parseInt(document.getElementById('chart-zoom').value);

    // AudioContext初期化
    chart_audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    requestAnimationFrame(chart_loop);
    chart_initialized = true;
    chart_draw();
};

// --- メインループ ---
function chart_loop() {
    if (document.getElementById('mode-chart').classList.contains('active')) {
        chart_updatePlaybackState();
        chart_draw();
    }
    requestAnimationFrame(chart_loop);
}

function chart_updatePlaybackState() {
    if (chart_isPlaying) {
        const currentTime = chart_audioCtx.currentTime - chart_startTime;
        
        if (chart_audioBuffer && currentTime >= chart_audioBuffer.duration) {
            chart_stop();
            chart_pauseTime = 0;
            return;
        }
        
        // 再生中はヘッド追従（画面左から1/4位置をキープ）
        const canvasW = chart_canvas.width;
        const headScreenX = (currentTime - chart_viewStartTime) * chart_pixelsPerSec;
        const targetHeadX = canvasW * 0.25;

        // 画面外に出そうになったらスクロール（スムーズに）
        if (headScreenX > canvasW * 0.8 || headScreenX < 0) {
             chart_viewStartTime = currentTime - (targetHeadX / chart_pixelsPerSec);
        } else {
             // 通常再生時は自動スクロールさせる（常に追従）
             chart_viewStartTime = currentTime - (targetHeadX / chart_pixelsPerSec);
        }

        document.getElementById('chart-time-display').textContent = currentTime.toFixed(2);
    } else {
        document.getElementById('chart-time-display').textContent = chart_pauseTime.toFixed(2);
    }
}

// --- 描画 ---
window.chart_draw = function() {
    if (!chart_canvas) return;

    chart_pixelsPerSec = parseInt(document.getElementById('chart-zoom').value);

    // キャンバスサイズ調整
    const containerW = chart_container.clientWidth;
    const containerH = chart_container.clientHeight;
    if (chart_canvas.width !== containerW || chart_canvas.height !== containerH) {
        chart_canvas.width = containerW;
        chart_canvas.height = containerH;
    }

    // 背景
    chart_ctx.fillStyle = '#222';
    chart_ctx.fillRect(0, 0, chart_canvas.width, chart_canvas.height);

    // レーン背景
    chart_ctx.fillStyle = '#2a1a1a';
    chart_ctx.fillRect(0, CHART_RED_LANE_Y, chart_canvas.width, CHART_LANE_HEIGHT);
    chart_ctx.fillStyle = '#1a1a2a';
    chart_ctx.fillRect(0, CHART_BLUE_LANE_Y, chart_canvas.width, CHART_LANE_HEIGHT);
    
    chart_ctx.strokeStyle = '#ef5350';
    chart_ctx.lineWidth = 2;
    chart_ctx.strokeRect(0, CHART_RED_LANE_Y, chart_canvas.width, CHART_LANE_HEIGHT);
    
    chart_ctx.strokeStyle = '#42a5f5';
    chart_ctx.strokeRect(0, CHART_BLUE_LANE_Y, chart_canvas.width, CHART_LANE_HEIGHT);

    // グリッド共通変数
    const bpm = parseFloat(document.getElementById('chart-bpm').value) || 120;
    const offset = parseFloat(document.getElementById('chart-offset').value) || 0;
    const beatInterval = 60 / bpm;
    const viewEndTime = chart_viewStartTime + (chart_canvas.width / chart_pixelsPerSec);

    // 秒数グリッド描画判定
    const showSecGrid = document.getElementById('chart-show-sec-grid') ? document.getElementById('chart-show-sec-grid').checked : true;

    // 秒数グリッド
    if (showSecGrid) {
        chart_ctx.strokeStyle = '#444';
        chart_ctx.lineWidth = 1;
        for (let t = Math.floor(chart_viewStartTime); t <= viewEndTime; t++) {
            const x = (t - chart_viewStartTime) * chart_pixelsPerSec;
            chart_ctx.beginPath(); 
            chart_ctx.moveTo(x, 0); 
            chart_ctx.lineTo(x, chart_canvas.height); 
            chart_ctx.stroke();
            
            chart_ctx.fillStyle = '#666'; 
            chart_ctx.font = '10px sans-serif'; 
            chart_ctx.fillText(t + 's', x + 2, 10);
        }
    }

    // BPMグリッド (常に描画)
    if (bpm > 0) {
        const startBeat = Math.floor((chart_viewStartTime - offset) / beatInterval);
        const endBeat = Math.ceil((viewEndTime - offset) / beatInterval);
        for (let i = startBeat; i <= endBeat; i++) {
            const t = offset + i * beatInterval;
            const x = (t - chart_viewStartTime) * chart_pixelsPerSec;
            if (i % 4 === 0) {
                chart_ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; chart_ctx.lineWidth = 2;
            } else {
                chart_ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; chart_ctx.lineWidth = 1;
            }
            chart_ctx.beginPath(); chart_ctx.moveTo(x, 0); chart_ctx.lineTo(x, chart_canvas.height); chart_ctx.stroke();
        }
    }

    // 範囲選択矩形
    if (chart_isSelecting) {
        const rectX = chart_selectionRect.startX;
        const rectY = chart_selectionRect.startY;
        const rectW = chart_selectionRect.endX - chart_selectionRect.startX;
        const rectH = chart_selectionRect.endY - chart_selectionRect.startY;
        
        chart_ctx.fillStyle = 'rgba(0, 123, 255, 0.2)';
        chart_ctx.fillRect(rectX, rectY, rectW, rectH);
        chart_ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
        chart_ctx.strokeRect(rectX, rectY, rectW, rectH);
    }

    // ノーツ描画
    chart_data.forEach((note, index) => {
        const noteEnd = note.type === 'long' ? note.time + note.duration : note.time;
        if (noteEnd < chart_viewStartTime || note.time > chart_viewStartTime + (chart_canvas.width / chart_pixelsPerSec)) return;

        const x = (note.time - chart_viewStartTime) * chart_pixelsPerSec;
        const y = note.lane === 'red' ? CHART_RED_LANE_Y : CHART_BLUE_LANE_Y;
        const baseColor = note.lane === 'red' ? '#e53935' : '#1e88e5';
        
        const isSelected = chart_selectedIndices.has(index);
        
        chart_ctx.fillStyle = isSelected ? '#fff176' : baseColor;
        chart_ctx.strokeStyle = '#fff';
        chart_ctx.lineWidth = 2;

        if (note.type === 'normal') {
            chart_ctx.beginPath();
            chart_ctx.arc(x, y + CHART_LANE_HEIGHT/2, 20, 0, Math.PI * 2);
            chart_ctx.fill();
            chart_ctx.stroke();
        } else if (note.type === 'long') {
            const w = note.duration * chart_pixelsPerSec;
            chart_ctx.fillRect(x, y + 10, w, CHART_LANE_HEIGHT - 20);
            chart_ctx.strokeRect(x, y + 10, w, CHART_LANE_HEIGHT - 20);
            
            // リサイズハンドル（右端）
            if (isSelected) {
                chart_ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                chart_ctx.fillRect(x + w - RESIZE_HANDLE_WIDTH, y + 10, RESIZE_HANDLE_WIDTH, CHART_LANE_HEIGHT - 20);
            }
        }
    });

    // 再生ヘッド
    let currentTime = chart_isPlaying ? (chart_audioCtx.currentTime - chart_startTime) : chart_pauseTime;
    const headX = (currentTime - chart_viewStartTime) * chart_pixelsPerSec;
    chart_ctx.strokeStyle = '#0f0';
    chart_ctx.lineWidth = 2;
    chart_ctx.beginPath(); chart_ctx.moveTo(headX, 0); chart_ctx.lineTo(headX, chart_canvas.height); chart_ctx.stroke();
};

// --- 操作イベント ---
function chart_onCanvasMouseDown(e) {
    if (!chart_canvas) return;
    const rect = chart_canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const clickTime = chart_viewStartTime + (mouseX / chart_pixelsPerSec);

    // ノーツクリック判定
    let clickedIndex = -1;
    let isResizeArea = false;
    let minDist = Infinity;

    chart_data.forEach((note, index) => {
        const noteX = (note.time - chart_viewStartTime) * chart_pixelsPerSec;
        const noteY = note.lane === 'red' ? CHART_RED_LANE_Y : CHART_BLUE_LANE_Y;
        
        if (mouseY >= noteY && mouseY <= noteY + CHART_LANE_HEIGHT) {
            if (note.type === 'normal') {
                const dist = Math.abs(mouseX - noteX);
                if (dist < 20) {
                    if (dist < minDist) { minDist = dist; clickedIndex = index; isResizeArea = false; }
                }
            } else {
                const w = note.duration * chart_pixelsPerSec;
                if (mouseX >= noteX && mouseX <= noteX + w) {
                    clickedIndex = index;
                    // リサイズ判定 (右端付近)
                    if (mouseX >= noteX + w - RESIZE_HANDLE_WIDTH) {
                        isResizeArea = true;
                    } else {
                        isResizeArea = false;
                    }
                }
            }
        }
    });

    if (e.shiftKey) {
        // Shift+Click: 範囲選択追加 or 新規ロングノーツ
        if (clickedIndex !== -1) {
            if (chart_selectedIndices.has(clickedIndex)) chart_selectedIndices.delete(clickedIndex);
            else chart_selectedIndices.add(clickedIndex);
        } else {
            // 新規ロングノーツ配置
            let lane = null;
            if (mouseY >= CHART_RED_LANE_Y && mouseY <= CHART_RED_LANE_Y + CHART_LANE_HEIGHT) lane = 'red';
            else if (mouseY >= CHART_BLUE_LANE_Y && mouseY <= CHART_BLUE_LANE_Y + CHART_LANE_HEIGHT) lane = 'blue';
            
            if (lane) {
                chart_data.push({ time: clickTime, lane: lane, type: 'long', duration: 1.0 });
                chart_selectedIndices.clear();
                chart_selectedIndices.add(chart_data.length - 1);
                chart_draw();
            }
        }
    } else {
        // 通常クリック
        if (clickedIndex !== -1) {
            // ノーツ選択
            if (!chart_selectedIndices.has(clickedIndex)) {
                if (!e.ctrlKey && !e.metaKey) chart_selectedIndices.clear();
                chart_selectedIndices.add(clickedIndex);
            }

            if (isResizeArea && chart_data[clickedIndex].type === 'long') {
                // リサイズ開始
                chart_isResizing = true;
                chart_resizeIndex = clickedIndex;
                chart_resizeStartDuration = chart_data[clickedIndex].duration;
                chart_dragStartX = mouseX; // X座標の差分計算用
            } else {
                // 移動ドラッグ開始
                chart_isDragging = true;
                chart_dragStartX = mouseX;
                chart_dragStartY = mouseY;
                chart_dragStartTimes = {};
                chart_dragStartLanes = {};
                chart_selectedIndices.forEach(idx => {
                    chart_dragStartTimes[idx] = chart_data[idx].time;
                    chart_dragStartLanes[idx] = chart_data[idx].lane;
                });
            }
        } else {
            // 空白クリック
            if (!e.ctrlKey && !e.metaKey) {
                chart_selectedIndices.clear();
                
                // 再生ヘッドの移動のみ（スクロールしない）
                chart_seekTo(clickTime, false);
            }
            
            // 範囲選択開始
            chart_isSelecting = true;
            chart_selectionRect.startX = mouseX;
            chart_selectionRect.startY = mouseY;
            chart_selectionRect.endX = mouseX;
            chart_selectionRect.endY = mouseY;
        }
    }
    
    chart_draw();
}

function chart_onCanvasMouseMove(e) {
    if (document.getElementById('mode-chart').classList.contains('active') === false) return;
    if (!chart_canvas) return;
    
    const rect = chart_canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // カーソル変更処理 (リサイズエリア上にいるか)
    let cursor = 'default';
    if (!chart_isDragging && !chart_isResizing && !chart_isSelecting) {
        chart_data.forEach((note) => {
            if (note.type === 'long') {
                const noteX = (note.time - chart_viewStartTime) * chart_pixelsPerSec;
                const noteY = note.lane === 'red' ? CHART_RED_LANE_Y : CHART_BLUE_LANE_Y;
                const w = note.duration * chart_pixelsPerSec;
                // 右端のリサイズエリア判定
                if (mouseX >= noteX + w - RESIZE_HANDLE_WIDTH && mouseX <= noteX + w &&
                    mouseY >= noteY && mouseY <= noteY + CHART_LANE_HEIGHT) {
                    cursor = 'ew-resize';
                }
            }
        });
    }
    if (chart_isResizing) cursor = 'ew-resize';
    chart_canvas.style.cursor = cursor;

    // 操作処理
    if (chart_isResizing) {
        const timeDelta = (mouseX - chart_dragStartX) / chart_pixelsPerSec;
        let newDuration = chart_resizeStartDuration + timeDelta;
        if (newDuration < 0.1) newDuration = 0.1; // 最小長さ制限
        
        chart_data[chart_resizeIndex].duration = newDuration;
        chart_draw();
        
    } else if (chart_isDragging) {
        const timeDelta = (mouseX - chart_dragStartX) / chart_pixelsPerSec;
        const yDelta = mouseY - chart_dragStartY;
        
        chart_selectedIndices.forEach(idx => {
            const originalTime = chart_dragStartTimes[idx];
            let newTime = originalTime + timeDelta;
            if (newTime < 0) newTime = 0;
            chart_data[idx].time = newTime;

            const originalLane = chart_dragStartLanes[idx];
            let targetLane = originalLane;
            if (originalLane === 'red' && yDelta > 60) targetLane = 'blue';
            else if (originalLane === 'blue' && yDelta < -60) targetLane = 'red';
            chart_data[idx].lane = targetLane;
        });
        chart_draw();
        
    } else if (chart_isSelecting) {
        chart_selectionRect.endX = mouseX;
        chart_selectionRect.endY = mouseY;
        chart_draw();
    }
}

function chart_onCanvasMouseUp(e) {
    if (!chart_canvas) return;
    
    // 操作終了処理
    if (chart_isResizing) {
        chart_isResizing = false;
        chart_draw();
    }
    
    if (chart_isDragging) {
        chart_isDragging = false;
        chart_data.sort((a, b) => a.time - b.time);
        chart_selectedIndices.clear(); 
        chart_draw();
    }
    
    if (chart_isSelecting) {
        chart_isSelecting = false;
        const r = chart_selectionRect;
        const minX = Math.min(r.startX, r.endX);
        const maxX = Math.max(r.startX, r.endX);
        const minY = Math.min(r.startY, r.endY);
        const maxY = Math.max(r.startY, r.endY);
        
        chart_data.forEach((note, index) => {
            const x = (note.time - chart_viewStartTime) * chart_pixelsPerSec;
            const y = note.lane === 'red' ? CHART_RED_LANE_Y : CHART_BLUE_LANE_Y;
            const h = CHART_LANE_HEIGHT;
            if (x >= minX && x <= maxX && y + h/2 >= minY && y + h/2 <= maxY) {
                chart_selectedIndices.add(index);
            }
        });

        // クリックのみだった場合 (選択範囲が極小)
        if (Math.abs(r.startX - r.endX) < 5 && Math.abs(r.startY - r.endY) < 5) {
            // 右クリックでのノーツ生成のみここで行う
            if (chart_selectedIndices.size === 0 && !e.shiftKey && e.button === 2) {
                const rect = chart_canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const clickTime = chart_viewStartTime + (mouseX / chart_pixelsPerSec);
                
                let lane = null;
                if (mouseY >= CHART_RED_LANE_Y && mouseY <= CHART_RED_LANE_Y + CHART_LANE_HEIGHT) lane = 'red';
                else if (mouseY >= CHART_BLUE_LANE_Y && mouseY <= CHART_BLUE_LANE_Y + CHART_LANE_HEIGHT) lane = 'blue';
                
                if (lane) {
                    chart_data.push({ time: clickTime, lane: lane, type: 'normal' });
                    chart_data.sort((a, b) => a.time - b.time);
                }
            }
        }
        chart_draw();
    }
}

function chart_onKeyDown(e) {
    if (document.getElementById('mode-chart').classList.contains('active') === false) return;
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (chart_selectedIndices.size > 0) {
            const sortedIndices = Array.from(chart_selectedIndices).sort((a, b) => b - a);
            sortedIndices.forEach(idx => chart_data.splice(idx, 1));
            chart_selectedIndices.clear();
            chart_draw();
        }
    }
}

// --- シーク機能 ---
// forceScroll: trueなら画面追従させる（ボタン操作など）、falseならヘッド移動のみ（クリック時）
function chart_seekTo(time, forceScroll = true) {
    if (time < 0) time = 0;
    if (chart_audioBuffer && time > chart_audioBuffer.duration) time = chart_audioBuffer.duration;

    if (chart_isPlaying) {
        chart_stop();
        chart_pauseTime = time;
        chart_togglePlay();
    } else {
        chart_pauseTime = time;
    }

    if (forceScroll) {
        chart_viewStartTime = chart_pauseTime - (chart_canvas.width * 0.25 / chart_pixelsPerSec);
    }
    
    chart_updatePlaybackState();
    chart_draw();
}

window.chart_skip = function(seconds) {
    chart_seekTo(chart_pauseTime + seconds, true);
};

window.chart_loadMusic = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('chart-music-name').textContent = "読み込み中...";
    const reader = new FileReader();
    reader.onload = (ev) => {
        chart_audioCtx.decodeAudioData(ev.target.result, (buffer) => {
            chart_audioBuffer = buffer;
            document.getElementById('chart-music-name').textContent = file.name;
        }, (err) => { console.error(err); alert("デコード失敗"); });
    };
    reader.readAsArrayBuffer(file);
};

window.chart_togglePlay = function() {
    if (!chart_audioBuffer) { alert("音楽ファイルが必要です"); return; }
    if (chart_isPlaying) {
        chart_stop();
    } else {
        chart_sourceNode = chart_audioCtx.createBufferSource();
        chart_sourceNode.buffer = chart_audioBuffer;
        chart_sourceNode.connect(chart_audioCtx.destination);
        chart_sourceNode.start(0, chart_pauseTime);
        chart_startTime = chart_audioCtx.currentTime - chart_pauseTime;
        chart_isPlaying = true;
        document.getElementById('btn-chart-play').textContent = '⏸ 一時停止';
    }
};

window.chart_stop = function() {
    if (chart_sourceNode) {
        try { chart_sourceNode.stop(); } catch(e){}
        chart_sourceNode = null;
    }
    if (chart_isPlaying) {
        chart_pauseTime = chart_audioCtx.currentTime - chart_startTime;
    }
    chart_isPlaying = false;
    document.getElementById('btn-chart-play').textContent = '▶ 再生';
};

window.chart_clear = function() {
    if (confirm("全削除しますか？")) {
        chart_data = [];
        chart_draw();
    }
};

window.chart_export = function() {
    const filename = document.getElementById('chart-filename').value || 'chart';
    const json = JSON.stringify(chart_data, null, 2);
    navigator.clipboard.writeText(json).then(() => { alert("クリップボードにコピーしました"); });
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.json';
    a.click();
};

window.chart_loadChartFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    const fname = file.name.replace(/\.[^/.]+$/, "");
    document.getElementById('chart-filename').value = fname;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
                chart_data = data;
                chart_draw();
            } else { alert("不正なデータ形式"); }
        } catch(err) { console.error(err); alert("読み込みエラー"); }
    };
    reader.readAsText(file);
    input.value = '';
};