/**
 * イベントエディタ: ロジック
 * Step 16: コピー＆ペースト対応
 * Step 1 (Update): イージング機能（AE準拠）、親子関係、スケール連動初期値
 */

// クリップボード (メモリ内)
let event_clipboardKey = null; // { value: ..., type: ... }

// イージング関数定義 (基本計算用)
const event_easingFunctions = {
    'Linear': (t) => t,
    'EaseInOut': (t) => 0.5 * (1 - Math.cos(t * Math.PI))
};

// --- アセット検索 (ネスト対応) ---
window.event_findAssetById = function (id, list = event_data.assets) {
    for (const item of list) {
        if (item.id === id) return item;
        if (item.type === 'folder' && item.children) {
            const found = event_findAssetById(id, item.children);
            if (found) return found;
        }
    }
    return null;
};

window.event_copySelectedKeyframe = function () {
    if (!event_selectedKey) return;
    // キーフレームオブジェクト全体をコピー
    event_clipboardKey = JSON.parse(JSON.stringify(event_selectedKey.keyObj));
    console.log("Keyframe copied");
};

window.event_pasteKeyframe = function () {
    if (!event_clipboardKey || event_selectedLayerIndex === -1) return;

    if (event_selectedKey) {
        // 同じプロパティにペースト
        const { layerIdx, prop } = event_selectedKey;
        const val = event_clipboardKey.value; // 値
        
        // 値を更新
        const key = event_updateKeyframe(layerIdx, prop, event_currentTime, val);

        // イージング・補間設定もペースト
        key.easeIn = event_clipboardKey.easeIn;
        key.easeOut = event_clipboardKey.easeOut;
        key.interpolation = event_clipboardKey.interpolation;

        event_draw();
        console.log("Keyframe pasted");
    } else {
        console.log("No track selected for paste");
    }
};

/**
 * 指定したインデックスのレイヤーを複製する
 */
window.event_duplicateLayer = function (layerIdx) {
    if (layerIdx < 0 || layerIdx >= event_data.layers.length) return;

    event_pushHistory(); // 履歴保存

    const original = event_data.layers[layerIdx];

    // ディープコピーを作成 (imgObj等の非JSON要素は消える)
    const clone = JSON.parse(JSON.stringify(original));

    // 新しいIDと名前の設定
    clone.id = 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    clone.name = original.name + " コピー";

    // 描画に必要なImageオブジェクトの参照を復元
    if (original.imgObj) {
        clone.imgObj = original.imgObj;
    }

    // 元のレイヤーの直上に挿入
    event_data.layers.splice(layerIdx, 0, clone);

    // 複製したレイヤーを選択状態にする
    event_selectedLayerIndex = layerIdx;
    event_selectedKey = null;

    event_draw();
    console.log("Layer duplicated:", clone.name);
};

// コンポジション切り替え
window.event_switchComposition = function (compId) {
    // 現在の編集内容を保存
    if (event_data.activeCompId) {
        const prevComp = event_findAssetById(event_data.activeCompId);
        if (prevComp) {
            prevComp.layers = event_data.layers;
            // 設定も同期
            prevComp.name = event_data.composition.name;
            prevComp.width = event_data.composition.width;
            prevComp.height = event_data.composition.height;
            prevComp.duration = event_data.composition.duration;
            prevComp.fps = event_data.composition.fps;
        }
    }

    // 新しいコンポジションをロード
    const newComp = event_findAssetById(compId);
    if (!newComp || newComp.type !== 'comp') return;

    event_data.activeCompId = compId;

    // データをコピーしてエディタ用に展開
    event_data.composition = {
        name: newComp.name,
        width: newComp.width,
        height: newComp.height,
        duration: newComp.duration,
        fps: newComp.fps
    };
    event_data.layers = newComp.layers || []; // 参照渡しで同期

    // 表示更新
    const nameDisplay = document.getElementById('event-comp-name-display');
    if (nameDisplay) nameDisplay.textContent = newComp.name;

    event_currentTime = 0;
    event_viewStartTime = 0;
    event_draw();
};

