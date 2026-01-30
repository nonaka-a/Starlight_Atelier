/**
 * イベントエディタ: 描画関連
 * Step 15: 選択色変更、時間表示変更、ゴミ箱ボタン
 */

// 値フォーマット
function event_formatValue(val, type) {
    if (type === 'vector2') return `${val.x.toFixed(1)}, ${val.y.toFixed(1)}`;
    else if (type === 'rotation') {
        const rev = Math.floor(val / 360);
        const deg = Math.floor(val % 360);
        return `${rev}+${deg}°`;
    } else return val.toFixed(1);
}

// プレビューズーム計算
window.event_calcPreviewScale = function() {
    if (event_previewZoomMode === 'fit') {
        const container = document.getElementById('event-preview-container');
        if (!container) return;
        const cw = container.clientWidth - 20;
        const ch = container.clientHeight - 40;
        const compW = event_data.composition.width;
        const compH = event_data.composition.height;
        const scaleW = cw / compW;
        const scaleH = ch / compH;
        event_previewScale = Math.min(scaleW, scaleH);
    } else {
        event_previewScale = event_previewZoomMode;
    }
};

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
    
    sel.value = event_previewZoomMode.toString(); 
    text.textContent = val + '%';
    event_draw();
};

// --- 描画メイン ---
window.event_draw = function () {
    if (!event_canvasTimeline || !event_canvasPreview) return;
    
    const zoomInput = document.getElementById('event-zoom');
    if (zoomInput) {
        event_pixelsPerSec = parseInt(zoomInput.value);
    }

    const drawTime = event_snapTime(event_currentTime);

    // --- Timeline Canvas リサイズ ---
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
    event_calcPreviewScale();
    const scale = event_previewScale;
    
    const pW = event_data.composition.width * scale;
    const pH = event_data.composition.height * scale;
    if (event_canvasPreview.width !== pW || event_canvasPreview.height !== pH) {
        event_canvasPreview.width = pW;
        event_canvasPreview.height = pH;
    }

    event_ctxPreview.fillStyle = '#000';
    event_ctxPreview.fillRect(0, 0, pW, pH);

    event_ctxPreview.save();
    event_ctxPreview.scale(scale, scale);

    // コンポジション枠
    event_ctxPreview.strokeStyle = '#333';
    event_ctxPreview.lineWidth = 1;
    event_ctxPreview.beginPath();
    event_ctxPreview.moveTo(event_data.composition.width / 2, 0);
    event_ctxPreview.lineTo(event_data.composition.width / 2, event_data.composition.height);
    event_ctxPreview.moveTo(0, event_data.composition.height / 2);
    event_ctxPreview.lineTo(event_data.composition.width, event_data.composition.height / 2);
    event_ctxPreview.stroke();

    // レイヤー描画 (後ろから前へ = 配列の末尾から先頭へ)
    for (let i = event_data.layers.length - 1; i >= 0; i--) {
        const idx = i;
        const layer = event_data.layers[idx];
        if (drawTime < layer.inPoint || drawTime > layer.outPoint) continue;

        const pos = event_getInterpolatedValue(idx, "position", drawTime);
        const lScale = event_getInterpolatedValue(idx, "scale", drawTime);
        const rot = event_getInterpolatedValue(idx, "rotation", drawTime);
        const opacity = event_getInterpolatedValue(idx, "opacity", drawTime);

        event_ctxPreview.save();
        event_ctxPreview.translate(pos.x, pos.y);
        event_ctxPreview.rotate(rot * Math.PI / 180);
        
        const finalScale = lScale / 100;
        event_ctxPreview.scale(finalScale, finalScale);
        event_ctxPreview.globalAlpha = opacity / 100;

        if (layer.imgObj && layer.imgObj.complete && layer.imgObj.naturalWidth > 0) {
            const iw = layer.imgObj.naturalWidth;
            const ih = layer.imgObj.naturalHeight;
            event_ctxPreview.drawImage(layer.imgObj, -iw/2, -ih/2);
            if (event_selectedLayerIndex === idx) {
                event_ctxPreview.strokeStyle = '#0ff';
                event_ctxPreview.lineWidth = 2 / finalScale;
                event_ctxPreview.strokeRect(-iw/2, -ih/2, iw, ih);
            }
        } else {
            event_ctxPreview.fillStyle = '#48f';
            event_ctxPreview.fillRect(-32, -32, 64, 64);
        }
        event_ctxPreview.restore();
    }
    event_ctxPreview.restore();

    // --- タイムライン描画 ---
    
    // ヘッダー背景
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
    
    ctx.fillStyle = '#111';
    ctx.fillRect(compDurationX, 0, w - compDurationX, h);

    // グリッド
    for (let t = Math.floor(event_viewStartTime); t <= viewEndTime; t += secStep) {
        if (t < 0) continue;
        if (t > event_data.composition.duration) break;

        const x = EVENT_LEFT_PANEL_WIDTH + (t - event_viewStartTime) * event_pixelsPerSec;
        ctx.strokeStyle = '#444'; ctx.beginPath(); ctx.moveTo(x, EVENT_HEADER_HEIGHT); ctx.lineTo(x, h); ctx.stroke();
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, EVENT_HEADER_HEIGHT); ctx.stroke();
        if (Math.floor(t) === t) {
            ctx.fillStyle = '#aaa';
            ctx.fillText(t + 's', x + 3, 14);
        }
    }
    
    // 尺終了ライン
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(compDurationX, 0); ctx.lineTo(compDurationX, h); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.restore();

    // トラック (上から順に描画)
    let currentY = EVENT_HEADER_HEIGHT;
    event_data.layers.forEach((layer, layerIdx) => {
        // レイヤー行
        ctx.fillStyle = (layerIdx === event_selectedLayerIndex) ? '#556' : '#3a3a3a'; // 選択色変更
        ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);
        
        // 選択枠
        if (layerIdx === event_selectedLayerIndex) {
            ctx.strokeStyle = '#88a';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, currentY + 1, EVENT_LEFT_PANEL_WIDTH - 2, EVENT_TRACK_HEIGHT - 2);
            ctx.lineWidth = 1;
        } else {
            ctx.strokeStyle = '#222';
            ctx.strokeRect(0, currentY, w, EVENT_TRACK_HEIGHT);
        }
        
        // 展開マーク
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        const expandMark = layer.expanded ? "▼" : "▶";
        ctx.fillText(expandMark, 5, currentY + 18);

        // サムネイル
        const iconSize = 20;
        const iconX = 25;
        const iconY = currentY + 5;
        if (layer.imgObj && layer.imgObj.complete) {
            try {
                const aspect = layer.imgObj.width / layer.imgObj.height;
                let dw = iconSize;
                let dh = iconSize;
                if (aspect > 1) dh = iconSize / aspect;
                else dw = iconSize * aspect;
                ctx.drawImage(layer.imgObj, iconX + (iconSize-dw)/2, iconY + (iconSize-dh)/2, dw, dh);
            } catch(e) {
                ctx.fillText("🖼️", iconX, currentY + 20);
            }
        } else {
            ctx.fillText("📄", iconX, currentY + 20);
        }
        
        // レイヤー名
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${layer.name}`, iconX + iconSize + 5, currentY + 20);

        // ゴミ箱ボタン
        const trashX = EVENT_LEFT_PANEL_WIDTH - 25;
        const trashY = currentY + 5;
        ctx.fillStyle = '#d44';
        ctx.fillRect(trashX, trashY, 20, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText("×", trashX + 6, trashY + 14);
        
        // レイヤーバー
        const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
        const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
        const barX = Math.max(EVENT_LEFT_PANEL_WIDTH, inX);
        const barW = Math.max(0, outX - barX);
        
        ctx.save();
        ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, h); ctx.clip();
        if (barW > 0) {
            ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
            ctx.fillRect(barX, currentY + 4, barW, EVENT_TRACK_HEIGHT - 8);
            ctx.fillStyle = 'rgba(100, 150, 255, 0.8)';
            if (inX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(inX, currentY+4, EVENT_LAYER_HANDLE_WIDTH, EVENT_TRACK_HEIGHT-8);
            if (outX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(outX-EVENT_LAYER_HANDLE_WIDTH, currentY+4, EVENT_LAYER_HANDLE_WIDTH, EVENT_TRACK_HEIGHT-8);
        }
        ctx.restore();
        currentY += EVENT_TRACK_HEIGHT;

        // プロパティトラック
        if (layer.expanded) {
            Object.keys(layer.tracks).forEach(propName => {
                const track = layer.tracks[propName];
                ctx.fillStyle = '#2d2d2d'; ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);
                ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.moveTo(0, currentY + EVENT_TRACK_HEIGHT); ctx.lineTo(w, currentY + EVENT_TRACK_HEIGHT); ctx.stroke();
                ctx.fillStyle = '#ddd'; ctx.font = '11px sans-serif'; ctx.fillText(track.label, 30, currentY + 19);

                const val = event_getInterpolatedValue(layerIdx, propName, drawTime);
                const valText = event_formatValue(val, track.type);
                const valX = EVENT_LEFT_PANEL_WIDTH - 40;
                
                ctx.fillStyle = '#3a3a3a'; ctx.fillRect(valX - EVENT_VALUE_CLICK_WIDTH, currentY + 4, EVENT_VALUE_CLICK_WIDTH, EVENT_TRACK_HEIGHT - 8);
                ctx.fillStyle = '#8f8'; ctx.textAlign = 'right'; ctx.fillText(valText, valX, currentY + 19); ctx.textAlign = 'left';

                const btnX = EVENT_LEFT_PANEL_WIDTH - 20;
                const btnY = currentY + EVENT_TRACK_HEIGHT / 2;
                ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(btnX, btnY - 5); ctx.lineTo(btnX + 5, btnY); ctx.lineTo(btnX, btnY + 5); ctx.lineTo(btnX - 5, btnY); ctx.closePath(); ctx.stroke();
                const hasKey = track.keys.some(k => Math.abs(k.time - drawTime) < 0.001);
                if (hasKey) { ctx.fillStyle = '#48f'; ctx.fill(); }

                ctx.save();
                ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, currentY, w - EVENT_LEFT_PANEL_WIDTH, EVENT_TRACK_HEIGHT); ctx.clip();
                track.keys.forEach(key => {
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

    const headX = EVENT_LEFT_PANEL_WIDTH + (drawTime - event_viewStartTime) * event_pixelsPerSec;
    if (headX >= EVENT_LEFT_PANEL_WIDTH && headX <= w) {
        ctx.strokeStyle = '#f00'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(headX, EVENT_HEADER_HEIGHT); ctx.lineTo(headX, h); ctx.stroke();
        ctx.fillStyle = '#f00';
        ctx.beginPath(); ctx.moveTo(headX, EVENT_HEADER_HEIGHT); ctx.lineTo(headX - 6, EVENT_HEADER_HEIGHT - 10); ctx.lineTo(headX + 6, EVENT_HEADER_HEIGHT - 10); ctx.fill();
    }

    // パネル蓋 & 時間表示 (秒 + フレーム)
    ctx.clearRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.fillStyle = '#444'; ctx.fillRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.strokeStyle = '#555'; ctx.strokeRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    
    ctx.fillStyle = '#48f';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    
    const fps = event_data.composition.fps || 30;
    const sec = Math.floor(event_currentTime);
    // 0.001足して浮動小数点誤差対策
    const frame = Math.floor(((event_currentTime + 0.0001) % 1) * fps);
    const timeText = `${event_currentTime.toFixed(2)}s (${sec}s ${frame}f)`;
    ctx.fillText(timeText, 10, 18);
};