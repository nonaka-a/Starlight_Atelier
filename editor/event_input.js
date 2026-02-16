/**
 * イベントエディタ: 入力処理
 * Step 29 (Fix): クリック判定ロジックを描画ロジック(View座標)と統一してズレを解消
 */

// Pick Whip用ステート変数
let event_pickWhipSourceLayerIdx = -1;

// 矩形選択用
let event_rectStartPos = { x: 0, y: 0 };
let event_rectEndPos = { x: 0, y: 0 };

// --- D&D受け入れ ---
window.event_onTimelineDragOver = function (e) {
    if (window.event_draggedAsset) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }
};

window.event_onTimelineDrop = function (e) {
    e.preventDefault();
    if (!window.event_draggedAsset) return;

    event_pushHistory(); // 履歴保存
    const item = window.event_draggedAsset;

    if (item.type === 'image') {
        event_addLayer(item.name, item.src);
    } else if (item.type === 'animation') {
        event_addAnimatedLayer(item.name, item.id);
    } else if (item.type === 'sub_animation') {
        event_addAnimatedLayer(item.name, item.parentAssetId, item.animId);
    } else if (item.type === 'audio') {
        event_addAudioLayer(item.name, item.id);
    } else if (item.type === 'comp') {
        console.log("Nested composition not supported yet.");
    }

    window.event_draggedAsset = null;
};

// --- 右クリックメニュー表示 ---
window.event_showKeyframeMenu = function (x, y, layerIdx, prop, keyObj) {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.backgroundColor = '#333';
    menu.style.border = '1px solid #666';
    menu.style.padding = '5px 0';
    menu.style.zIndex = '2000';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';

    const targets = event_selectedKeys.length > 0 && event_selectedKeys.some(k => k.keyObj === keyObj)
        ? event_selectedKeys.map(k => k.keyObj)
        : [keyObj];

    const items = [
        {
            label: (keyObj.interpolation === 'Hold' ? '✓ ' : '') + '停止キーフレーム (Hold)',
            action: () => {
                const newVal = (keyObj.interpolation === 'Hold' ? 'Linear' : 'Hold');
                targets.forEach(k => k.interpolation = newVal);
            }
        },
        {
            label: (keyObj.easeIn ? '✓ ' : '') + 'イーズイン',
            action: () => {
                const newVal = !keyObj.easeIn;
                targets.forEach(k => k.easeIn = newVal);
            }
        },
        {
            label: (keyObj.easeOut ? '✓ ' : '') + 'イーズアウト',
            action: () => {
                const newVal = !keyObj.easeOut;
                targets.forEach(k => k.easeOut = newVal);
            }
        },
        {
            label: '一括イーズイン/アウト',
            action: () => {
                const state = !(keyObj.easeIn && keyObj.easeOut);
                targets.forEach(k => { k.easeIn = state; k.easeOut = state; });
            }
        }
    ];

    items.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item.label;
        div.style.padding = '5px 20px';
        div.style.cursor = 'pointer';
        div.style.fontSize = '12px';
        div.style.color = '#fff';
        div.onmouseover = () => div.style.backgroundColor = '#444';
        div.onmouseout = () => div.style.backgroundColor = '';
        div.onclick = () => {
            event_pushHistory();
            item.action();
            event_draw();
            if (menu.parentNode) document.body.removeChild(menu);
        };
        menu.appendChild(div);
    });

    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            if (menu.parentNode) document.body.removeChild(menu);
            window.removeEventListener('mousedown', closeMenu);
        }
    };
    window.addEventListener('mousedown', closeMenu);
    document.body.appendChild(menu);
};

window.event_openKeyframeMenuFromButton = function (e) {
    if (!event_selectedKey) {
        alert("キーフレームを選択してください");
        return;
    }
    const { layerIdx, prop, keyObj } = event_selectedKey;
    const btn = e.target;
    const rect = btn.getBoundingClientRect();
    const x = rect.left;
    const y = Math.max(10, rect.top - 120);
    event_showKeyframeMenu(x, y, layerIdx, prop, keyObj);
};

window.event_onTimelineDblClick = function (e) {
    const rect = event_canvasTimeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const scrollY = event_timelineContainer.scrollTop;

    // ヘッダー判定 (見た目Y座標)
    if (clickY < EVENT_HEADER_HEIGHT) return;

    // View座標系 (描画ロジックと同じ基準)
    let currentY = EVENT_HEADER_HEIGHT - scrollY;

    for (let i = 0; i < event_data.layers.length; i++) {
        const layer = event_data.layers[i];

        // 結合モード時は音声レイヤーをスキップ
        if (event_audioCompactMode && layer.type === 'audio') continue;

        if (clickY >= currentY && clickY < currentY + EVENT_TRACK_HEIGHT) {
            const nameStart = 50;
            const nameEnd = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PARENT_RIGHT - 10;
            if (x >= nameStart && x <= nameEnd) {
                // インプット表示位置
                const inputY = currentY + 4; // View座標
                // ただし showInlineInput に渡すYは、rect.top からのオフセットなので clickY ベースでOKだが、
                // トラックの上端に合わせるために currentY を使う
                // event_showInlineInputは (rect.top + y) で表示するので、View座標(currentY)を渡せばOK
                event_showInlineInput(x, inputY, layer.name, 'string', (newName) => {
                    if (newName && newName.trim() !== "") {
                        event_pushHistory();
                        layer.name = newName;
                        event_draw();
                    }
                });
            }
            return;
        }
        currentY += EVENT_TRACK_HEIGHT;
        if (layer.expanded) {
            currentY += Object.keys(layer.tracks).length * EVENT_TRACK_HEIGHT;
        }
    }
};

