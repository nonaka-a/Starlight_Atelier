/**
 * イベントエディタ: コア (変数定義・初期化・ループ)
 * Step 14: コンポジション切り替え対応、初期画像読み込み修正
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

// 表示設定
let event_pixelsPerSec = 50;
let event_viewStartTime = 0;
let event_previewZoomMode = 'fit';
let event_previewScale = 1.0;

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
const EVENT_MAX_HISTORY = 10;

window.event_pushHistory = function () {
    // データの整合性を保つため、現在の編集中のレイヤーをアセットに同期させてから保存
    if (event_data.activeCompId) {
        const comp = event_data.assets.find(a => a.id === event_data.activeCompId);
        if (comp) {
            comp.layers = event_data.layers; // 参照なので基本同期されているが念のため
            comp.name = event_data.composition.name;
            comp.width = event_data.composition.width;
            comp.height = event_data.composition.height;
            comp.duration = event_data.composition.duration;
            comp.fps = event_data.composition.fps;
        }
    }

    // ディープコピーして保存
    const snapshot = JSON.parse(JSON.stringify({
        assets: event_data.assets,
        activeCompId: event_data.activeCompId
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

    const prevState = event_history.pop();

    // 状態の復元
    event_data.assets = prevState.assets;

    // 現在のコンポジションを再読み込み (保存処理をスキップするために一時的にIDを消す)
    const targetCompId = prevState.activeCompId;
    event_data.activeCompId = null;
    event_switchComposition(targetCompId);

    // imgObj は JSON化で消えるので、全レイヤーで再生成
    event_data.layers.forEach(l => {
        if (l.source) {
            const img = new Image();
            img.src = l.source;
            img.onload = () => event_draw();
            l.imgObj = img;
        }
    });

    event_draw();
    if (window.event_refreshProjectList) event_refreshProjectList();
};

// UI定数
const EVENT_HEADER_HEIGHT = 25;
const EVENT_TRACK_HEIGHT = 30;
const EVENT_LEFT_PANEL_WIDTH = 250;
const EVENT_KEYFRAME_SIZE = 6;
const EVENT_KEYFRAME_HIT_RADIUS = 8;
const EVENT_VALUE_CLICK_WIDTH = 80;
const EVENT_LAYER_HANDLE_WIDTH = 6;

// 操作ステート
// 'idle', 'scrub-time', 'drag-key', 'check-value-edit', 'scrub-value', 
// 'resize-panel', 'resize-project', 'drag-preview', 'drag-layer-move', 'drag-layer-in', 'drag-layer-out'
let event_state = 'idle';
let event_dragStartPos = { x: 0, y: 0 };
let event_dragTarget = null;
let event_selectedLayerIndex = -1;
let event_selectedKey = null;

// --- 初期化 ---
window.initEventEditor = function () {
    if (event_initialized) return;

    // DOM取得
    event_canvasPreview = document.getElementById('event-preview-canvas');
    event_canvasTimeline = document.getElementById('event-timeline-canvas');
    event_timelineContainer = document.getElementById('event-timeline-container');
    event_previewContainer = document.getElementById('event-preview-container');
    event_timelinePanel = document.getElementById('event-timeline-panel');
    const resizeHandle = document.getElementById('event-resize-handle');
    const projectResize = document.getElementById('event-project-resize');

    // 要素確認
    if (!event_canvasPreview || !event_canvasTimeline) {
        return;
    }

    console.log("Event Editor Initializing...");

    event_ctxPreview = event_canvasPreview.getContext('2d');
    event_ctxTimeline = event_canvasTimeline.getContext('2d');

    // イベントリスナー設定
    event_canvasTimeline.addEventListener('mousedown', event_onTimelineMouseDown);
    window.addEventListener('mousemove', event_onGlobalMouseMove);
    window.addEventListener('mouseup', event_onGlobalMouseUp);

    // タイムラインへのD&D受け入れ
    event_canvasTimeline.addEventListener('dragover', event_onTimelineDragOver);
    event_canvasTimeline.addEventListener('drop', event_onTimelineDrop);

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

    // キーボードイベント
    window.addEventListener('keydown', event_onKeyDown);

    // プロジェクトパネル初期化
    if (window.event_initProject) {
        event_initProject();
    }

    // 初期コンポジションをアクティブにする
    event_switchComposition('comp_1');

    // 初期レイヤー追加 (Siro Maimai) - assetsから検索して追加
    if (event_data.layers.length === 0) {
        const imgAsset = event_data.assets.find(a => a.type === 'image' && a.name === 'Siro Maimai');
        if (imgAsset) {
            event_addLayer(imgAsset.name, imgAsset.src);
        }
    }

    // 初期設定反映
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

            const canvasW = event_canvasTimeline ? event_canvasTimeline.width : 0;
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