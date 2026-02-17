/**
 * イベントエディタ: コア (変数定義・初期化・ループ)
 * Step 14: コンポジション切り替え対応、初期画像読み込み修正
 * Step 1 (Update): レイアウト定数変更
 * Text Layer 対応: フォント読み込み待ち追加
 * Audio Track: 結合モードフラグ追加
 */

// --- 変数定義 ---
// 描画コンテキスト
let event_ctxPreview, event_canvasPreview;
let event_ctxTimeline, event_canvasTimeline;
let event_timelineContainer;
let event_previewContainer, event_timelinePanel;

// 状態フラグ
let event_initialized = false;
let event_isPlaying = false;
let event_currentTime = 0;
let event_lastTimestamp = 0;
let event_audioCompactMode = true; // ★追加: 音声トラック結合モード (true: プレミア風, false: AE風)

// 表示設定
let event_pixelsPerSec = 50;
let event_viewStartTime = 0;
let event_previewZoomMode = 'fit';
let event_previewScale = 1.0;

// オーディオ管理
let event_audioCtx = null;
let event_audioLayers = {}; // layerId -> { sourceNode, gainNode }

// データ構造
// event_data は「現在編集中のデータ」を保持する
let event_data = {
    // 現在アクティブなコンポジションID
    activeCompId: null,

    // 現在のコンポジション設定 (ショートカット用)
    composition: {
        name: "",
        width: 1000,
        height: 600,
        duration: 10,
        fps: 30
    },
    layers: [], // 現在のレイヤーリスト

    // プロジェクトアセット (ここに全てのデータの実体がある)
    assets: [
        {
            type: 'comp',
            name: 'Main Comp',
            id: 'comp_1',
            width: 1000,
            height: 600,
            duration: 10,
            fps: 30,
            layers: [] // コンポジションごとにレイヤーを持つ
        },
        {
            type: 'image',
            name: 'Siro Maimai',
            id: 'img_1',
            src: '../image/siro_maimai_1.png'
        }
    ]
};

// --- やり直し (Undo) 用の履歴管理 ---
let event_history = [];
const EVENT_MAX_HISTORY = 30;

window.event_pushHistory = function () {
    // 1. 現在の編集状態をアセット（マスターデータ）に一度同期させる
    if (event_data.activeCompId) {
        const comp = event_data.assets.find(a => a.id === event_data.activeCompId);
        if (comp) {
            comp.layers = event_data.layers;
            comp.name = event_data.composition.name;
            comp.width = event_data.composition.width;
            comp.height = event_data.composition.height;
            comp.duration = event_data.composition.duration;
            comp.fps = event_data.composition.fps;
        }
    }

    // 2. ディープコピーを作成してスタックに積む
    const snapshot = JSON.parse(JSON.stringify({
        assets: event_data.assets,
        activeCompId: event_data.activeCompId,
        currentTime: event_currentTime
    }));

    event_history.push(snapshot);
    if (event_history.length > EVENT_MAX_HISTORY) {
        event_history.shift();
    }
};

window.event_undo = function () {
    if (event_history.length === 0) {
        console.log("No undo history");
        return;
    }

    // スタックから直前の保存状態を取り出す
    const prevState = event_history.pop();

    // 3. データの復元
    event_data.assets = prevState.assets;
    event_data.activeCompId = prevState.activeCompId;
    event_currentTime = prevState.currentTime || 0;

    // 4. 非シリアライズオブジェクトの復元 (Image, AudioBuffer, Canvas等)
    if (window.event_restoreAssetObjects) {
        window.event_restoreAssetObjects(event_data.assets);
    } else {
        // フォールバック (念のため)
        const restoreImages = (items) => {
            items.forEach(item => {
                if ((item.type === 'image' && item.src) || (item.type === 'animation' && item.source)) {
                    const img = new Image();
                    img.src = item.src || item.source;
                    img.onload = () => window.event_draw();
                    item.imgObj = img;
                }
                if (item.type === 'comp' && item.layers) {
                    item.layers.forEach(l => {
                        if (l.source && (l.type === 'image' || l.type === 'animated_layer' || !l.type)) {
                            const img = new Image();
                            img.src = l.source;
                            img.onload = () => window.event_draw();
                            l.imgObj = img;
                        }
                    });
                }
                if (item.type === 'folder' && item.children) {
                    restoreImages(item.children);
                }
            });
        };
        restoreImages(event_data.assets);
    }

    // 5. event_data のショートカット参照 (layers, composition) の再接続
    if (event_data.activeCompId) {
        const comp = event_data.assets.find(a => a.id === event_data.activeCompId);
        if (comp) {
            event_data.composition = {
                name: comp.name,
                width: comp.width,
                height: comp.height,
                duration: comp.duration,
                fps: comp.fps
            };
            event_data.layers = comp.layers;
        } else {
            event_data.layers = [];
        }
    }

    // 選択状態のリセット（不正なインデックス参照を防ぐ）
    event_selectedLayerIndex = -1;
    event_selectedKey = null;
    event_selectedKeys = [];

    event_draw();
    if (window.event_refreshProjectList) event_refreshProjectList();
};

let event_selectedKeys = [];
window.event_selectedKeys = event_selectedKeys;