window.event_updateSeekFromMouse = function (x) {
    let time = event_viewStartTime + (x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec;
    time = event_snapTime(Math.max(0, time));
    event_seekTo(time);
};

// --- マウスダウン処理 ---
window.event_onTimelineMouseDown = function (e) {
    const rect = event_canvasTimeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickY = e.clientY - rect.top; // View Y (Canvas内の表示位置)
    const scrollY = event_timelineContainer.scrollTop;

    // ヘッダー判定 (見た目Y座標)
    if (clickY < EVENT_HEADER_HEIGHT) {
        if (e.button === 0 && x > EVENT_LEFT_PANEL_WIDTH) {
            event_state = 'scrub-time';
            event_updateSeekFromMouse(x);
        }
        return;
    }

    const absoluteY = clickY + scrollY; // 矩形選択やドラッグ計算用には絶対座標も保持

    // 判定用変数: 描画ロジックと同じ View座標系 (currentScreenY) を使う
    let currentScreenY = EVENT_HEADER_HEIGHT - scrollY;

    // 右クリック判定
    if (e.button === 2) {
        for (let i = 0; i < event_data.layers.length; i++) {
            const layer = event_data.layers[i];

            // 結合モード時は音声レイヤーをスキップ
            if (event_audioCompactMode && layer.type === 'audio') continue;

            currentScreenY += EVENT_TRACK_HEIGHT; // レイヤー行スキップ
            if (layer.expanded) {
                for (let prop of Object.keys(layer.tracks)) {
                    if (clickY >= currentScreenY && clickY < currentScreenY + EVENT_TRACK_HEIGHT) {
                        for (let key of layer.tracks[prop].keys) {
                            const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                            if (Math.abs(x - kx) <= EVENT_KEYFRAME_HIT_RADIUS) {
                                const isSelected = event_selectedKeys.some(k => k.keyObj === key);
                                if (!isSelected) {
                                    event_selectedKeys = [{ layerIdx: i, prop: prop, keyObj: key }];
                                }
                                event_selectedKey = { layerIdx: i, prop: prop, keyObj: key };
                                event_selectedLayerIndex = i;
                                event_draw();
                                event_showKeyframeMenu(e.clientX, e.clientY, i, prop, key);
                                return;
                            }
                        }
                    }
                    currentScreenY += EVENT_TRACK_HEIGHT;
                }
            }
        }
        return;
    }

    // 左クリック判定リセット
    currentScreenY = EVENT_HEADER_HEIGHT - scrollY;
    let hitSomething = false;

    // --- 通常レイヤー判定 ---
    for (let i = 0; i < event_data.layers.length; i++) {
        const layer = event_data.layers[i];

        // 結合モード時は音声レイヤーをスキップ
        if (event_audioCompactMode && layer.type === 'audio') continue;

        // レイヤー行
        if (clickY >= currentScreenY && clickY < currentScreenY + EVENT_TRACK_HEIGHT) {
            if (x < EVENT_LEFT_PANEL_WIDTH) {
                hitSomething = true;
                const fromRight = EVENT_LEFT_PANEL_WIDTH - x;
                if (fromRight >= UI_LAYOUT.TRASH_RIGHT - 20 && fromRight <= UI_LAYOUT.TRASH_RIGHT) {
                    if (confirm("レイヤーを削除しますか？")) {
                        event_pushHistory();
                        event_data.layers.splice(i, 1);
                        event_selectedLayerIndex = -1;
                        event_draw();
                    }
                    return;
                }
                if (fromRight >= UI_LAYOUT.PICK_RIGHT - 16 && fromRight <= UI_LAYOUT.PICK_RIGHT) {
                    event_state = 'drag-pickwhip';
                    event_pickWhipSourceLayerIdx = i;
                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                    return;
                }
                if (fromRight >= UI_LAYOUT.PICK_RIGHT + 5 && fromRight <= UI_LAYOUT.PARENT_RIGHT) {
                    // 親選択メニューはView座標でOK（メニュー表示関数内でfixed配置するならclientX/Yを使う）
                    event_showParentSelect(e.clientX, e.clientY, i);
                    return;
                }
                if (x < 25) {
                    layer.expanded = !layer.expanded;
                } else {
                    event_pushHistory();
                    event_state = 'drag-layer-order';
                    event_selectedLayerIndex = i;
                    event_dragTarget = { layerIdx: i, originScreenY: currentScreenY }; // View座標を保存
                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                }
                event_selectedLayerIndex = i;
                event_selectedKey = null;
                if (!e.shiftKey) event_selectedKeys = [];
                event_draw();
            } else {
                // 右パネル
                const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;

                if (Math.abs(x - inX) <= EVENT_LAYER_HANDLE_WIDTH) {
                    hitSomething = true;
                    event_pushHistory(); event_state = 'drag-layer-in'; event_dragTarget = { layerIdx: i };
                } else if (Math.abs(x - outX) <= EVENT_LAYER_HANDLE_WIDTH) {
                    hitSomething = true;
                    event_pushHistory(); event_state = 'drag-layer-out'; event_dragTarget = { layerIdx: i };
                } else if (x > inX && x < outX) {
                    hitSomething = true;
                    event_pushHistory(); event_state = 'drag-layer-move'; event_dragTarget = { layerIdx: i, startIn: layer.inPoint, startOut: layer.outPoint };
                } else {
                    hitSomething = true;
                    event_selectedLayerIndex = i;
                    if (!e.shiftKey) {
                        event_selectedKey = null;
                        event_selectedKeys = [];
                    }
                }
                event_dragStartPos = { x: e.clientX, y: e.clientY };
                event_draw();
            }
            if (hitSomething) return;
        }
        currentScreenY += EVENT_TRACK_HEIGHT;

        // トラック行
        if (layer.expanded) {
            const props = Object.keys(layer.tracks);
            for (let prop of props) {
                const track = layer.tracks[prop];
                if (clickY >= currentScreenY && clickY < currentScreenY + EVENT_TRACK_HEIGHT) {
                    if (x < EVENT_LEFT_PANEL_WIDTH) {
                        hitSomething = true;
                        const fromRight = EVENT_LEFT_PANEL_WIDTH - x;
                        const curVal = event_getInterpolatedValue(i, prop, event_currentTime);

                        if (prop.startsWith('fx_') && x >= 15 && x <= 27) {
                            if (confirm(`エフェクト削除: ${track.label}?`)) {
                                event_pushHistory();
                                if (layer.effects) {
                                    const fxIdx = layer.effects.findIndex(fx => fx.trackName === prop);
                                    if (fxIdx !== -1) layer.effects.splice(fxIdx, 1);
                                }
                                delete layer.tracks[prop];
                                event_draw();
                            }
                            return;
                        }

                        // 音声トラック選択UI
                        if (layer.type === 'audio' && prop === 'volume') {
                            if (fromRight >= UI_LAYOUT.AUDIO_TRACK_SEL_RIGHT - UI_LAYOUT.AUDIO_TRACK_SEL_WIDTH && fromRight <= UI_LAYOUT.AUDIO_TRACK_SEL_RIGHT) {
                                const currentTrack = (layer.trackIdx !== undefined ? layer.trackIdx : 0) + 1;
                                // View座標 (currentScreenY) + 4px をY座標として渡す
                                event_showTrackSelectMenu(e.clientX, currentScreenY + 4 + rect.top, currentTrack, (newTrackVal) => {
                                    event_pushHistory();
                                    layer.trackIdx = newTrackVal - 1;
                                    event_draw();
                                });
                                return;
                            }
                        }

                        // 数値入力位置 (View Y)
                        const inputY = currentScreenY + 4;

                        if (track.type === 'vector2') {
                            if (prop === 'scale') {
                                const cx = EVENT_LEFT_PANEL_WIDTH - 220;
                                if (x >= cx && x <= cx + 25) { event_pushHistory(); event_updateKeyframe(i, prop, event_currentTime, { ...curVal, x: curVal.x * -1 }); event_draw(); return; }
                                if (x >= cx + 30 && x <= cx + 55) { event_pushHistory(); event_updateKeyframe(i, prop, event_currentTime, { ...curVal, y: curVal.y * -1 }); event_draw(); return; }
                                if (x >= EVENT_LEFT_PANEL_WIDTH - 113 && x <= EVENT_LEFT_PANEL_WIDTH - 103) { track.linked = !track.linked; event_draw(); return; }
                            }
                            if (fromRight >= UI_LAYOUT.VAL_VEC_X_RIGHT - UI_LAYOUT.VAL_VEC_WIDTH && fromRight <= UI_LAYOUT.VAL_VEC_X_RIGHT) {
                                event_pushHistory(); event_state = 'check-value-edit'; event_dragStartPos = { x: e.clientX, y: e.clientY };
                                event_dragTarget = { type: 'value', layerIdx: i, prop: prop, subProp: 'x', startVal: curVal.x, step: track.step, trackType: 'vector2', originX: x, originY: inputY, min: track.min, max: track.max, currentRatio: (curVal.x !== 0 ? curVal.y / curVal.x : 1) };
                                return;
                            }
                            if (fromRight >= UI_LAYOUT.VAL_VEC_Y_RIGHT - UI_LAYOUT.VAL_VEC_WIDTH && fromRight <= UI_LAYOUT.VAL_VEC_Y_RIGHT) {
                                event_pushHistory(); event_state = 'check-value-edit'; event_dragStartPos = { x: e.clientX, y: e.clientY };
                                event_dragTarget = { type: 'value', layerIdx: i, prop: prop, subProp: 'y', startVal: curVal.y, step: track.step, trackType: 'vector2', originX: x, originY: inputY, min: track.min, max: track.max, currentRatio: (curVal.y !== 0 ? curVal.x / curVal.y : 1) };
                                return;
                            }
                        } else {
                            if (fromRight >= UI_LAYOUT.VAL_SINGLE_RIGHT - UI_LAYOUT.VAL_SINGLE_WIDTH && fromRight <= UI_LAYOUT.VAL_SINGLE_RIGHT) {
                                event_pushHistory(); event_state = 'check-value-edit'; event_dragStartPos = { x: e.clientX, y: e.clientY };
                                event_dragTarget = { type: 'value', layerIdx: i, prop: prop, startVal: curVal, step: track.step, trackType: track.type, originX: x, originY: inputY, min: track.min, max: track.max };
                                return;
                            }
                        }
                        if (fromRight >= UI_LAYOUT.KEY_ADD_RIGHT - 10 && fromRight <= UI_LAYOUT.KEY_ADD_RIGHT + 10) {
                            event_pushHistory(); const v = event_getInterpolatedValue(i, prop, event_currentTime);
                            const nk = event_updateKeyframe(i, prop, event_currentTime, v);
                            event_selectedKey = { layerIdx: i, prop, keyObj: nk };
                            event_selectedKeys = [event_selectedKey];
                            event_draw(); return;
                        }
                    } else {
                        if (track.keys) {
                            for (let key of track.keys) {
                                const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                                if (Math.abs(x - kx) <= EVENT_KEYFRAME_HIT_RADIUS) {
                                    hitSomething = true;
                                    const isSelected = event_selectedKeys.some(sk => sk.keyObj === key);
                                    if (e.shiftKey) {
                                        if (isSelected) {
                                            event_selectedKeys = event_selectedKeys.filter(sk => sk.keyObj !== key);
                                            event_selectedKey = null;
                                        } else {
                                            const newSel = { layerIdx: i, prop, keyObj: key };
                                            event_selectedKeys.push(newSel);
                                            event_selectedKey = newSel;
                                        }
                                    } else {
                                        if (!isSelected) {
                                            const newSel = { layerIdx: i, prop, keyObj: key };
                                            event_selectedKeys = [newSel];
                                            event_selectedKey = newSel;
                                        }
                                        event_selectedKey = event_selectedKeys.find(sk => sk.keyObj === key);
                                    }

                                    event_pushHistory();
                                    event_state = 'drag-key';
                                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                                    event_dragTarget = {
                                        type: 'keys',
                                        keys: event_selectedKeys.map(sk => ({
                                            key: sk.keyObj,
                                            startTime: sk.keyObj.time,
                                            layerIdx: sk.layerIdx,
                                            prop: sk.prop
                                        }))
                                    };
                                    event_draw();
                                    return;
                                }
                            }
                        }
                    }
                }
                currentScreenY += EVENT_TRACK_HEIGHT;
            }
        }
    }

    // --- 音声トラックエリア判定 (Compact Mode) ---
    if (event_audioCompactMode) {
        for (let t = 0; t < 4; t++) {
            if (clickY >= currentScreenY && clickY < currentScreenY + EVENT_TRACK_HEIGHT) {
                // このトラック(t)内のレイヤーを探す
                for (let i = 0; i < event_data.layers.length; i++) {
                    const layer = event_data.layers[i];
                    if (layer.type !== 'audio') continue;
                    const tr = (layer.trackIdx !== undefined) ? layer.trackIdx : 0;
                    if (tr !== t) continue;

                    const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                    const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;

                    if (x >= inX && x <= outX && x > EVENT_LEFT_PANEL_WIDTH) {
                        hitSomething = true;
                        // 端か中か
                        if (Math.abs(x - inX) <= EVENT_LAYER_HANDLE_WIDTH) {
                            event_pushHistory(); event_state = 'drag-layer-in'; event_dragTarget = { layerIdx: i };
                        } else if (Math.abs(x - outX) <= EVENT_LAYER_HANDLE_WIDTH) {
                            event_pushHistory(); event_state = 'drag-layer-out'; event_dragTarget = { layerIdx: i };
                        } else {
                            event_pushHistory();
                            event_state = 'drag-layer-move';
                            // ★ドラッグ開始時のView座標(currentScreenY)を基準点として保存
                            event_dragTarget = { layerIdx: i, startIn: layer.inPoint, startOut: layer.outPoint, startTrack: t, originScreenY: currentScreenY };
                        }
                        event_selectedLayerIndex = i;
                        event_dragStartPos = { x: e.clientX, y: e.clientY };
                        event_draw();
                        return; // ヒットしたら終了
                    }
                }
            }
            currentScreenY += EVENT_TRACK_HEIGHT;
        }
    }

    // 矩形選択開始 (絶対座標を使用)
    if (!hitSomething && x > EVENT_LEFT_PANEL_WIDTH) {
        event_state = 'rect-select';
        event_rectStartPos = { x: x, y: absoluteY };
        event_rectEndPos = { x: x, y: absoluteY };
        if (!e.shiftKey) {
            event_selectedKeys = [];
            event_selectedKey = null;
        }
        event_draw();
    } else if (!hitSomething) {
        if (!e.shiftKey) {
            event_selectedLayerIndex = -1;
            event_selectedKey = null;
            event_selectedKeys = [];
            event_draw();
        }
    }
};

// --- マウス移動処理 ---
window.event_onGlobalMouseMove = function (e) {
    if (!document.getElementById('mode-event').classList.contains('active')) return;
    window.event_currentMouseX = e.clientX;
    window.event_currentMouseY = e.clientY;

    const rect = event_canvasTimeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickY = e.clientY - rect.top; // View Y
    const scrollY = event_timelineContainer.scrollTop;
    const absoluteY = clickY + scrollY; // Absolute Y

    if (event_state === 'idle') {
        let cursor = 'default';
        if (x > EVENT_LEFT_PANEL_WIDTH && clickY > EVENT_HEADER_HEIGHT) {
            let currentScreenY = EVENT_HEADER_HEIGHT - scrollY;
            for (let layer of event_data.layers) {
                // 通常レイヤー判定
                if (event_audioCompactMode && layer.type === 'audio') continue;

                if (clickY >= currentScreenY && clickY < currentScreenY + EVENT_TRACK_HEIGHT) {
                    const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                    const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
                    if (Math.abs(x - inX) <= EVENT_LAYER_HANDLE_WIDTH || Math.abs(x - outX) <= EVENT_LAYER_HANDLE_WIDTH) cursor = 'ew-resize';
                    else if (x > inX && x < outX) cursor = 'move';
                }
                currentScreenY += EVENT_TRACK_HEIGHT + (layer.expanded ? Object.keys(layer.tracks).length * EVENT_TRACK_HEIGHT : 0);
            }

            // Audio Compact Mode判定
            if (event_audioCompactMode) {
                // 線
                if (currentScreenY > EVENT_HEADER_HEIGHT) { /* Divider */ }
                for (let t = 0; t < 4; t++) {
                    if (clickY >= currentScreenY && clickY < currentScreenY + EVENT_TRACK_HEIGHT) {
                        // クリップ上なら move/resize (簡易判定: トラック内全クリップをループするのは重いので省略か、必要なら実装)
                    }
                    currentScreenY += EVENT_TRACK_HEIGHT;
                }
            }
        }
        event_canvasTimeline.style.cursor = cursor;
        return;
    }

    if (event_state === 'scrub-time') {
        event_updateSeekFromMouse(x);
    } else if (event_state === 'scrub-value') {
        const delta = e.clientX - event_dragStartPos.x;
        const t = event_dragTarget;
        if (t.prop === 'motion') return;
        const layer = event_data.layers[t.layerIdx];
        const track = layer.tracks[t.prop];
        let newVal;
        if (t.trackType === 'vector2') {
            const currentVec = event_getInterpolatedValue(t.layerIdx, t.prop, event_currentTime);
            newVal = { ...currentVec };
            const updatedVal = t.startVal + delta * t.step;
            newVal[t.subProp] = updatedVal;
            if (t.prop === 'scale' && track.linked) {
                if (t.subProp === 'x') newVal.y = Math.abs(updatedVal) * Math.abs(t.currentRatio) * (currentVec.y < 0 ? -1 : 1);
                else newVal.x = Math.abs(updatedVal) * Math.abs(t.currentRatio) * (currentVec.x < 0 ? -1 : 1);
            }
        } else {
            newVal = t.startVal + delta * t.step;
            if (t.min !== undefined) newVal = Math.max(t.min, newVal);
            if (t.max !== undefined) newVal = Math.min(t.max, newVal);
        }
        event_updateKeyframe(t.layerIdx, t.prop, event_currentTime, newVal);
        event_draw();
    } else if (event_state === 'drag-key') {
        const dt = (e.clientX - event_dragStartPos.x) / event_pixelsPerSec;
        event_dragTarget.keys.forEach(item => {
            let newTime = item.startTime + dt;
            newTime = Math.max(0, event_snapTime(newTime));
            item.key.time = newTime;
        });
        const affectedTracks = new Set();
        event_dragTarget.keys.forEach(item => {
            const layer = event_data.layers[item.layerIdx];
            if (layer && layer.tracks[item.prop]) affectedTracks.add(layer.tracks[item.prop]);
        });
        affectedTracks.forEach(track => {
            if (track.keys) track.keys.sort((a, b) => a.time - b.time);
        });
        event_draw();
    } else if (event_state === 'rect-select') {
        event_rectEndPos = { x: x, y: absoluteY };
        event_draw();
    } else if (event_state === 'drag-layer-order') {
        let currentScreenY = EVENT_HEADER_HEIGHT - scrollY;
        let targetIdx = -1;

        // clickY (View Y) で比較
        for (let i = 0; i < event_data.layers.length; i++) {
            // Compact Mode スキップは本来ここにも必要だが、並べ替え中は全レイヤー計算対象にするのが自然か？
            // いや、見えているものだけで判定すべき。
            if (event_audioCompactMode && event_data.layers[i].type === 'audio') continue;

            const h = EVENT_TRACK_HEIGHT + (event_data.layers[i].expanded ? Object.keys(event_data.layers[i].tracks).length * EVENT_TRACK_HEIGHT : 0);
            if (clickY >= currentScreenY && clickY < currentScreenY + h) { targetIdx = i; break; }
            currentScreenY += h;
        }

        if (targetIdx !== -1 && targetIdx !== event_dragTarget.layerIdx) {
            const item = event_data.layers.splice(event_dragTarget.layerIdx, 1)[0];
            event_data.layers.splice(targetIdx, 0, item);
            event_dragTarget.layerIdx = targetIdx; event_selectedLayerIndex = targetIdx;
            event_draw();
        }
    } else if (event_state === 'check-value-edit') {
        if (Math.abs(e.clientX - event_dragStartPos.x) > 3) event_state = 'scrub-value';
    } else if (event_state === 'resize-project') {
        const projectPanel = document.getElementById('event-project-panel');
        const newW = Math.max(50, Math.min(600, e.clientX));
        projectPanel.style.width = newW + 'px';
        event_draw();
    } else if (event_state === 'resize-panel') {
        const workspace = document.getElementById('event-workspace');
        const workspaceRect = workspace.getBoundingClientRect();
        const relativeY = e.clientY - workspaceRect.top;
        const percentage = (relativeY / workspaceRect.height) * 100;
        if (percentage > 10 && percentage < 90) {
            const tlHeight = 100 - percentage;
            event_timelinePanel.style.height = `${tlHeight}%`;
            event_draw();
        }
    } else if (event_state === 'drag-preview') {
        const dx = (e.clientX - event_dragStartPos.x) / event_previewScale;
        const dy = (e.clientY - event_dragStartPos.y) / event_previewScale;
        const layerIdx = event_dragTarget.layerIdx;
        const layer = event_data.layers[layerIdx];
        let moveX = dx; let moveY = dy;
        if (layer.parent) {
            const pIdx = event_data.layers.findIndex(l => l.id === layer.parent);
            if (pIdx !== -1) {
                const pWorld = event_getLayerWorldTransform(pIdx, event_currentTime);
                const pRad = -pWorld.rotation * Math.PI / 180;
                const pCos = Math.cos(pRad);
                const pSin = Math.sin(pRad);
                const lx = (dx * pCos - dy * pSin) / (pWorld.scale.x || 1);
                const ly = (dx * pSin + dy * pCos) / (pWorld.scale.y || 1);
                moveX = lx; moveY = ly;
            }
        }
        const newX = event_dragTarget.startX + moveX;
        const newY = event_dragTarget.startY + moveY;
        event_updateKeyframe(layerIdx, 'position', event_currentTime, { x: newX, y: newY });
        event_draw();
    } else if (event_state === 'drag-layer-in' || event_state === 'drag-layer-out' || event_state === 'drag-layer-move') {
        const dt = (e.clientX - event_dragStartPos.x) / event_pixelsPerSec;
        const layer = event_data.layers[event_dragTarget.layerIdx];

        if (event_state === 'drag-layer-in') {
            layer.inPoint = Math.min(event_snapTime(layer.inPoint + dt), layer.outPoint);
        } else if (event_state === 'drag-layer-out') {
            layer.outPoint = Math.max(event_snapTime(layer.outPoint + dt), layer.inPoint);
        } else {
            // move
            layer.inPoint += dt;
            layer.outPoint += dt;
            if (layer.startTime !== undefined) {
                layer.startTime += dt;
            }
            Object.values(layer.tracks).forEach(tr => tr.keys && tr.keys.forEach(k => k.time += dt));

            // 音声トラック間の移動 (Compact Mode時)
            if (event_audioCompactMode && layer.type === 'audio' && event_dragTarget.startTrack !== undefined) {
                // View座標同士の差分 (clickY - originScreenY) を使う
                // ※ absoluteY - originY だと、スクロールしたときにずれる可能性があるため、View座標で統一
                const dy = clickY - event_dragTarget.originScreenY;
                const trackDiff = Math.round(dy / EVENT_TRACK_HEIGHT);
                const newTrack = event_dragTarget.startTrack + trackDiff;
                if (newTrack >= 0 && newTrack < 4) {
                    layer.trackIdx = newTrack;
                }
            }
        }
        event_dragStartPos = { x: e.clientX, y: e.clientY };

        event_draw();
    }
};

window.event_onGlobalMouseUp = function (e) {
    if (event_state === 'drag-pickwhip') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const scrollY = event_timelineContainer.scrollTop;
        const absoluteY = clickY + scrollY;

        let curY = EVENT_HEADER_HEIGHT;
        let targetIdx = -1;
        for (let i = 0; i < event_data.layers.length; i++) {
            if (absoluteY >= curY && absoluteY < curY + EVENT_TRACK_HEIGHT && x < EVENT_LEFT_PANEL_WIDTH) { targetIdx = i; break; }
            curY += EVENT_TRACK_HEIGHT + (event_data.layers[i].expanded ? Object.keys(event_data.layers[i].tracks).length * EVENT_TRACK_HEIGHT : 0);
        }
        if (targetIdx !== -1 && targetIdx !== event_pickWhipSourceLayerIdx) {
            event_pushHistory(); event_setLayerParent(event_pickWhipSourceLayerIdx, event_data.layers[targetIdx].id);
        }
        event_pickWhipSourceLayerIdx = -1;
    } else if (event_state === 'rect-select') {
        const x1 = Math.min(event_rectStartPos.x, event_rectEndPos.x);
        const x2 = Math.max(event_rectStartPos.x, event_rectEndPos.x);
        const y1 = Math.min(event_rectStartPos.y, event_rectEndPos.y);
        const y2 = Math.max(event_rectStartPos.y, event_rectEndPos.y);

        let curY = EVENT_HEADER_HEIGHT;
        event_data.layers.forEach((iLayer, i) => {
            curY += EVENT_TRACK_HEIGHT;
            if (iLayer.expanded) {
                Object.keys(iLayer.tracks).forEach(prop => {
                    const track = iLayer.tracks[prop];
                    if (curY + EVENT_TRACK_HEIGHT > y1 && curY < y2) {
                        if (track.keys) {
                            track.keys.forEach(key => {
                                const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                                const ky = curY + EVENT_TRACK_HEIGHT / 2;
                                if (kx >= x1 && kx <= x2 && ky >= y1 && ky <= y2) {
                                    if (!event_selectedKeys.some(sk => sk.keyObj === key)) {
                                        event_selectedKeys.push({ layerIdx: i, prop: prop, keyObj: key });
                                    }
                                }
                            });
                        }
                    }
                    curY += EVENT_TRACK_HEIGHT;
                });
            }
        });
        event_selectedKey = event_selectedKeys[0] || null;
        event_draw();

    } else if (event_state === 'check-value-edit') {
        const t = event_dragTarget;
        if (t.prop === 'motion') {
            const options = event_getLayerAnimationNames(t.layerIdx);
            event_showEnumSelect(t.originX - 40, t.originY, t.startVal, options, (val) => {
                event_pushHistory();
                event_updateKeyframe(t.layerIdx, t.prop, event_currentTime, val);
                event_draw();
            });
        } else {
            const initVal = (t.trackType === 'vector2') ? Math.abs(t.startVal).toFixed(1) : t.startVal.toString();
            // originY は View座標 で渡されている
            const inputY = t.originY + (event_canvasTimeline.getBoundingClientRect().top);
            // event_showInlineInput は絶対座標(screen)を期待する実装になっているか？ 
            // -> event_input.js冒頭の実装では `rect.top + y` としている。
            // つまり t.originY が「Canvas内Y」ならOK。
            event_showInlineInput(t.originX - 40, t.originY, initVal, t.trackType, (val) => {
                event_pushHistory();
                if (t.trackType === 'vector2') {
                    const vec = { ...event_getInterpolatedValue(t.layerIdx, t.prop, event_currentTime) };
                    const f = parseFloat(val);
                    if (!isNaN(f)) {
                        vec[t.subProp] = Math.abs(f) * (vec[t.subProp] < 0 ? -1 : 1);
                        if (t.prop === 'scale' && event_data.layers[t.layerIdx].tracks[t.prop].linked) {
                            const ratio = (vec[t.subProp] !== 0) ? Math.abs(vec[t.subProp === 'x' ? 'y' : 'x'] / vec[t.subProp]) : 1;
                            vec[t.subProp === 'x' ? 'y' : 'x'] = Math.abs(vec[t.subProp]) * ratio * (vec[t.subProp === 'x' ? 'y' : 'x'] < 0 ? -1 : 1);
                        }
                        event_updateKeyframe(t.layerIdx, t.prop, event_currentTime, vec);
                    }
                } else event_updateKeyframe(t.layerIdx, t.prop, event_currentTime, val);
                event_draw();
            });
        }
    }
    event_state = 'idle'; event_dragTarget = null; event_draw();
};

