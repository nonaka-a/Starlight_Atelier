/**
 * イベントエディタ: 入力処理
 * 修正版: 座標判定の不具合を解消 (二重スクロール加算の撤廃)
 */

// Pick Whip用ステート変数
let event_pickWhipSourceLayerIdx = -1;

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

    const items = [
        {
            label: (keyObj.interpolation === 'Hold' ? '✓ ' : '') + '停止キーフレーム',
            action: () => {
                keyObj.interpolation = (keyObj.interpolation === 'Hold' ? 'Linear' : 'Hold');
            }
        },
        {
            label: (keyObj.easeIn ? '✓ ' : '') + 'イーズイン',
            action: () => {
                keyObj.easeIn = !keyObj.easeIn;
            }
        },
        {
            label: (keyObj.easeOut ? '✓ ' : '') + 'イーズアウト',
            action: () => {
                keyObj.easeOut = !keyObj.easeOut;
            }
        },
        {
            label: '一括イーズイン/アウト',
            action: () => {
                const state = !(keyObj.easeIn && keyObj.easeOut);
                keyObj.easeIn = state;
                keyObj.easeOut = state;
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
            document.body.removeChild(menu);
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

// --- ボタンからメニューを開く ---
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

// --- ダブルクリック処理 ---
window.event_onTimelineDblClick = function (e) {
    const rect = event_canvasTimeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickY = e.clientY - rect.top; // キャンバス内絶対Y座標
    const scrollY = event_timelineContainer.scrollTop;

    // ヘッダー固定エリア(見た目)はガード
    // clickY - scrollY が見た目のY座標
    if ((clickY - scrollY) < EVENT_HEADER_HEIGHT) return;

    // トラック判定は絶対座標 clickY をそのまま使用
    let currentY = EVENT_HEADER_HEIGHT;
    for (let i = 0; i < event_data.layers.length; i++) {
        const layer = event_data.layers[i];
        if (clickY >= currentY && clickY < currentY + EVENT_TRACK_HEIGHT) {
            const nameStart = 50;
            const nameEnd = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PARENT_RIGHT - 10;
            if (x >= nameStart && x <= nameEnd) {
                event_showInlineInput(x, clickY, layer.name, 'string', (newName) => {
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
    const clickY = e.clientY - rect.top; // キャンバス内絶対Y座標
    const scrollY = event_timelineContainer.scrollTop;

    // --- 1. ヘッダー判定 (固定エリア) ---
    // 見た目上のY座標 (clickY - scrollY) で判定
    if ((clickY - scrollY) < EVENT_HEADER_HEIGHT) {
        if (e.button === 0 && x > EVENT_LEFT_PANEL_WIDTH) {
            event_state = 'scrub-time';
            event_updateSeekFromMouse(x);
        }
        return;
    }

    // --- 2. トラックコンテンツ判定 ---
    // キャンバス内絶対Y座標 clickY をそのまま使用
    const y = clickY;

    // 右クリック判定
    if (e.button === 2) {
        let curY = EVENT_HEADER_HEIGHT;
        for (let i = 0; i < event_data.layers.length; i++) {
            const layer = event_data.layers[i];
            curY += EVENT_TRACK_HEIGHT;
            if (layer.expanded) {
                for (let prop of Object.keys(layer.tracks)) {
                    if (y >= curY && y < curY + EVENT_TRACK_HEIGHT) {
                        for (let key of layer.tracks[prop].keys) {
                            const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                            if (Math.abs(x - kx) <= EVENT_KEYFRAME_HIT_RADIUS) {
                                event_selectedKey = { layerIdx: i, prop: prop, keyObj: key };
                                event_selectedLayerIndex = i;
                                event_draw();
                                event_showKeyframeMenu(e.clientX, e.clientY, i, prop, key);
                                return;
                            }
                        }
                    }
                    curY += EVENT_TRACK_HEIGHT;
                }
            }
        }
        return;
    }

    let currentY = EVENT_HEADER_HEIGHT;
    for (let i = 0; i < event_data.layers.length; i++) {
        const layer = event_data.layers[i];

        // レイヤーメイン行
        if (y >= currentY && y < currentY + EVENT_TRACK_HEIGHT) {
            if (x < EVENT_LEFT_PANEL_WIDTH) {
                const fromRight = EVENT_LEFT_PANEL_WIDTH - x;
                // ゴミ箱
                if (fromRight >= UI_LAYOUT.TRASH_RIGHT - 20 && fromRight <= UI_LAYOUT.TRASH_RIGHT) {
                    if (confirm("レイヤーを削除しますか？")) {
                        event_pushHistory();
                        event_data.layers.splice(i, 1);
                        event_selectedLayerIndex = -1;
                        event_draw();
                    }
                    return;
                }
                // 親選択 ◎
                if (fromRight >= UI_LAYOUT.PICK_RIGHT - 16 && fromRight <= UI_LAYOUT.PICK_RIGHT) {
                    event_state = 'drag-pickwhip';
                    event_pickWhipSourceLayerIdx = i;
                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                    return;
                }
                // 親プルダウン
                if (fromRight >= UI_LAYOUT.PICK_RIGHT + 5 && fromRight <= UI_LAYOUT.PARENT_RIGHT) {
                    event_showParentSelect(e.clientX, e.clientY, i);
                    return;
                }
                // 展開
                if (x < 25) {
                    layer.expanded = !layer.expanded;
                } else {
                    event_pushHistory();
                    event_state = 'drag-layer-order';
                    event_selectedLayerIndex = i;
                    event_dragTarget = { layerIdx: i };
                    event_dragStartPos = { x: e.clientX, y: e.clientY };
                }
                event_selectedLayerIndex = i;
                event_selectedKey = null;
                event_draw();
            } else {
                // タイムラインバー操作
                const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
                if (Math.abs(x - inX) <= EVENT_LAYER_HANDLE_WIDTH) {
                    event_pushHistory(); event_state = 'drag-layer-in'; event_dragTarget = { layerIdx: i };
                } else if (Math.abs(x - outX) <= EVENT_LAYER_HANDLE_WIDTH) {
                    event_pushHistory(); event_state = 'drag-layer-out'; event_dragTarget = { layerIdx: i };
                } else if (x > inX && x < outX) {
                    event_pushHistory(); event_state = 'drag-layer-move'; event_dragTarget = { layerIdx: i, startIn: layer.inPoint, startOut: layer.outPoint };
                } else {
                    event_selectedLayerIndex = i; event_selectedKey = null;
                }
                event_dragStartPos = { x: e.clientX, y: e.clientY };
                event_draw();
            }
            return;
        }
        currentY += EVENT_TRACK_HEIGHT;

        // プロパティトラック行
        if (layer.expanded) {
            const props = Object.keys(layer.tracks);
            for (let prop of props) {
                const track = layer.tracks[prop];
                if (y >= currentY && y < currentY + EVENT_TRACK_HEIGHT) {
                    if (x < EVENT_LEFT_PANEL_WIDTH) {
                        const fromRight = EVENT_LEFT_PANEL_WIDTH - x;
                        const curVal = event_getInterpolatedValue(i, prop, event_currentTime);

                        // エフェクト削除
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

                        // 数値編集
                        if (track.type === 'vector2') {
                            if (prop === 'scale') {
                                const cx = EVENT_LEFT_PANEL_WIDTH - 220;
                                if (x >= cx && x <= cx + 25) { event_pushHistory(); event_updateKeyframe(i, prop, event_currentTime, { ...curVal, x: curVal.x * -1 }); event_draw(); return; }
                                if (x >= cx + 30 && x <= cx + 55) { event_pushHistory(); event_updateKeyframe(i, prop, event_currentTime, { ...curVal, y: curVal.y * -1 }); event_draw(); return; }
                                if (x >= EVENT_LEFT_PANEL_WIDTH - 113 && x <= EVENT_LEFT_PANEL_WIDTH - 103) { track.linked = !track.linked; event_draw(); return; }
                            }
                            // X値判定
                            if (fromRight >= UI_LAYOUT.VAL_VEC_X_RIGHT - UI_LAYOUT.VAL_VEC_WIDTH && fromRight <= UI_LAYOUT.VAL_VEC_X_RIGHT) {
                                event_pushHistory(); event_state = 'check-value-edit'; event_dragStartPos = { x: e.clientX, y: e.clientY };
                                event_dragTarget = { type: 'value', layerIdx: i, prop: prop, subProp: 'x', startVal: curVal.x, step: track.step, trackType: 'vector2', originX: x, originY: clickY, min: track.min, max: track.max, currentRatio: (curVal.x !== 0 ? curVal.y / curVal.x : 1) };
                                return;
                            }
                            // Y値判定
                            if (fromRight >= UI_LAYOUT.VAL_VEC_Y_RIGHT - UI_LAYOUT.VAL_VEC_WIDTH && fromRight <= UI_LAYOUT.VAL_VEC_Y_RIGHT) {
                                event_pushHistory(); event_state = 'check-value-edit'; event_dragStartPos = { x: e.clientX, y: e.clientY };
                                event_dragTarget = { type: 'value', layerIdx: i, prop: prop, subProp: 'y', startVal: curVal.y, step: track.step, trackType: 'vector2', originX: x, originY: clickY, min: track.min, max: track.max, currentRatio: (curVal.y !== 0 ? curVal.x / curVal.y : 1) };
                                return;
                            }
                        } else {
                            if (fromRight >= UI_LAYOUT.VAL_SINGLE_RIGHT - UI_LAYOUT.VAL_SINGLE_WIDTH && fromRight <= UI_LAYOUT.VAL_SINGLE_RIGHT) {
                                event_pushHistory(); event_state = 'check-value-edit'; event_dragStartPos = { x: e.clientX, y: e.clientY };
                                event_dragTarget = { type: 'value', layerIdx: i, prop: prop, startVal: curVal, step: track.step, trackType: track.type, originX: x, originY: clickY, min: track.min, max: track.max };
                                return;
                            }
                        }
                        // キー追加
                        if (fromRight >= UI_LAYOUT.KEY_ADD_RIGHT - 10 && fromRight <= UI_LAYOUT.KEY_ADD_RIGHT + 10) {
                            event_pushHistory(); const v = event_getInterpolatedValue(i, prop, event_currentTime);
                            const nk = event_updateKeyframe(i, prop, event_currentTime, v);
                            event_selectedKey = { layerIdx: i, prop, keyObj: nk }; event_draw(); return;
                        }
                    } else {
                        // キー選択
                        if (track.keys) {
                            for (let key of track.keys) {
                                const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                                if (Math.abs(x - kx) <= EVENT_KEYFRAME_HIT_RADIUS) {
                                    event_pushHistory(); event_state = 'drag-key'; event_dragTarget = { type: 'key', obj: key, layerIdx: i, prop };
                                    event_selectedKey = { layerIdx: i, prop, keyObj: key }; event_draw(); return;
                                }
                            }
                        }
                    }
                    return;
                }
                currentY += EVENT_TRACK_HEIGHT;
            }
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
    const clickY = e.clientY - rect.top; // Absolute Y
    const scrollY = event_timelineContainer.scrollTop;

    if (event_state === 'idle') {
        let cursor = 'default';
        // ヘッダーより下の場合のみカーソル判定
        if (x > EVENT_LEFT_PANEL_WIDTH && (clickY - scrollY) > EVENT_HEADER_HEIGHT) {
            const y = clickY;
            let currentY = EVENT_HEADER_HEIGHT;
            for (let layer of event_data.layers) {
                if (y >= currentY && y < currentY + EVENT_TRACK_HEIGHT) {
                    const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                    const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
                    if (Math.abs(x - inX) <= EVENT_LAYER_HANDLE_WIDTH || Math.abs(x - outX) <= EVENT_LAYER_HANDLE_WIDTH) cursor = 'ew-resize';
                    else if (x > inX && x < outX) cursor = 'move';
                }
                currentY += EVENT_TRACK_HEIGHT + (layer.expanded ? Object.keys(layer.tracks).length * EVENT_TRACK_HEIGHT : 0);
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
        if (t.prop === 'motion') return; // 文字列プロパティはスクラブ不可
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
        let time = event_snapTime(Math.max(0, event_viewStartTime + (x - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec));
        event_dragTarget.obj.time = time;
        event_draw();
    } else if (event_state === 'drag-layer-order') {
        const y = clickY; // Use absolute Y
        let curY = EVENT_HEADER_HEIGHT;
        let targetIdx = -1;
        for (let i = 0; i < event_data.layers.length; i++) {
            const h = EVENT_TRACK_HEIGHT + (event_data.layers[i].expanded ? Object.keys(event_data.layers[i].tracks).length * EVENT_TRACK_HEIGHT : 0);
            if (y >= curY && y < curY + h) { targetIdx = i; break; }
            curY += h;
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
    } else if (event_state === 'drag-layer-in' || event_state === 'drag-layer-out' || event_state === 'drag-layer-move') {
        const dt = (e.clientX - event_dragStartPos.x) / event_pixelsPerSec;
        const layer = event_data.layers[event_dragTarget.layerIdx];
        if (event_state === 'drag-layer-in') layer.inPoint = Math.min(event_snapTime(layer.inPoint + dt), layer.outPoint);
        else if (event_state === 'drag-layer-out') layer.outPoint = Math.max(event_snapTime(layer.outPoint + dt), layer.inPoint);
        else {
            layer.inPoint += dt; layer.outPoint += dt;
            Object.values(layer.tracks).forEach(tr => tr.keys && tr.keys.forEach(k => k.time += dt));
        }
        event_dragStartPos = { x: e.clientX, y: e.clientY };
        event_draw();
    }
};

window.event_onGlobalMouseUp = function (e) {
    if (event_state === 'drag-pickwhip') {
        const rect = event_canvasTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top; // Absolute Y
        let curY = EVENT_HEADER_HEIGHT;
        let targetIdx = -1;
        for (let i = 0; i < event_data.layers.length; i++) {
            if (y >= curY && y < curY + EVENT_TRACK_HEIGHT && x < EVENT_LEFT_PANEL_WIDTH) { targetIdx = i; break; }
            curY += EVENT_TRACK_HEIGHT + (event_data.layers[i].expanded ? Object.keys(event_data.layers[i].tracks).length * EVENT_TRACK_HEIGHT : 0);
        }
        if (targetIdx !== -1 && targetIdx !== event_pickWhipSourceLayerIdx) {
            event_pushHistory(); event_setLayerParent(event_pickWhipSourceLayerIdx, event_data.layers[targetIdx].id);
        }
        event_pickWhipSourceLayerIdx = -1;
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
        if (event_currentTime < layer.inPoint || event_currentTime > layer.outPoint || !layer.imgObj) continue;
        const pos = event_getInterpolatedValue(i, "position", event_currentTime);
        const iw = layer.imgObj.naturalWidth || 64, ih = layer.imgObj.naturalHeight || 64;
        if (mx >= pos.x - iw / 2 && mx <= pos.x + iw / 2 && my >= pos.y - ih / 2 && my <= pos.y + ih / 2) {
            event_pushHistory(); event_selectedLayerIndex = i; event_state = 'drag-preview';
            event_dragStartPos = { x: e.clientX, y: e.clientY };
            event_dragTarget = { layerIdx: i, startX: pos.x, startY: pos.y };
            event_draw(); return;
        }
    }
    event_selectedLayerIndex = -1; event_draw();
};

window.event_onKeyDown = function (e) {
    if (e.target.tagName === 'INPUT') return;
    if (!document.getElementById('mode-event').classList.contains('active')) return;
    if (e.code === 'F9' && event_selectedKey) {
        event_pushHistory(); const k = event_selectedKey.keyObj;
        const s = !(k.easeIn && k.easeOut); k.easeIn = s; k.easeOut = s; event_draw();
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
    // y は absoluteY なので、rect.top + y で正しいビューポートY座標になる
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
    input.onkeydown = (e) => { if (e.key === 'Enter') commit(); };
    input.onblur = commit;
    document.body.appendChild(input);
    input.focus();
};

window.event_showParentSelect = function (x, y, childIdx) {
    const select = document.createElement('select');
    select.style.position = 'absolute'; select.style.left = x + 'px'; select.style.top = y + 'px';
    const optNone = document.createElement('option'); optNone.value = ""; optNone.text = "なし";
    select.appendChild(optNone);
    event_data.layers.forEach(l => {
        if (l.id === event_data.layers[childIdx].id) return;
        const opt = document.createElement('option'); opt.value = l.id; opt.text = l.name;
        if (l.id === event_data.layers[childIdx].parent) opt.selected = true;
        select.appendChild(opt);
    });
    select.onchange = () => { event_pushHistory(); event_setLayerParent(childIdx, select.value || null); select.remove(); };
    select.onblur = () => select.remove();
    document.body.appendChild(select); select.focus();
};

window.event_showEnumSelect = function (x, y, initialValue, options, callback) {
    const select = document.createElement('select');
    const rect = event_canvasTimeline.getBoundingClientRect();
    select.style.position = 'absolute'; select.style.left = (rect.left + x) + 'px'; select.style.top = (rect.top + y) + 'px';
    options.forEach(o => {
        const opt = document.createElement('option'); opt.value = o; opt.text = o;
        if (o === initialValue) opt.selected = true;
        select.appendChild(opt);
    });
    select.onchange = () => { callback(select.value); select.remove(); };
    select.onblur = () => select.remove();
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
        layer.tracks[tn] = { type: 'float', label: 'FX: Blur', min: 0, max: 100, step: 0.1, keys: [{ time: event_currentTime, value: 5, interpolation: 'Linear' }] };
        layer.expanded = true;
    }
    event_draw();
};