const UI_LAYOUT = {
    TRASH_RIGHT: 30,
    PICK_RIGHT: 55,
    PARENT_RIGHT: 145,

    KEY_ADD_RIGHT: 30,
    VAL_SINGLE_RIGHT: 120,
    VAL_SINGLE_WIDTH: 80,
    VAL_VEC_Y_RIGHT: 100,
    VAL_VEC_X_RIGHT: 175,
    VAL_VEC_WIDTH: 60,
    BLEND_RIGHT: 170,
    EYE_RIGHT: 195,
    LOCK_RIGHT: 215
};

// UI定数 (パネル幅拡張)
const EVENT_HEADER_HEIGHT = 30;
const EVENT_TRACK_HEIGHT = 30;
const EVENT_LEFT_PANEL_WIDTH = 320;
const EVENT_KEYFRAME_SIZE = 6;
const EVENT_KEYFRAME_HIT_RADIUS = 8;
const EVENT_VALUE_CLICK_WIDTH = 80;
const EVENT_LAYER_HANDLE_WIDTH = 6;

// 操作ステート
let event_state = 'idle';
let event_dragStartPos = { x: 0, y: 0 };
let event_dragTarget = null;
let event_selectedLayerIndex = -1;
let event_selectedKey = null;

// --- 初期化 ---
window.initEventEditor = function () {
    if (event_initialized) return;

    // フォント読み込み待ち
    document.fonts.ready.then(() => {
        console.log("Fonts loaded.");
        if (event_initialized) event_draw();
    });

    event_canvasPreview = document.getElementById('event-preview-canvas');
    event_canvasTimeline = document.getElementById('event-timeline-canvas');
    event_timelineContainer = document.getElementById('event-timeline-container');
    event_previewContainer = document.getElementById('event-preview-container');
    event_timelinePanel = document.getElementById('event-timeline-panel');
    const resizeHandle = document.getElementById('event-resize-handle');
    const projectResize = document.getElementById('event-project-resize');

    if (!event_canvasPreview || !event_canvasTimeline) return;

    console.log("Event Editor Initializing...");

    event_ctxPreview = event_canvasPreview.getContext('2d');
    event_ctxTimeline = event_canvasTimeline.getContext('2d');

    event_canvasTimeline.addEventListener('mousedown', event_onTimelineMouseDown);
    event_canvasTimeline.addEventListener('dblclick', event_onTimelineDblClick);
    window.addEventListener('mousemove', event_onGlobalMouseMove);
    window.addEventListener('mouseup', event_onGlobalMouseUp);

    event_canvasTimeline.addEventListener('dragover', event_onTimelineDragOver);
    event_canvasTimeline.addEventListener('drop', event_onTimelineDrop);

    // AudioContext の初期化（ユーザー操作が必要）
    const initAudio = () => {
        if (!event_audioCtx) {
            event_audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (event_audioCtx.state === 'suspended') {
            event_audioCtx.resume();
        }
    };
    window.addEventListener('mousedown', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (e) => {
            event_state = 'resize-panel';
            event_dragStartPos = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        });
    }

    if (projectResize) {
        projectResize.addEventListener('mousedown', (e) => {
            event_state = 'resize-project';
            event_dragStartPos = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        });
    }

    event_canvasPreview.addEventListener('mousedown', event_onPreviewMouseDown);
    window.addEventListener('keydown', event_onKeyDown);

    if (window.event_initProject) {
        event_initProject();
    }

    // 初期コンポジション設定
    event_switchComposition('comp_1');

    if (event_data.layers.length === 0) {
        const imgAsset = event_data.assets.find(a => a.type === 'image' && a.name === 'Siro Maimai');
        if (imgAsset) {
            event_addLayer(imgAsset.name, imgAsset.src);
        }
    }

    event_applyCompSettings(true);

    const zoomInput = document.getElementById('event-zoom');
    if (zoomInput) {
        event_pixelsPerSec = parseInt(zoomInput.value);
    }

    requestAnimationFrame(event_loop);
    event_initialized = true;
};

// --- メインループ ---
function event_loop(timestamp) {
    const modeEvent = document.getElementById('mode-event');
    if (!modeEvent) return;

    if (modeEvent.classList.contains('active')) {
        if (event_isPlaying) {
            if (!event_lastTimestamp) event_lastTimestamp = timestamp;
            const deltaTime = (timestamp - event_lastTimestamp) / 1000;
            event_currentTime += deltaTime;

            if (event_currentTime > event_data.composition.duration) {
                event_currentTime = 0;
            }

            // 再生中はヘッド追従 (簡易スクロール)
            const canvasW = event_timelineContainer.clientWidth;
            const timelineW = canvasW - EVENT_LEFT_PANEL_WIDTH;
            const headScreenX = (event_currentTime - event_viewStartTime) * event_pixelsPerSec;
            if (headScreenX > timelineW * 0.9) {
                event_viewStartTime = event_currentTime - (timelineW * 0.1) / event_pixelsPerSec;
                event_timelineContainer.scrollLeft = event_viewStartTime * event_pixelsPerSec;
            }
            // オーディオの同期
            event_syncAudio();
            event_updateAudioVolumes();
        }
        event_lastTimestamp = timestamp;
        event_draw();
    } else {
        event_isPlaying = false;
    }
    requestAnimationFrame(event_loop);
}