window.event_onPreviewMouseDown = function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const rect = event_canvasPreview.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / event_previewScale;
    const my = (e.clientY - rect.top) / event_previewScale;

    for (let i = 0; i < event_data.layers.length; i++) {
        const layer = event_data.layers[i];
        if (event_currentTime < layer.inPoint || event_currentTime > layer.outPoint || layer.type === 'audio') continue;

        let img = layer.imgObj;
        if (layer.type === 'animated_layer') {
            const asset = event_findAssetById(layer.animAssetId);
            if (!img && asset) img = asset.imgObj;
        }
        if (!img && layer.type !== 'text' && layer.type !== 'solid') continue;

        const world = event_getLayerWorldTransform(i, event_currentTime);

        let hitW = 64, hitH = 64;

        if (layer.type === 'text') {
            const fontSize = layer.fontSize || 40;
            const text = layer.text || "";
            const fontFamily = layer.fontFamily || 'sans-serif';

            if (event_ctxPreview) {
                event_ctxPreview.save();
                event_ctxPreview.font = `bold ${fontSize}px ${fontFamily}`;
                const lines = text.split('\n');
                let maxW = 0;
                lines.forEach(line => {
                    const w = event_ctxPreview.measureText(line).width;
                    if (w > maxW) maxW = w;
                });
                const letterSpacing = event_getInterpolatedValue(i, "letterSpacing", event_currentTime) || 0;
                if (letterSpacing !== 0) {
                    let maxLen = 0;
                    lines.forEach(l => maxLen = Math.max(maxLen, l.length));
                    if (maxLen > 1) maxW += (maxLen - 1) * letterSpacing;
                }
                hitW = maxW;
                hitH = lines.length * fontSize * 1.2;
                event_ctxPreview.restore();
            } else {
                hitW = 200; hitH = 50;
            }
            const strokeW = layer.strokeWidth || 0;
            hitW += strokeW; hitH += strokeW;

        } else if (layer.type === 'solid') {
            const cw = event_data.composition.width;
            const ch = event_data.composition.height;
            if (layer.shape === 'circle') {
                const r = Math.min(cw, ch) / 2;
                hitW = r * 2; hitH = r * 2;
            } else {
                hitW = cw; hitH = ch;
            }
        } else {
            const iw = img.naturalWidth || 64;
            const ih = img.naturalHeight || 64;
            hitW = iw; hitH = ih;
            if (layer.type === 'animated_layer') {
                const asset = event_findAssetById(layer.animAssetId);
                const currentAnimId = event_getInterpolatedValue(i, "motion", event_currentTime);
                if (asset && asset.data && asset.data[currentAnimId]) {
                    const frames = asset.data[currentAnimId].frames;
                    if (frames.length > 0) {
                        hitW = frames[0].w;
                        hitH = frames[0].h;
                    }
                }
            }
        }

        const dx = mx - world.position.x;
        const dy = my - world.position.y;
        const rad = -world.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const lx = (dx * cos - dy * sin) / (world.scale.x || 1);
        const ly = (dx * sin + dy * cos) / (world.scale.y || 1);

        if (lx >= -hitW / 2 && lx <= hitW / 2 && ly >= -hitH / 2 && ly <= hitH / 2) {
            const pos = event_getInterpolatedValue(i, "position", event_currentTime);
            event_pushHistory();
            event_selectedLayerIndex = i;
            event_state = 'drag-preview';
            event_dragStartPos = { x: e.clientX, y: e.clientY };
            event_dragTarget = { layerIdx: i, startX: pos.x, startY: pos.y };
            event_draw();
            if (window.event_updateTextPropertyUI) window.event_updateTextPropertyUI();
            return;
        }
    }
    event_selectedLayerIndex = -1;
    event_draw();
    if (window.event_updateTextPropertyUI) window.event_updateTextPropertyUI();
};

