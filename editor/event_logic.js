/**
 * イベントエディタ: ロジック
 * Step 19 (Fix): ペースト先の自動判定強化（選択解除後のペースト対応）
 */

// クリップボード (メモリ内)
let event_clipboard = null; // { type: 'keys', sourceLayerIdx: 0, items: [...] }

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
    if (!event_selectedKeys || event_selectedKeys.length === 0) return;

    // 選択されたキーの中で最小の時間を基準とする
    const minTime = Math.min(...event_selectedKeys.map(k => k.keyObj.time));

    // コピー元の代表レイヤーインデックスを保存（ペースト時のフォールバック用）
    const sourceLayerIdx = event_selectedKeys[0].layerIdx;

    event_clipboard = {
        type: 'keys',
        sourceLayerIdx: sourceLayerIdx,
        items: event_selectedKeys.map(sk => ({
            prop: sk.prop, // プロパティ名
            // 値とイージング情報をディープコピー
            value: JSON.parse(JSON.stringify(sk.keyObj.value)),
            interpolation: sk.keyObj.interpolation,
            easeIn: sk.keyObj.easeIn,
            easeOut: sk.keyObj.easeOut,
            // 基準時間からのオフセット
            offset: sk.keyObj.time - minTime
        }))
    };
    console.log(`Copied ${event_selectedKeys.length} keys`);
};