// --- データ操作 ---
window.event_addLayer = function (name, source) {
    event_pushHistory(); // 履歴保存
    const img = new Image();
    img.src = source;
    img.onload = () => event_draw();

    const cx = event_data.composition.width / 2;
    const cy = event_data.composition.height / 2;

    const newLayer = {
        id: 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 1000), // ユニークID
        name: name,
        source: source,
        imgObj: img,
        parent: null, // 親レイヤーID
        expanded: true,
        inPoint: 0,
        outPoint: event_data.composition.duration,
        tracks: {
            "position": { label: "Position", type: "vector2", keys: [], step: 1, initialValue: { x: cx, y: cy } },
            // Scaleに linked: true を追加
            "scale": { label: "Scale", type: "vector2", linked: true, keys: [], step: 1, initialValue: { x: 100, y: 100 } },
            "rotation": { label: "Rotation", type: "rotation", keys: [], min: -3600, max: 3600, step: 1, initialValue: 0 },
            "opacity": { label: "Opacity", type: "number", keys: [], min: 0, max: 100, step: 1, initialValue: 100 }
        }
    };

    // 配列の先頭に追加することで「上」に表示されるようにする
    event_data.layers.unshift(newLayer);
    event_selectedLayerIndex = 0;
    event_draw();
};

window.event_updateKeyframe = function (layerIndex, prop, time, value) {
    time = event_snapTime(time);
    const track = event_data.layers[layerIndex].tracks[prop];

    if (track.type === 'number') {
        if (track.min !== undefined) value = Math.max(track.min, value);
        if (track.max !== undefined) value = Math.min(track.max, value);
    }

    const existingKey = track.keys.find(k => Math.abs(k.time - time) < 0.001);
    const valToSave = (typeof value === 'object') ? { ...value } : value;

    if (existingKey) {
        existingKey.value = valToSave;
        return existingKey;
    } else {
        // 新規キーフレーム作成
        // デフォルトはリニア
        const newKey = { 
            time: time, 
            value: valToSave, 
            easeIn: false, 
            easeOut: false, 
            interpolation: 'Linear' 
        };
        track.keys.push(newKey);
        track.keys.sort((a, b) => a.time - b.time);
        return newKey;
    }
};

window.event_deleteSelectedKeyframe = function () {
    if (!event_selectedKey) return;
    const { layerIdx, prop, keyObj } = event_selectedKey;
    const track = event_data.layers[layerIdx].tracks[prop];
    const index = track.keys.indexOf(keyObj);
    if (index !== -1) {
        track.keys.splice(index, 1);
        event_selectedKey = null;
        event_draw();
    }
};

// --- 親子関係設定 (位置補正付き) ---
window.event_setLayerParent = function (childLayerIdx, parentLayerId) {
    const childLayer = event_data.layers[childLayerIdx];
    if (!childLayer) return;

    // 現在の親ID
    const oldParentId = childLayer.parent;
    if (oldParentId === parentLayerId) return; // 変更なし

    // 親レイヤー取得
    const newParentLayer = parentLayerId ? event_data.layers.find(l => l.id === parentLayerId) : null;
    const oldParentLayer = oldParentId ? event_data.layers.find(l => l.id === oldParentId) : null;

    // 循環参照チェック
    let currentId = parentLayerId;
    while (currentId) {
        if (currentId === childLayer.id) {
            alert("循環参照になるため設定できません");
            return;
        }
        const parent = event_data.layers.find(l => l.id === currentId);
        if (parent) {
            currentId = parent.parent;
        } else {
            break;
        }
    }

    // 位置補正: 親を設定/解除しても、現在の見た目の位置を維持するようにローカル座標を補正する
    let offsetX = 0;
    let offsetY = 0;

    // 1. 旧親の影響を取り除く（旧ローカル -> ワールド）
    if (oldParentLayer) {
        const pPos = event_getInterpolatedValue(event_data.layers.indexOf(oldParentLayer), "position", event_currentTime);
        offsetX += pPos.x;
        offsetY += pPos.y;
    }

    // 2. 新親の影響を加える（ワールド -> 新ローカル）
    if (newParentLayer) {
        const pPos = event_getInterpolatedValue(event_data.layers.indexOf(newParentLayer), "position", event_currentTime);
        offsetX -= pPos.x;
        offsetY -= pPos.y;
    }

    // 全キーフレームにオフセット適用
    childLayer.tracks["position"].keys.forEach(key => {
        key.value.x += offsetX;
        key.value.y += offsetY;
    });

    childLayer.parent = parentLayerId;
    event_draw();
};

// --- FPSスナップ処理 ---
window.event_snapTime = function (time) {
    const fps = event_data.composition.fps || 30;
    const frameDuration = 1 / fps;
    const frame = Math.round(time / frameDuration);
    return frame * frameDuration;
};