window.event_onKeyDown = function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (!document.getElementById('mode-event').classList.contains('active')) return;

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        e.preventDefault();
        if (event_selectedLayerIndex !== -1) event_duplicateLayer(event_selectedLayerIndex);
        return;
    }

    if (e.code === 'F9' && event_selectedKey) {
        event_pushHistory();
        const keys = event_selectedKeys.length > 0 ? event_selectedKeys : [event_selectedKey];
        const s = !(keys[0].keyObj.easeIn && keys[0].keyObj.easeOut);
        keys.forEach(k => { k.keyObj.easeIn = s; k.keyObj.easeOut = s; });
        event_draw();
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') event_copySelectedKeyframe();
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') { event_pushHistory(); event_pasteKeyframe(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z')) { e.preventDefault(); event_undo(); }
    else if (e.code === 'Space') { e.preventDefault(); event_togglePlay(); }
    else if (e.code === 'Delete' || e.code === 'Backspace') { event_pushHistory(); event_deleteSelectedKeyframe(); }
    else if (e.code === 'KeyU' && event_selectedLayerIndex !== -1) { event_data.layers[event_selectedLayerIndex].expanded = !event_data.layers[event_selectedLayerIndex].expanded; event_draw(); }
    else if (e.code === 'KeyJ') { event_jumpToPrevKeyframe(); }
    else if (e.code === 'KeyK') { event_jumpToNextKeyframe(); }
};