window.event_pasteKeyframe = function () {
    if (!event_clipboard || event_clipboard.type !== 'keys') return;

    // ペースト先のレイヤー決定優先順位:
    // 1. 現在選択されているレイヤー (event_selectedLayerIndex)
    // 2. 現在キーフレームが選択されているレイヤー
    // 3. コピー元のレイヤー (event_clipboard.sourceLayerIdx)

    let targetLayerIdx = event_selectedLayerIndex;

    if (targetLayerIdx === -1 && event_selectedKeys.length > 0) {
        targetLayerIdx = event_selectedKeys[0].layerIdx;
    }

    if (targetLayerIdx === -1 && event_clipboard.sourceLayerIdx !== undefined) {
        targetLayerIdx = event_clipboard.sourceLayerIdx;
    }

    // ターゲットレイヤーが存在するか確認
    if (targetLayerIdx === -1 || !event_data.layers[targetLayerIdx]) {
        console.log("No layer selected for paste");
        return;
    }

    event_pushHistory();
    const layer = event_data.layers[targetLayerIdx];
    const baseTime = event_currentTime; // 再生ヘッドの位置

    // 貼り付け後に選択状態にするためのリスト
    const newSelectedKeys = [];

    event_clipboard.items.forEach(item => {
        // ターゲットレイヤーに同じ名前のトラックがあるか確認
        if (!layer.tracks[item.prop]) return;

        const track = layer.tracks[item.prop];
        const pasteTime = event_snapTime(baseTime + item.offset);

        // 既存キーを検索して更新、なければ追加
        let existingKey = track.keys.find(k => Math.abs(k.time - pasteTime) < 0.001);
        const valCopy = JSON.parse(JSON.stringify(item.value));

        if (existingKey) {
            existingKey.value = valCopy;
            existingKey.interpolation = item.interpolation;
            existingKey.easeIn = item.easeIn;
            existingKey.easeOut = item.easeOut;
            newSelectedKeys.push({ layerIdx: targetLayerIdx, prop: item.prop, keyObj: existingKey });
        } else {
            const newKey = {
                time: pasteTime,
                value: valCopy,
                interpolation: item.interpolation || 'Linear',
                easeIn: !!item.easeIn,
                easeOut: !!item.easeOut
            };
            track.keys.push(newKey);
            // 時間順にソート
            track.keys.sort((a, b) => a.time - b.time);
            newSelectedKeys.push({ layerIdx: targetLayerIdx, prop: item.prop, keyObj: newKey });
        }
    });

    // ペーストしたキーを選択状態にする
    if (newSelectedKeys.length > 0) {
        event_selectedKeys = newSelectedKeys;
        event_selectedKey = newSelectedKeys[0];
        // ペースト先レイヤーを選択状態にする
        event_selectedLayerIndex = targetLayerIdx;
    }

    event_draw();
    console.log("Pasted keys to layer:", targetLayerIdx);
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
    event_selectedKeys = [];

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
        blendMode: 'source-over',
        parent: null, // 親レイヤーID
        expanded: true,
        inPoint: 0,
        outPoint: event_data.composition.duration,
        tracks: {
            "position": { label: "Position", type: "vector2", keys: [], step: 1, initialValue: { x: cx, y: cy } },
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
    if (event_selectedKeys.length === 0) return;
    event_pushHistory();
    event_selectedKeys.forEach(sk => {
        const track = event_data.layers[sk.layerIdx].tracks[sk.prop];
        const index = track.keys.indexOf(sk.keyObj);
        if (index !== -1) {
            track.keys.splice(index, 1);
        }
    });
    event_selectedKey = null;
    event_selectedKeys = [];
    event_draw();
};

/**
 * レイヤーのワールドトランスフォーム（Canvas上での絶対的な位置・スケール・回転）を取得する
 */
window.event_getLayerWorldTransform = function (layerIdx, time) {
    const layer = event_data.layers[layerIdx];
    const pos = event_getInterpolatedValue(layerIdx, "position", time);
    const scale = event_getInterpolatedValue(layerIdx, "scale", time);
    const rot = event_getInterpolatedValue(layerIdx, "rotation", time);

    let worldPos = { x: pos.x, y: pos.y };
    let worldScale = { x: scale.x / 100, y: scale.y / 100 };
    let worldRot = rot;

    if (layer.parent) {
        const parentIdx = event_data.layers.findIndex(l => l.id === layer.parent);
        if (parentIdx !== -1) {
            const parentTransform = event_getLayerWorldTransform(parentIdx, time);

            // 親の回転を考慮した座標計算
            const rad = parentTransform.rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            // 親のスケールと回転を適用
            const lx = pos.x * parentTransform.scale.x;
            const ly = pos.y * parentTransform.scale.y;

            worldPos.x = parentTransform.position.x + (lx * cos - ly * sin);
            worldPos.y = parentTransform.position.y + (lx * sin + ly * cos);

            worldScale.x *= parentTransform.scale.x;
            worldScale.y *= parentTransform.scale.y;
            worldRot += parentTransform.rotation;
        }
    }

    return {
        position: worldPos,
        scale: worldScale,
        rotation: worldRot
    };
};

// --- 親子関係設定 (位置・スケール・回転補正付き) ---
window.event_setLayerParent = function (childLayerIdx, parentLayerId) {
    const childLayer = event_data.layers[childLayerIdx];
    if (!childLayer) return;

    const oldParentId = childLayer.parent;
    if (oldParentId === parentLayerId) return;

    // 循環参照チェック
    let currentId = parentLayerId;
    while (currentId) {
        if (currentId === childLayer.id) {
            alert("循環参照になるため設定できません");
            return;
        }
        const parent = event_data.layers.find(l => l.id === currentId);
        if (parent) currentId = parent.parent;
        else break;
    }

    // 1. 現在のワールド状態を記録 (親子付け変更前の見た目)
    const world = event_getLayerWorldTransform(childLayerIdx, event_currentTime);

    // 2. 親子関係を更新
    childLayer.parent = parentLayerId || null;

    // 3. 新しい親のワールド状態を取得
    let parentWorld = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 };
    if (childLayer.parent) {
        const pIdx = event_data.layers.findIndex(l => l.id === childLayer.parent);
        if (pIdx !== -1) {
            parentWorld = event_getLayerWorldTransform(pIdx, event_currentTime);
        }
    }

    // 4. 新しいローカル値を逆算
    const newLocalRot = world.rotation - parentWorld.rotation;

    const newLocalScale = {
        x: (parentWorld.scale.x !== 0) ? (world.scale.x / parentWorld.scale.x) * 100 : world.scale.x * 100,
        y: (parentWorld.scale.y !== 0) ? (world.scale.y / parentWorld.scale.y) * 100 : world.scale.y * 100
    };

    const dx = world.position.x - parentWorld.position.x;
    const dy = world.position.y - parentWorld.position.y;
    const pRad = -parentWorld.rotation * Math.PI / 180;
    const pCos = Math.cos(pRad);
    const pSin = Math.sin(pRad);

    let newLocalPos = {
        x: (dx * pCos - dy * pSin) / (parentWorld.scale.x || 1),
        y: (dx * pSin + dy * pCos) / (parentWorld.scale.y || 1)
    };

    // 5. 補正値を子レイヤーの全キーフレームと初期値に適用
    const currentLocalPos = event_getInterpolatedValue(childLayerIdx, "position", event_currentTime);
    const currentLocalScale = event_getInterpolatedValue(childLayerIdx, "scale", event_currentTime);
    const currentLocalRot = event_getInterpolatedValue(childLayerIdx, "rotation", event_currentTime);

    const posOffset = { x: newLocalPos.x - currentLocalPos.x, y: newLocalPos.y - currentLocalPos.y };
    const rotOffset = newLocalRot - currentLocalRot;

    childLayer.tracks["position"].keys.forEach(k => { k.value.x += posOffset.x; k.value.y += posOffset.y; });
    childLayer.tracks["position"].initialValue.x += posOffset.x;
    childLayer.tracks["position"].initialValue.y += posOffset.y;

    childLayer.tracks["rotation"].keys.forEach(k => { k.value += rotOffset; });
    childLayer.tracks["rotation"].initialValue += rotOffset;

    const scaleRatioX = newLocalScale.x / (currentLocalScale.x || 100);
    const scaleRatioY = newLocalScale.y / (currentLocalScale.y || 100);
    childLayer.tracks["scale"].keys.forEach(k => { k.value.x *= scaleRatioX; k.value.y *= scaleRatioY; });
    childLayer.tracks["scale"].initialValue.x *= scaleRatioX;
    childLayer.tracks["scale"].initialValue.y *= scaleRatioY;

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
    const layer = event_data.layers[layerIndex];
    const track = layer.tracks[prop];
    if (!track) {
        if (prop === 'position') return { x: 0, y: 0 };
        if (prop === 'scale') return { x: 100, y: 100 };
        if (prop === 'rotation') return 0;
        if (prop === 'opacity') return 100;
        return 0;
    }
    if (!track.keys || track.keys.length === 0) {
        return track.initialValue !== undefined ? track.initialValue : 0;
    }
    const keys = track.keys;
    if (keys.length === 1) return keys[0].value;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i + 1];
        if (time >= k1.time && time < k2.time) {
            if (track.type === 'string' || k1.interpolation === 'Hold') {
                return k1.value;
            }

            let t = (time - k1.time) / (k2.time - k1.time);

            const easeIn = k2.easeIn;
            const easeOut = k1.easeOut;

            if (easeIn && easeOut) {
                t = 0.5 * (1 - Math.cos(t * Math.PI));
            } else if (easeIn) {
                t = 1 - (1 - t) * (1 - t);
            } else if (easeOut) {
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
window.event_togglePlay = function () {
    event_isPlaying = !event_isPlaying;
    const btn = document.getElementById('btn-event-play');
    if (btn) btn.textContent = event_isPlaying ? '⏸' : '▶';
    if (event_isPlaying) {
        event_lastTimestamp = performance.now();
        event_syncAudio();
    } else {
        event_stopAllAudio();
    }
};

window.event_stop = function () {
    event_isPlaying = false;
    event_currentTime = 0;
    event_viewStartTime = 0;
    document.getElementById('btn-event-play').textContent = '▶';
    event_stopAllAudio();
    event_draw();
};

window.event_seekTo = function (time) {
    event_currentTime = Math.max(0, time);
    if (event_isPlaying) {
        event_syncAudio();
    } else {
        event_stopAllAudio();
    }
    event_draw();
};

window.event_addAudioLayer = function (name, assetId) {
    event_pushHistory();
    const asset = event_findAssetById(assetId);
    if (!asset || asset.type !== 'audio') return;

    const startT = event_currentTime;
    const dur = asset.duration || 5;

    // 空いているトラックを探す (簡易ロジック: 0番から順に、時間が被らないトラックを探す)
    let assignedTrack = 0;
    for (let t = 0; t < 4; t++) {
        const isOverlap = event_data.layers.some(l => {
            if (l.type === 'audio' && (l.trackIdx === undefined ? 0 : l.trackIdx) === t) {
                // 時間の重なり判定
                return !(startT + dur <= l.inPoint || startT >= l.outPoint);
            }
            return false;
        });
        if (!isOverlap) {
            assignedTrack = t;
            break;
        }
    }

    const newLayer = {
        id: 'layer_audio_' + Date.now(),
        type: 'audio',
        name: name,
        assetId: assetId,
        startTime: startT,
        inPoint: startT,
        outPoint: startT + dur,
        expanded: true,
        trackIdx: assignedTrack, // ★トラック番号 (0~3)
        tracks: {
            "volume": { label: "Volume (dB)", type: "number", keys: [], min: -60, max: 12, step: 0.1, initialValue: 0 }
        }
    };

    event_data.layers.unshift(newLayer);
    event_selectedLayerIndex = 0;
    event_draw();
};

/**
 * 音声トラックの表示モード切り替え
 */
window.event_toggleAudioMode = function () {
    event_audioCompactMode = !event_audioCompactMode;
    event_draw();
};

window.event_syncAudio = function () {
    if (!event_audioCtx) return;

    event_data.layers.forEach(layer => {
        if (layer.type !== 'audio') return;

        const asset = event_findAssetById(layer.assetId);
        if (!asset || !asset.audioBuffer) return;

        const offset = event_currentTime - layer.startTime;
        const isWithinRange = (event_currentTime >= layer.inPoint && event_currentTime < layer.outPoint);
        const isWithinBuffer = (offset >= 0 && offset < asset.audioBuffer.duration);

        if (event_isPlaying && isWithinRange && isWithinBuffer) {
            if (!event_audioLayers[layer.id]) {
                const source = event_audioCtx.createBufferSource();
                source.buffer = asset.audioBuffer;
                const gainNode = event_audioCtx.createGain();
                source.connect(gainNode);
                gainNode.connect(event_audioCtx.destination);

                const volDb = event_getInterpolatedValue(event_data.layers.indexOf(layer), "volume", event_currentTime);
                gainNode.gain.setValueAtTime(event_dbToGain(volDb), event_audioCtx.currentTime);

                const startOff = Math.max(0, offset);
                const duration = Math.min(asset.audioBuffer.duration - startOff, layer.outPoint - event_currentTime);

                source.start(0, startOff, duration);
                event_audioLayers[layer.id] = { source, gain: gainNode };

                source.onended = () => {
                    if (event_audioLayers[layer.id] && event_audioLayers[layer.id].source === source) {
                        delete event_audioLayers[layer.id];
                    }
                };
            }
        } else {
            if (event_audioLayers[layer.id]) {
                try {
                    event_audioLayers[layer.id].source.stop();
                } catch (e) { }
                delete event_audioLayers[layer.id];
            }
        }
    });
};

window.event_stopAllAudio = function () {
    Object.keys(event_audioLayers).forEach(id => {
        try {
            event_audioLayers[id].source.stop();
        } catch (e) { }
        delete event_audioLayers[id];
    });
};

window.event_updateAudioVolumes = function () {
    if (!event_audioCtx || !event_isPlaying) return;

    event_data.layers.forEach((layer, idx) => {
        if (layer.type === 'audio' && event_audioLayers[layer.id]) {
            const volDb = event_getInterpolatedValue(idx, "volume", event_currentTime);
            const gainNode = event_audioLayers[layer.id].gain;
            gainNode.gain.setTargetAtTime(event_dbToGain(volDb), event_audioCtx.currentTime, 0.05);
        }
    });
};

window.event_dbToGain = function (db) {
    if (db <= -60) return 0;
    return Math.pow(10, db / 20);
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

window.event_toggleSolidMenu = function () {
    const m = document.getElementById('event-solid-menu');
    if (m) m.style.display = (m.style.display === 'none') ? 'block' : 'none';
};

window.event_addSolidLayer = function (shape) {
    event_pushHistory();
    document.getElementById('event-solid-menu').style.display = 'none';

    const cx = event_data.composition.width / 2;
    const cy = event_data.composition.height / 2;

    const newLayer = {
        id: 'layer_solid_' + Date.now(),
        type: 'solid',
        name: (shape === 'rect' ? 'Square' : 'Circle'),
        shape: shape,
        color: '#ffffff',
        blendMode: 'source-over',
        parent: null,
        expanded: true,
        inPoint: 0,
        outPoint: event_data.composition.duration,
        tracks: {
            "position": { label: "Position", type: "vector2", keys: [], step: 1, initialValue: { x: cx, y: cy } },
            "scale": { label: "Scale", type: "vector2", linked: true, keys: [], step: 1, initialValue: { x: 100, y: 100 } },
            "rotation": { label: "Rotation", type: "rotation", keys: [], min: -3600, max: 3600, step: 1, initialValue: 0 },
            "opacity": { label: "Opacity", type: "number", keys: [], min: 0, max: 100, step: 1, initialValue: 100 }
        }
    };

    event_data.layers.unshift(newLayer);
    event_selectedLayerIndex = 0;
    event_draw();
};

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

window.anim_integrateToEvent = function () {
    if (!window.anim_data || Object.keys(window.anim_data).length === 0) {
        alert("アニメーションデータがありません");
        return;
    }

    const packName = document.getElementById('anim-pack-name').value || 'Animations';

    let tilesetSrc = "";
    if (window.anim_img instanceof HTMLImageElement) {
        tilesetSrc = window.anim_img.getAttribute('src') || window.anim_img.src;
    } else if (window.anim_img instanceof HTMLCanvasElement) {
        tilesetSrc = window.anim_img.toDataURL();
    }

    const newAsset = {
        type: 'animation',
        name: packName,
        id: 'anim_asset_' + Date.now(),
        data: JSON.parse(JSON.stringify(window.anim_data)),
        source: tilesetSrc,
        _collapsed: false
    };

    const existing = event_data.assets.find(a => a.type === 'animation' && a.name === packName);
    if (existing) {
        if (confirm(`既存のアセット "${packName}" を上書きしますか？`)) {
            event_pushHistory();
            Object.assign(existing, newAsset);
            existing.id = existing.id;
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

window.event_addAnimatedLayer = function (name, animAssetId, animId) {
    event_pushHistory();

    const asset = event_findAssetById(animAssetId);
    if (!asset || asset.type !== 'animation') return;

    const img = new Image();
    img.src = asset.source;
    img.onload = () => event_draw();

    const cx = event_data.composition.width / 2;
    const cy = event_data.composition.height / 2;

    const targetAnimId = animId || Object.keys(asset.data)[0] || "idle";

    const newLayer = {
        id: 'layer_anim_' + Date.now(),
        type: 'animated_layer',
        name: name || (asset.name + " (" + targetAnimId + ")"),
        animAssetId: animAssetId,
        animId: targetAnimId,
        startTime: event_currentTime,
        loop: true,
        imgObj: img,
        source: asset.source,
        blendMode: 'source-over',
        parent: null,
        expanded: true,
        inPoint: 0,
        outPoint: event_data.composition.duration,
        tracks: {
            "motion": { label: "Motion", type: "string", keys: [], step: 1, initialValue: targetAnimId },
            "position": { label: "Position", type: "vector2", keys: [], step: 1, initialValue: { x: cx, y: cy } },
            "scale": { label: "Scale", type: "vector2", linked: true, keys: [], step: 1, initialValue: { x: 100, y: 100 } },
            "rotation": { label: "Rotation", type: "rotation", keys: [], min: -3600, max: 3600, step: 1, initialValue: 0 },
            "opacity": { label: "Opacity", type: "number", keys: [], min: 0, max: 100, step: 1, initialValue: 100 }
        }
    };

    event_data.layers.unshift(newLayer);
    event_selectedLayerIndex = 0;
    event_draw();
};

window.event_getLayerAnimationNames = function (layerIdx) {
    const layer = event_data.layers[layerIdx];
    if (!layer || !layer.animAssetId) return [];

    const asset = event_findAssetById(layer.animAssetId);
    if (!asset || asset.type !== 'animation' || !asset.data) return [];

    return Object.keys(asset.data);
};

// --- テキストレイヤーを追加 ---
window.event_addTextLayer = function () {
    event_pushHistory();

    const cx = event_data.composition.width / 2;
    const cy = event_data.composition.height / 2;

    const newLayer = {
        id: 'layer_text_' + Date.now(),
        type: 'text',
        name: 'Text Layer',
        blendMode: 'source-over',
        // テキスト固有プロパティ (非アニメーション)
        text: "テキストを入力\n改行も可能",
        fontSize: 60,
        fontFamily: '"M PLUS Rounded 1c", sans-serif',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 0,
        shadowOpacity: 0, // ★追加: ドロップシャドウの不透明度 (0-100)

        parent: null,
        expanded: true,
        inPoint: 0,
        outPoint: event_data.composition.duration,
        tracks: {
            "position": { label: "Position", type: "vector2", keys: [], step: 1, initialValue: { x: cx, y: cy } },
            "scale": { label: "Scale", type: "vector2", linked: true, keys: [], step: 1, initialValue: { x: 100, y: 100 } },
            "rotation": { label: "Rotation", type: "rotation", keys: [], min: -3600, max: 3600, step: 1, initialValue: 0 },
            "opacity": { label: "Opacity", type: "number", keys: [], min: 0, max: 100, step: 1, initialValue: 100 },
            // テキスト固有トラック
            "typewriter": { label: "Typewriter (%)", type: "number", keys: [], min: 0, max: 100, step: 1, initialValue: 100 },
            "letterSpacing": { label: "Tracking (px)", type: "number", keys: [], step: 1, initialValue: 0 }
        }
    };

    event_data.layers.unshift(newLayer);
    event_selectedLayerIndex = 0;
    event_draw();
};

/**
 * UIからのテキストプロパティ変更反映
 */
window.event_onTextPropertyChange = function (prop) {
    if (event_selectedLayerIndex === -1) return;
    const layer = event_data.layers[event_selectedLayerIndex];
    if (layer.type !== 'text' && layer.type !== 'solid') return;

    let val;
    if (prop === 'text') {
        val = document.getElementById('inp-text-content').value.replace(/\\n/g, '\n');
    }
    else if (prop === 'fontSize') val = parseInt(document.getElementById('inp-text-size').value);
    else if (prop === 'color') val = document.getElementById('inp-text-color').value;
    else if (prop === 'strokeColor') val = document.getElementById('inp-text-stroke-color').value;
    else if (prop === 'strokeWidth') val = parseInt(document.getElementById('inp-text-stroke-w').value);
    else if (prop === 'shadowOpacity') val = parseInt(document.getElementById('inp-text-shadow').value);

    layer[prop] = val;
    event_draw();
};

/**
 * 選択レイヤーに応じてテキストUIの状態を更新
 * (event_drawなどで呼ばれる)
 */
window.event_updateTextPropertyUI = function () {
    const ui = document.getElementById('event-text-props');
    if (!ui) return;

    // 編集中（フォーカス中）は更新しない
    if (document.activeElement && ui.contains(document.activeElement)) return;

    if (event_selectedLayerIndex !== -1) {
        const layer = event_data.layers[event_selectedLayerIndex];
        if (layer && (layer.type === 'text' || layer.type === 'solid')) {
            ui.style.display = 'flex';

            const isText = (layer.type === 'text');

            // UI項目の表示・非表示を切り替え
            const textFields = ['event-prop-label-text', 'inp-text-content', 'inp-text-size', 'event-prop-label-px', 'event-prop-label-str', 'inp-text-stroke-color', 'inp-text-stroke-w', 'event-prop-label-shd', 'inp-text-shadow'];
            textFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = isText ? '' : 'none';
            });

            if (isText) {
                document.getElementById('inp-text-content').value = layer.text.replace(/\n/g, '\\n');
                document.getElementById('inp-text-size').value = layer.fontSize;
                document.getElementById('inp-text-stroke-color').value = layer.strokeColor;
                document.getElementById('inp-text-stroke-w').value = layer.strokeWidth;
                document.getElementById('inp-text-shadow').value = layer.shadowOpacity || 0;
            }

            document.getElementById('inp-text-color').value = layer.color || '#ffffff';
            return;
        }
    }
    ui.style.display = 'none';
};

// --- event_logic.js の末尾に追加してください ---

/**
 * 1フレーム単位でインジケータを移動
 * @param {number} dir -1: 戻る, 1: 進む
 */
window.event_stepFrame = function (dir) {
    const fps = event_data.composition.fps || 30;
    const frameTime = 1 / fps;

    // 現在時刻にフレーム時間を加算・減算し、フレームグリッドに吸着させる
    let newTime = event_currentTime + (dir * frameTime);

    // 浮動小数点誤差対策（一度フレーム番号にしてから戻す）
    const frame = Math.round(newTime * fps);
    newTime = frame / fps;

    if (newTime < 0) newTime = 0;
    if (newTime > event_data.composition.duration) newTime = event_data.composition.duration;

    event_seekTo(newTime);
};

/**
 * 現在のインジケータ位置を選択レイヤーのイン点（開始）に設定
 */
window.event_setInPointToCurrent = function () {
    if (event_selectedLayerIndex === -1) {
        alert("レイヤーを選択してください");
        return;
    }
    event_pushHistory();
    const layer = event_data.layers[event_selectedLayerIndex];
    const time = event_snapTime(event_currentTime);

    // イン点がアウト点を超えないように調整
    if (time >= layer.outPoint) {
        // アウト点を少し後ろにずらす（最小1フレーム幅確保）
        const fps = event_data.composition.fps || 30;
        layer.outPoint = time + (1 / fps);
    }

    layer.inPoint = time;

    // 音声やアニメーションの場合、開始タイミングの調整が必要であれば行う
    // (ここでは表示区間のみ変更し、メディアの再生開始位置自体はずらさない仕様とします)

    event_draw();
};

/**
 * 現在のインジケータ位置を選択レイヤーのアウト点（終了）に設定
 */
window.event_setOutPointToCurrent = function () {
    if (event_selectedLayerIndex === -1) {
        alert("レイヤーを選択してください");
        return;
    }
    event_pushHistory();
    const layer = event_data.layers[event_selectedLayerIndex];
    const time = event_snapTime(event_currentTime);

    // アウト点がイン点より前にならないように調整
    if (time <= layer.inPoint) {
        // イン点を少し前にずらす（最小1フレーム幅確保）
        const fps = event_data.composition.fps || 30;
        layer.inPoint = Math.max(0, time - (1 / fps));
    }

    layer.outPoint = time;
    event_draw();
};

/**
 * 選択レイヤーの先頭(inPoint)を現在のインジケータ位置まで移動させる
 * (キーフレームや再生タイミングも追従)
 */
window.event_moveLayerStartToCurrent = function () {
    if (event_selectedLayerIndex === -1) {
        alert("レイヤーを選択してください");
        return;
    }

    event_pushHistory();
    const layer = event_data.layers[event_selectedLayerIndex];
    const targetTime = event_snapTime(event_currentTime);

    // 移動量 (差分) を計算
    const dt = targetTime - layer.inPoint;

    // 各種プロパティに差分を加算
    layer.inPoint += dt;
    layer.outPoint += dt;

    if (layer.startTime !== undefined) {
        layer.startTime += dt;
    }

    // キーフレームも全て移動
    Object.values(layer.tracks).forEach(track => {
        if (track.keys) {
            track.keys.forEach(k => {
                k.time += dt;
            });
        }
    });

    event_draw();
};

/**
 * 選択レイヤーの末尾(outPoint)を現在のインジケータ位置まで移動させる
 * (キーフレームや再生タイミングも追従)
 */
window.event_moveLayerEndToCurrent = function () {
    if (event_selectedLayerIndex === -1) {
        alert("レイヤーを選択してください");
        return;
    }

    event_pushHistory();
    const layer = event_data.layers[event_selectedLayerIndex];
    const targetTime = event_snapTime(event_currentTime);

    // 移動量 (差分) を計算 (ターゲット - 現在の終了点)
    const dt = targetTime - layer.outPoint;

    // 各種プロパティに差分を加算
    layer.inPoint += dt;
    layer.outPoint += dt;

    if (layer.startTime !== undefined) {
        layer.startTime += dt;
    }

    // キーフレームも全て移動
    Object.values(layer.tracks).forEach(track => {
        if (track.keys) {
            track.keys.forEach(k => {
                k.time += dt;
            });
        }
    });

    event_draw();
};