// --- 補間計算 (イージング・停止キーフレーム対応) ---
window.event_getInterpolatedValue = function (layerIndex, prop, time) {
    const track = event_data.layers[layerIndex].tracks[prop];
    if (!track.keys || track.keys.length === 0) {
        return track.initialValue;
    }
    const keys = track.keys;
    if (keys.length === 1) return keys[0].value;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i + 1];
        if (time >= k1.time && time < k2.time) {
            // 停止キーフレーム (Hold)
            if (track.type === 'string' || k1.interpolation === 'Hold') {
                return k1.value;
            }

            let t = (time - k1.time) / (k2.time - k1.time);

            // イージング計算 (k1のアウトとk2のインを参照)
            const easeIn = k2.easeIn;   // 終点側（入ってくる）設定
            const easeOut = k1.easeOut; // 始点側（出ていく）設定

            if (easeIn && easeOut) {
                // 両方: ゆっくり加速して始まり、ゆっくり減速して終わる (S字)
                t = 0.5 * (1 - Math.cos(t * Math.PI));
            } else if (easeIn) {
                // イーズインのみ: 終点に向かって減速（ゆっくり停車する）
                t = 1 - (1 - t) * (1 - t); 
            } else if (easeOut) {
                // イーズアウトのみ: 始点から加速（ゆっくり発車する）
                t = t * t;
            }

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
};

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

window.event_jumpToPrevKeyframe = function () {
    let targetTime = -1;
    event_data.layers.forEach(l => {
        Object.values(l.tracks).forEach(t => {
            t.keys.forEach(k => {
                if (k.time < event_currentTime - 0.001) {
                    if (k.time > targetTime) targetTime = k.time;
                }
            });
        });
    });
    if (targetTime !== -1) event_seekTo(targetTime);
};

window.event_jumpToNextKeyframe = function () {
    let targetTime = Infinity;
    event_data.layers.forEach(l => {
        Object.values(l.tracks).forEach(t => {
            t.keys.forEach(k => {
                if (k.time > event_currentTime + 0.001) {
                    if (k.time < targetTime) targetTime = k.time;
                }
            });
        });
    });
    if (targetTime !== Infinity) event_seekTo(targetTime);
};

// --- コンポジション設定 ---
window.event_openCompSettings = function () {
    const comp = event_data.composition;
    document.getElementById('inp-comp-name').value = comp.name;
    document.getElementById('inp-comp-w').value = comp.width;
    document.getElementById('inp-comp-h').value = comp.height;
    document.getElementById('inp-comp-duration').value = comp.duration;
    document.getElementById('inp-comp-fps').value = comp.fps;
    document.getElementById('event-comp-modal').style.display = 'flex';
};

window.event_applyCompSettings = function (isInit = false) {
    if (!isInit) {
        event_pushHistory(); // 履歴保存
        const name = document.getElementById('inp-comp-name').value;
        const w = parseInt(document.getElementById('inp-comp-w').value) || 1000;
        const h = parseInt(document.getElementById('inp-comp-h').value) || 600;
        const dur = parseFloat(document.getElementById('inp-comp-duration').value) || 10;
        const fps = parseInt(document.getElementById('inp-comp-fps').value) || 30;

        event_data.composition.name = name;
        event_data.composition.width = w;
        event_data.composition.height = h;
        event_data.composition.duration = dur;
        event_data.composition.fps = fps;

        document.getElementById('event-comp-modal').style.display = 'none';
    }

    const nameDisplay = document.getElementById('event-comp-name-display');
    if (nameDisplay) nameDisplay.textContent = event_data.composition.name;

    if (event_currentTime > event_data.composition.duration) {
        event_currentTime = event_data.composition.duration;
    }
    event_currentTime = event_snapTime(event_currentTime);
    event_draw();
};

// --- 新規コンポジション作成 ---
window.event_createComp = function () {
    const name = prompt("コンポジション名", "Comp " + (event_data.assets.filter(a => a.type === 'comp').length + 1));
    if (name) {
        event_pushHistory(); // 履歴保存
        const newComp = {
            type: 'comp',
            name: name,
            id: 'comp_' + Date.now(),
            width: 1000,
            height: 600,
            duration: 10,
            fps: 30,
            layers: []
        };
        event_data.assets.push(newComp);
        event_refreshProjectList();

        if (confirm("作成したコンポジションを開きますか？")) {
            event_switchComposition(newComp.id);
        }
    }
};