window.event_showInlineInput = function (x, y, initialValue, trackType, callback) {
    const input = document.createElement('input');
    input.type = 'text'; input.value = initialValue;
    input.style.position = 'absolute';
    const rect = event_canvasTimeline.getBoundingClientRect();
    input.style.left = (rect.left + x) + 'px';
    input.style.top = (rect.top + y) + 'px';
    input.style.width = '80px'; input.style.zIndex = '3000';
    const commit = () => {
        let val = input.value;
        if (trackType === 'rotation' && val.includes('+')) {
            const p = val.split('+'); val = parseFloat(p[0]) * 360 + parseFloat(p[1]);
        } else if (trackType !== 'string') val = parseFloat(val);
        if (!isNaN(val) || trackType === 'string') callback(val);
        if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.onkeydown = (e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.onblur = commit;
    document.body.appendChild(input);
    input.focus();
};

window.event_showParentSelect = function (x, y, childIdx) {
    const oldMenu = document.getElementById('event-parent-custom-menu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'event-parent-custom-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.backgroundColor = '#333';
    menu.style.border = '1px solid #666';
    menu.style.padding = '5px 0';
    menu.style.zIndex = '3000';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    menu.style.minWidth = '140px';
    menu.style.borderRadius = '4px';

    const currentParentId = event_data.layers[childIdx].parent;
    const options = [
        { id: null, name: "なし" },
        ...event_data.layers.filter(l => l.id !== event_data.layers[childIdx].id).map(l => ({ id: l.id, name: l.name }))
    ];

    options.forEach(opt => {
        const item = document.createElement('div');
        item.style.padding = '6px 15px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        item.style.color = (opt.id === currentParentId) ? '#66aa44' : '#fff';
        item.textContent = (opt.id === currentParentId ? '✓ ' : '') + opt.name;
        item.onmouseover = () => item.style.backgroundColor = '#444';
        item.onmouseout = () => item.style.backgroundColor = '';
        item.onclick = (e) => {
            e.stopPropagation();
            event_pushHistory();
            event_setLayerParent(childIdx, opt.id);
            menu.remove();
        };
        menu.appendChild(item);
    });

    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            if (menu.parentNode) menu.remove();
            window.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => window.addEventListener('mousedown', closeMenu), 10);
    document.body.appendChild(menu);
};

window.event_showTrackSelectMenu = function (x, y, currentTrack, callback) {
    const oldMenu = document.getElementById('event-track-select-menu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'event-track-select-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.backgroundColor = '#333';
    menu.style.border = '1px solid #666';
    menu.style.padding = '5px 0';
    menu.style.zIndex = '3000';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';

    [1, 2, 3, 4].forEach(tNum => {
        const item = document.createElement('div');
        item.style.padding = '6px 15px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        item.style.color = (tNum === currentTrack) ? '#66aa44' : '#fff';
        item.textContent = `Track ${tNum}` + (tNum === currentTrack ? ' ✓' : '');

        item.onmouseover = () => item.style.backgroundColor = '#444';
        item.onmouseout = () => item.style.backgroundColor = '';
        item.onclick = (e) => {
            e.stopPropagation();
            callback(tNum);
            menu.remove();
        };
        menu.appendChild(item);
    });

    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            if (menu.parentNode) menu.remove();
            window.removeEventListener('mousedown', closeMenu);
        }
    };
    setTimeout(() => window.addEventListener('mousedown', closeMenu), 10);
    document.body.appendChild(menu);
};

window.event_showEnumSelect = function (x, y, initialValue, options, callback) {
    const select = document.createElement('select');
    const rect = event_canvasTimeline.getBoundingClientRect();
    select.style.position = 'absolute';
    select.style.left = (rect.left + x) + 'px';
    select.style.top = (rect.top + y) + 'px';
    select.style.zIndex = '3000';
    options.forEach(o => {
        const opt = document.createElement('option'); opt.value = o; opt.text = o;
        if (o === initialValue) opt.selected = true;
        select.appendChild(opt);
    });
    const removeSelect = () => { if (select.parentNode) select.parentNode.removeChild(select); };
    select.onchange = () => { callback(select.value); removeSelect(); };
    select.onblur = () => setTimeout(removeSelect, 150);
    document.body.appendChild(select); select.focus();
};

window.addEventListener('DOMContentLoaded', () => {
    const c = document.getElementById('event-timeline-canvas');
    if (c) c.oncontextmenu = (e) => e.preventDefault();
});

window.event_toggleEffectMenu = function () {
    const m = document.getElementById('event-effect-menu');
    m.style.display = (m.style.display === 'block') ? 'none' : 'block';
};

window.event_addEffect = function (type) {
    document.getElementById('event-effect-menu').style.display = 'none';
    if (event_selectedLayerIndex === -1) return alert("レイヤーを選択してください");
    const layer = event_data.layers[event_selectedLayerIndex];
    if (!layer.effects) layer.effects = [];
    event_pushHistory();
    if (type === 'blur') {
        const id = Date.now().toString(), tn = `fx_blur_${id}`;
        layer.effects.push({ id, type, trackName: tn, enabled: true });
        if (!layer.tracks) layer.tracks = {};
        layer.tracks[tn] = { type: 'number', label: 'FX: Blur', min: 0, max: 100, step: 0.1, keys: [{ time: event_currentTime, value: 5, interpolation: 'Linear' }] };
        layer.expanded = true;
    }
    event_draw();
};