// --- アニメーション統合用ロジック ---

/**
 * アニメーションエディタの全データをアセットとして登録
 */
window.anim_integrateToEvent = function () {
    // editor_anim.js のグローバル変数にアクセス
    if (!window.anim_data || Object.keys(window.anim_data).length === 0) {
        alert("アニメーションデータがありません");
        return;
    }

    const packName = document.getElementById('anim-pack-name').value || 'Animations';

    // タイルセットのソースを取得
    let tilesetSrc = "";
    if (window.anim_img instanceof HTMLImageElement) {
        // すでにパス（../image/...等）を持っている場合はそれを使う
        // DataURL(data:image/...)の場合はそのまま保持される
        tilesetSrc = window.anim_img.getAttribute('src') || window.anim_img.src;
    } else if (window.anim_img instanceof HTMLCanvasElement) {
        // キャンバス（連結画像等）の場合は現状Base64化せざるを得ない
        tilesetSrc = window.anim_img.toDataURL();
    }

    const newAsset = {
        type: 'animation',
        name: packName,
        id: 'anim_asset_' + Date.now(),
        data: JSON.parse(JSON.stringify(window.anim_data)), // ディープコピー
        source: tilesetSrc, // タイルセット画像
        _collapsed: false
    };

    // 重複チェック (パック名が同じものを探す)
    const existing = event_data.assets.find(a => a.type === 'animation' && a.name === packName);
    if (existing) {
        if (confirm(`既存のアセット "${packName}" を上書きしますか？`)) {
            event_pushHistory();
            Object.assign(existing, newAsset);
            existing.id = existing.id; // IDは維持
            alert("アセットを更新しました");
            event_refreshProjectList();
            return;
        } else {
            return;
        }
    }

    event_pushHistory();
    event_data.assets.push(newAsset);
    event_refreshProjectList();
    alert(`アセットに "${packName}" を追加しました。`);
};

/**
 * アニメーションレイヤーを追加
 * @param {string} name レイヤー名
 * @param {string} animAssetId 参照するアセットのID
 * @param {string} animId 再生するアニメーション名 (オプション)
 */
window.event_addAnimatedLayer = function (name, animAssetId, animId) {
    event_pushHistory();

    // アセット情報の取得
    const asset = event_findAssetById(animAssetId);
    if (!asset || asset.type !== 'animation') return;

    // 画像オブジェクト生成(表示用)
    const img = new Image();
    img.src = asset.source;
    img.onload = () => event_draw();

    const cx = event_data.composition.width / 2;
    const cy = event_data.composition.height / 2;

    // 再生するアニメーションキーの決定
    const targetAnimId = animId || Object.keys(asset.data)[0] || "idle";

    const newLayer = {
        id: 'layer_anim_' + Date.now(),
        type: 'animated_layer',
        name: name || (asset.name + " (" + targetAnimId + ")"),
        animAssetId: animAssetId, // 参照アセットID
        animId: targetAnimId,     // 実行するアニメーション名
        startTime: event_currentTime, // 再生開始位置
        loop: true,
        imgObj: img, // タイルセット画像
        source: asset.source,
        parent: null,
        expanded: true,
        inPoint: 0,
        outPoint: event_data.composition.duration,
        tracks: {
            "motion": { label: "Motion", type: "string", keys: [], step: 1, initialValue: targetAnimId },
            "position": { label: "Position", type: "vector2", keys: [], step: 1, initialValue: { x: cx, y: cy } },
            // Scaleに linked: true を追加
            "scale": { label: "Scale", type: "vector2", linked: true, keys: [], step: 1, initialValue: { x: 100, y: 100 } },
            "rotation": { label: "Rotation", type: "rotation", keys: [], min: -3600, max: 3600, step: 1, initialValue: 0 },
            "opacity": { label: "Opacity", type: "number", keys: [], min: 0, max: 100, step: 1, initialValue: 100 }
        }
    };

    event_data.layers.unshift(newLayer);
    event_selectedLayerIndex = 0;
    event_draw();
};

/**
 * レイヤーが参照しているすべてのアニメーション名を取得
 * @param {number} layerIdx 
 */
window.event_getLayerAnimationNames = function (layerIdx) {
    const layer = event_data.layers[layerIdx];
    if (!layer || !layer.animAssetId) return [];

    const asset = event_findAssetById(layer.animAssetId);
    if (!asset || asset.type !== 'animation' || !asset.data) return [];

    return Object.keys(asset.data);
};