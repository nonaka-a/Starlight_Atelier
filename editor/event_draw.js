/**
 * イベントエディタ: 描画関連
 * Step 30 (Fix): フレーム数表示の復活
 */

// UI定数のオーバーライド
Object.assign(UI_LAYOUT, {
    VAL_VEC_X_RIGHT: 175,
    VAL_VEC_Y_RIGHT: 100,
    AUDIO_TRACK_SEL_RIGHT: 180,
    AUDIO_TRACK_SEL_WIDTH: 50
});

// 値フォーマット
function event_formatValue(val, type) {
    if (type === 'rotation') {
        const rev = Math.floor(val / 360);
        const deg = Math.floor(val % 360);
        return `${rev}x ${deg}°`;
    }
    if (type === 'string') return val;
    if (typeof val === 'number') return val.toFixed(1);
    if (val && typeof val === 'object') return "[Vec]";
    return val;
}

// プレビューズーム計算
window.event_calcPreviewScale = function () {
    if (event_previewZoomMode === 'fit') {
        const container = document.getElementById('event-preview-container');
        if (!container) return;
        const cw = container.clientWidth - 20;
        const ch = container.clientHeight - 40;
        const compW = event_data.composition.width || 1000;
        const compH = event_data.composition.height || 600;
        const scaleW = cw / compW;
        const scaleH = ch / compH;
        event_previewScale = (compW > 0 && compH > 0) ? Math.min(scaleW, scaleH) : 1.0;
    } else {
        event_previewScale = event_previewZoomMode;
    }
};

window.event_updatePreviewZoomUI = function () {
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

window.event_onPreviewZoomSlider = function () {
    const slider = document.getElementById('event-preview-zoom-slider');
    const text = document.getElementById('event-preview-zoom-text');
    const sel = document.getElementById('event-preview-zoom-mode');

    const val = parseInt(slider.value);
    event_previewZoomMode = val / 100;

    sel.value = event_previewZoomMode.toString();
    text.textContent = val + '%';
    event_draw();
};

// --- 親子関係の再帰的Transform適用 ---
function event_applyLayerTransform(ctx, layerIdx, time) {
    const layer = event_data.layers[layerIdx];

    if (layer.parent) {
        const parentIdx = event_data.layers.findIndex(l => l.id === layer.parent);
        if (parentIdx !== -1) {
            event_applyLayerTransform(ctx, parentIdx, time);
        }
    }

    const pos = event_getInterpolatedValue(layerIdx, "position", time);
    const lScale = event_getInterpolatedValue(layerIdx, "scale", time);
    const rot = event_getInterpolatedValue(layerIdx, "rotation", time);

    ctx.translate(pos.x, pos.y);
    ctx.rotate(rot * Math.PI / 180);

    const sx = lScale.x / 100;
    const sy = lScale.y / 100;
    ctx.scale(sx, sy);

}

let event_offscreenCanvas = null;
let event_offscreenCtx = null;

// 厳密なチェック関数
function event_isValidDrawable(obj) {
    if (!obj) return false;
    try {
        if (obj instanceof HTMLImageElement) {
            return obj.complete && obj.naturalWidth > 0 && obj.naturalHeight > 0;
        }
        if (obj instanceof HTMLCanvasElement || obj instanceof OffscreenCanvas) {
            return obj.width > 0 && obj.height > 0;
        }
        if (typeof ImageBitmap !== 'undefined' && obj instanceof ImageBitmap) {
            return obj.width > 0 && obj.height > 0;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// --- 描画メイン ---
window.event_draw = function () {
    if (!event_canvasTimeline || !event_canvasPreview) return;

    if (!event_offscreenCanvas) {
        event_offscreenCanvas = document.createElement('canvas');
        event_offscreenCtx = event_offscreenCanvas.getContext('2d');
    }

    const zoomInput = document.getElementById('event-zoom');
    if (zoomInput) {
        event_pixelsPerSec = parseInt(zoomInput.value);
    }

    const scrollY = event_timelineContainer.scrollTop;
    const scrollX = event_timelineContainer.scrollLeft;
    event_viewStartTime = scrollX / event_pixelsPerSec;

    const drawTime = event_snapTime(event_currentTime);

    // --- コンテンツ高さ計算 (仮想スクロール用) ---
    let totalTracksHeight = 0;
    event_data.layers.forEach(l => {
        if (event_audioCompactMode && l.type === 'audio') return;
        totalTracksHeight += EVENT_TRACK_HEIGHT;
        if (l.expanded) totalTracksHeight += Object.keys(l.tracks).length * EVENT_TRACK_HEIGHT;
    });
    const audioAreaHeight = event_audioCompactMode ? (4 * EVENT_TRACK_HEIGHT + 20) : 0;

    const containerH = event_timelineContainer.clientHeight;
    const containerW = event_timelineContainer.clientWidth;
    const totalContentHeight = Math.max(containerH, EVENT_HEADER_HEIGHT + totalTracksHeight + audioAreaHeight + 100);
    const totalContentWidth = EVENT_LEFT_PANEL_WIDTH + (event_data.composition.duration || 10) * event_pixelsPerSec + 400;

    let scrollDummy = document.getElementById('event-timeline-scroll-dummy');
    if (!scrollDummy) {
        scrollDummy = document.createElement('div');
        scrollDummy.id = 'event-timeline-scroll-dummy';
        scrollDummy.style.position = 'absolute';
        scrollDummy.style.top = '0';
        scrollDummy.style.left = '0';
        scrollDummy.style.zIndex = '0';
        scrollDummy.style.pointerEvents = 'none';
        event_timelineContainer.appendChild(scrollDummy);
        event_canvasTimeline.style.position = 'sticky';
        event_canvasTimeline.style.left = '0';
        event_canvasTimeline.style.top = '0';
        event_canvasTimeline.style.zIndex = '1';
        event_timelineContainer.onscroll = () => window.event_draw();
    }
    scrollDummy.style.width = totalContentWidth + 'px';
    scrollDummy.style.height = totalContentHeight + 'px';

    if (event_canvasTimeline.width !== containerW || event_canvasTimeline.height !== containerH) {
        event_canvasTimeline.width = containerW;
        event_canvasTimeline.height = containerH;
    }

    const ctx = event_ctxTimeline;
    const w = event_canvasTimeline.width;
    const h = event_canvasTimeline.height;

    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);

    window.event_drawPreview(drawTime);
    window.event_drawTimelineBackground(ctx, w, h);
    let currentY = EVENT_HEADER_HEIGHT - scrollY;
    currentY = window.event_drawTimelineLayers(ctx, w, h, currentY, drawTime);
    if (event_audioCompactMode) {
        currentY = window.event_drawTimelineAudioCompact(ctx, w, h, currentY);
    }
    window.event_drawTimelineHeaderAndOverlays(ctx, w, h, drawTime, scrollY);
};

window.event_drawPreview = function(drawTime) {
    // --- プレビュー描画 ---
    event_calcPreviewScale();
    const scale = event_previewScale;
    const pW = event_data.composition.width * scale;
    const pH = event_data.composition.height * scale;
    if (event_canvasPreview.width !== pW || event_canvasPreview.height !== pH) {
        event_canvasPreview.width = pW; event_canvasPreview.height = pH;
    }
    if (event_offscreenCanvas.width !== event_data.composition.width || event_offscreenCanvas.height !== event_data.composition.height) {
        event_offscreenCanvas.width = event_data.composition.width || 100; event_offscreenCanvas.height = event_data.composition.height || 100;
    }
    event_ctxPreview.fillStyle = '#000'; event_ctxPreview.fillRect(0, 0, pW, pH);
    event_ctxPreview.save(); event_ctxPreview.scale(scale, scale);
    const osCtx = event_offscreenCtx; const cw = event_data.composition.width; const ch = event_data.composition.height;

    for (let i = event_data.layers.length - 1; i >= 0; i--) {
        const idx = i;
        const layer = event_data.layers[idx];
        if (drawTime < layer.inPoint || drawTime > layer.outPoint || layer.type === 'audio' || layer.visible === false) continue;

        osCtx.clearRect(0, 0, cw, ch); osCtx.save();
        event_applyLayerTransform(osCtx, idx, drawTime);

        let drawW = 0, drawH = 0, drawAnchorX = 0, drawAnchorY = 0;

        if (layer.type === 'text') {
            const text = layer.text || "";
            const fontSize = layer.fontSize || 40;
            const fontFamily = layer.fontFamily || 'sans-serif';
            const color = layer.color || '#ffffff';
            const strokeColor = layer.strokeColor || '#000000';
            const strokeWidth = layer.strokeWidth || 0;
            const shadowOpacity = layer.shadowOpacity || 0;

            const typewriter = event_getInterpolatedValue(idx, "typewriter", drawTime);
            const letterSpacing = event_getInterpolatedValue(idx, "letterSpacing", drawTime);

            osCtx.font = `bold ${fontSize}px ${fontFamily}`;
            osCtx.textAlign = "center";
            osCtx.textBaseline = "middle";
            const lines = text.split('\n');
            const lineHeight = fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;
            let startY = -(totalHeight / 2) + (lineHeight / 2);
            const totalChars = text.replace(/\n/g, '').length;
            const visibleCharCount = Math.floor(totalChars * (Math.max(0, Math.min(100, typewriter)) / 100));
            let charCounter = 0;

            lines.forEach((line, lineIdx) => {
                let lineWidth = 0;
                const chars = line.split('');
                const charWidths = chars.map(c => { const w = osCtx.measureText(c).width; lineWidth += w + letterSpacing; return w; });
                if (chars.length > 0) lineWidth -= letterSpacing;
                let currentX = -lineWidth / 2;
                chars.forEach((char, charIdx) => {
                    if (charCounter < visibleCharCount) {
                        const cw = charWidths[charIdx];
                        const drawX = currentX + cw / 2;
                        const drawY = startY + lineIdx * lineHeight;
                        if (shadowOpacity > 0) {
                            osCtx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity / 100})`;
                            osCtx.shadowBlur = fontSize * 0.15;
                            osCtx.shadowOffsetX = 0; osCtx.shadowOffsetY = 0;
                        } else { osCtx.shadowColor = 'transparent'; }
                        if (strokeWidth > 0) {
                            osCtx.lineWidth = strokeWidth; osCtx.strokeStyle = strokeColor; osCtx.lineJoin = 'round';
                            osCtx.strokeText(char, drawX, drawY);
                            osCtx.shadowColor = 'transparent';
                        }
                        osCtx.fillStyle = color; osCtx.fillText(char, drawX, drawY);
                        currentX += cw + letterSpacing; charCounter++;
                    }
                });
            });
            osCtx.shadowColor = 'transparent';
            let maxW = 0; lines.forEach(l => { const w = osCtx.measureText(l).width + (l.length - 1) * letterSpacing; if (w > maxW) maxW = w; });
            drawW = maxW + strokeWidth; drawH = totalHeight + strokeWidth; drawAnchorX = -drawW / 2; drawAnchorY = -drawH / 2;

        } else if (layer.type === 'solid') {
            const color = layer.color || '#ffffff';
            osCtx.fillStyle = color;
            if (layer.shape === 'circle') {
                const r = Math.min(cw, ch) / 2;
                osCtx.beginPath();
                osCtx.arc(0, 0, r, 0, Math.PI * 2);
                osCtx.fill();
                drawW = r * 2; drawH = r * 2; drawAnchorX = -r; drawAnchorY = -r;
            } else {
                // rect (default screen fill)
                osCtx.fillRect(-cw / 2, -ch / 2, cw, ch);
                drawW = cw; drawH = ch; drawAnchorX = -cw / 2; drawAnchorY = -ch / 2;
            }
        } else if (layer.type === 'animated_layer') {
            const asset = event_findAssetById(layer.animAssetId);
            const currentAnimId = event_getInterpolatedValue(idx, "motion", drawTime);
            if (asset && asset.data[currentAnimId]) {
                const anim = asset.data[currentAnimId];
                const elapsed = drawTime - layer.startTime;
                if (elapsed >= 0 && anim.frames.length > 0) {
                    const frameIdx = Math.floor(elapsed * anim.fps);
                    const actualIdx = layer.loop ? (frameIdx % anim.frames.length) : Math.min(frameIdx, anim.frames.length - 1);
                    const frame = anim.frames[actualIdx];
                    const imgToDraw = (event_isValidDrawable(layer.imgObj) && layer.imgObj.complete) ? layer.imgObj : asset.imgObj;
                    if (frame && event_isValidDrawable(imgToDraw)) {
                        try {
                            osCtx.drawImage(imgToDraw, frame.x, frame.y, frame.w, frame.h, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
                            drawW = frame.w; drawH = frame.h; drawAnchorX = -frame.w / 2; drawAnchorY = -frame.h / 2;
                        } catch (e) { console.warn("Anim Draw Error", e); }
                    }
                }
            }
        } else if (event_isValidDrawable(layer.imgObj)) {
            try {
                const iw = layer.imgObj.naturalWidth; const ih = layer.imgObj.naturalHeight;
                osCtx.drawImage(layer.imgObj, -iw / 2, -ih / 2);
                drawW = iw; drawH = ih; drawAnchorX = -iw / 2; drawAnchorY = -ih / 2;
            } catch (e) { console.warn("Img Draw Error", e); }
        } else {
            osCtx.fillStyle = '#48f'; osCtx.fillRect(-32, -32, 64, 64);
            drawW = 64; drawH = 64; drawAnchorX = -32; drawAnchorY = -32;
        }
        osCtx.restore();

        event_ctxPreview.save();
        event_ctxPreview.globalAlpha = event_getInterpolatedValue(idx, "opacity", drawTime) / 100;
        let filterStr = "";
        if (layer.effects) layer.effects.forEach(fx => { if (fx.type === 'blur') filterStr += ` blur(${event_getInterpolatedValue(idx, fx.trackName, drawTime)}px)`; });
        event_ctxPreview.filter = filterStr.trim() || 'none';

        if (event_isValidDrawable(event_offscreenCanvas)) {
            // ブレンドモード適用 (OffscreenCanvasをMainCanvasに描画するタイミングで行う)
            event_ctxPreview.globalCompositeOperation = layer.blendMode || 'source-over';
            try {
                event_ctxPreview.drawImage(event_offscreenCanvas, 0, 0);
            } catch (e) { }
        }
        event_ctxPreview.filter = 'none';

        const isLayerSelected = (idx === event_selectedLayerIndex || event_selectedLayerIndices.includes(idx));
        if (isLayerSelected) {
            event_applyLayerTransform(event_ctxPreview, idx, drawTime);
            event_ctxPreview.strokeStyle = idx === event_selectedLayerIndex ? '#0ff' : '#0aa';
            event_ctxPreview.lineWidth = 2; // シンプルに固定線幅で描画（スケーリングの影響を受けるが、簡易化のため）
            // event_applyLayerTransformで既にtransformされているので、
            // アンカー位置とサイズを使って枠線を描画する
            event_ctxPreview.strokeRect(drawAnchorX, drawAnchorY, drawW, drawH);
        }
        event_ctxPreview.restore();
    }
    // ループ終了後に合成モードを初期値に戻す
    event_ctxPreview.globalCompositeOperation = 'source-over';
    event_ctxPreview.restore();

};

window.event_drawTimelineBackground = function(ctx, w, h) {
    const viewEndTime = event_viewStartTime + ((w - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
    const secStep = event_pixelsPerSec > 100 ? 0.5 : 1.0;
    // --- タイムライン描画 ---

    ctx.save();
    ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, h); ctx.clip();
    const compDurationX = EVENT_LEFT_PANEL_WIDTH + (event_data.composition.duration - event_viewStartTime) * event_pixelsPerSec;
    if (compDurationX < w) { ctx.fillStyle = '#111'; ctx.fillRect(compDurationX, 0, w - compDurationX, h); }
    for (let t = Math.floor(event_viewStartTime); t <= viewEndTime; t += secStep) {
        if (t < 0) continue; if (t > event_data.composition.duration) break;
        const x = EVENT_LEFT_PANEL_WIDTH + (t - event_viewStartTime) * event_pixelsPerSec;
        ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.restore();

};

window.event_drawTimelineLayers = function(ctx, w, h, currentY, drawTime) {
    // --- 通常レイヤー描画ループ ---
    event_data.layers.forEach((layer, layerIdx) => {
        if (event_audioCompactMode && layer.type === 'audio') return;

        const isLayerSelected = (layerIdx === event_selectedLayerIndex || event_selectedLayerIndices.includes(layerIdx));
        const isMainSelected = (layerIdx === event_selectedLayerIndex);
        const isVisible = (currentY + EVENT_TRACK_HEIGHT > EVENT_HEADER_HEIGHT && currentY < h);
        if (isVisible) {
            ctx.fillStyle = isMainSelected ? '#556' : (isLayerSelected ? '#445' : '#3a3a3a');
            ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);
            if (isLayerSelected) {
                ctx.strokeStyle = isMainSelected ? '#88a' : '#668';
                ctx.lineWidth = 2;
                ctx.strokeRect(1, currentY + 1, EVENT_LEFT_PANEL_WIDTH - 2, EVENT_TRACK_HEIGHT - 2);
                ctx.lineWidth = 1;
            }
            else { ctx.strokeStyle = '#222'; ctx.strokeRect(0, currentY, w, EVENT_TRACK_HEIGHT); }

            ctx.fillStyle = '#aaa'; ctx.font = '10px sans-serif'; ctx.fillText(layer.expanded ? "▼" : "▶", 5, currentY + 18);

            // 👀ボタン (左側)
            const eyeX = 20;
            if (layer.visible !== false) {
                ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText("👀", eyeX + 8, currentY + 20);
            }

            // 🔐ボタン (左側)
            const lockX = 40;
            if (layer.locked) {
                ctx.fillStyle = '#f84'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText("🔒", lockX + 8, currentY + 20);
            }
            ctx.textAlign = 'left';

            ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(layer.name, 65, currentY + 20);

            const pickX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PICK_RIGHT;
            ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.arc(pickX + 8, currentY + 15, 6, 0, Math.PI * 2); ctx.stroke();

            const parentX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PARENT_RIGHT;
            const parentW = UI_LAYOUT.PARENT_RIGHT - UI_LAYOUT.PICK_RIGHT - 5;
            ctx.fillStyle = '#222'; ctx.fillRect(parentX, currentY + 4, parentW, EVENT_TRACK_HEIGHT - 8);

            // 親レイヤー名の表示
            let parentLabel = "なし";
            if (layer.parent) {
                const p = event_data.layers.find(l => l.id === layer.parent);
                if (p) parentLabel = p.name;
                else parentLabel = "?";
            }
            ctx.fillStyle = '#ccc';
            let dispParent = parentLabel;
            const maxPW = parentW - 10;
            if (ctx.measureText(dispParent).width > maxPW) {
                while (ctx.measureText(dispParent + '..').width > maxPW && dispParent.length > 0) dispParent = dispParent.slice(0, -1);
                dispParent += '..';
            }
            ctx.fillText(dispParent, parentX + 4, currentY + 18);

            // ブレンドモードUI
            const blendX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.BLEND_RIGHT;
            ctx.fillStyle = '#222'; ctx.fillRect(blendX, currentY + 4, 18, 22);
            ctx.strokeStyle = '#555'; ctx.strokeRect(blendX, currentY + 4, 18, 22);

            let blendChar = 'N'; // Normal
            if (layer.blendMode === 'multiply') blendChar = 'M';
            else if (layer.blendMode === 'screen') blendChar = 'S';
            else if (layer.blendMode === 'overlay') blendChar = 'O';

            ctx.fillStyle = (blendChar === 'N') ? '#888' : '#fff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(blendChar, blendX + 9, currentY + 19);
            ctx.textAlign = 'left';

            const trashX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.TRASH_RIGHT;
            ctx.fillStyle = '#d44'; ctx.fillRect(trashX, currentY + 5, 20, 20); ctx.fillStyle = '#fff'; ctx.fillText("×", trashX + 6, currentY + 19);

            const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
            const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
            const barX = Math.max(EVENT_LEFT_PANEL_WIDTH, inX);
            const barW = Math.max(0, outX - barX);

            if (barW > 0) {
                let r = 100, g = 150, b = 255;
                if (layer.type === 'animated_layer') { r = 230; g = 200; b = 20; } else if (layer.type === 'text') { r = 255; g = 80; b = 80; } else if (layer.type === 'audio') { r = 80; g = 200; b = 80; } else if (layer.type === 'solid') { r = 80; g = 120; b = 255; }
                ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
                ctx.fillRect(barX, currentY + 4, barW, EVENT_TRACK_HEIGHT - 8);

                if (layer.type === 'audio') {
                    const asset = event_findAssetById(layer.assetId);
                    if (asset && asset.waveform) {
                        const startT = layer.startTime || 0;
                        const wfX = EVENT_LEFT_PANEL_WIDTH + (startT - event_viewStartTime) * event_pixelsPerSec;
                        ctx.save(); ctx.beginPath(); ctx.rect(barX, currentY + 4, barW, EVENT_TRACK_HEIGHT - 8); ctx.clip();
                        ctx.globalAlpha = 0.8;
                        if (event_isValidDrawable(asset.waveform)) {
                            try {
                                ctx.drawImage(asset.waveform, wfX, currentY + 4, asset.duration * event_pixelsPerSec, EVENT_TRACK_HEIGHT - 8);
                            } catch (e) { console.warn("Waveform draw error", e); }
                        }
                        ctx.restore();
                    }
                }
                ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
                if (inX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(inX, currentY + 4, 6, EVENT_TRACK_HEIGHT - 8);
                if (outX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(outX - 6, currentY + 4, 6, EVENT_TRACK_HEIGHT - 8);
            }
        }
        currentY += EVENT_TRACK_HEIGHT;

        if (layer.expanded) {
            Object.keys(layer.tracks).forEach(propName => {
                const track = layer.tracks[propName];
                if (currentY + EVENT_TRACK_HEIGHT > EVENT_HEADER_HEIGHT && currentY < h) {
                    ctx.fillStyle = '#2d2d2d'; ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);
                    ctx.strokeStyle = '#222'; ctx.strokeRect(0, currentY, w, EVENT_TRACK_HEIGHT);
                    ctx.fillStyle = '#ddd'; ctx.fillText(track.label, 30, currentY + 19);

                    if (propName.startsWith('fx_')) {
                        const delBtnX = 15; const delBtnY = currentY + 10;
                        ctx.fillStyle = '#d44'; ctx.fillRect(delBtnX, delBtnY, 12, 12);
                        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('×', delBtnX + 2, delBtnY + 9);
                    }

                    if (layer.type === 'audio' && propName === 'volume') {
                        const trX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.AUDIO_TRACK_SEL_RIGHT;
                        const currentTrack = (layer.trackIdx !== undefined ? layer.trackIdx : 0) + 1;
                        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(trX, currentY + 4, UI_LAYOUT.AUDIO_TRACK_SEL_WIDTH, 22);
                        ctx.strokeStyle = '#555'; ctx.strokeRect(trX, currentY + 4, UI_LAYOUT.AUDIO_TRACK_SEL_WIDTH, 22);
                        ctx.fillStyle = '#aaa'; ctx.textAlign = 'center';
                        ctx.fillText("Tr: " + currentTrack + " ▼", trX + UI_LAYOUT.AUDIO_TRACK_SEL_WIDTH / 2, currentY + 19);
                        ctx.textAlign = 'left';
                    }

                    const val = event_getInterpolatedValue(layerIdx, propName, drawTime);
                    if (track.type === 'vector2') {
                        const vx = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.VAL_VEC_X_RIGHT;
                        ctx.fillStyle = '#3a2a2a'; ctx.fillRect(vx, currentY + 4, UI_LAYOUT.VAL_VEC_WIDTH, 22);
                        ctx.fillStyle = '#f88'; ctx.textAlign = 'right'; ctx.fillText(Math.abs(val.x).toFixed(1), vx + UI_LAYOUT.VAL_VEC_WIDTH - 4, currentY + 19);
                        const vy = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.VAL_VEC_Y_RIGHT;
                        ctx.fillStyle = '#2a3a2a'; ctx.fillRect(vy, currentY + 4, UI_LAYOUT.VAL_VEC_WIDTH, 22);
                        ctx.fillStyle = '#8f8'; ctx.fillText(Math.abs(val.y).toFixed(1), vy + UI_LAYOUT.VAL_VEC_WIDTH - 4, currentY + 19);
                        ctx.textAlign = 'left';
                        if (propName === 'scale') {
                            const checkXStart = EVENT_LEFT_PANEL_WIDTH - 220;
                            ctx.fillStyle = (val.x < 0) ? '#0ff' : '#444'; ctx.fillRect(checkXStart, currentY + 8, 12, 12);
                            ctx.strokeStyle = '#888'; ctx.strokeRect(checkXStart, currentY + 8, 12, 12);
                            ctx.fillStyle = '#aaa'; ctx.fillText("x", checkXStart + 15, currentY + 18);
                            ctx.fillStyle = (val.y < 0) ? '#0ff' : '#444'; ctx.fillRect(checkXStart + 30, currentY + 8, 12, 12);
                            ctx.strokeStyle = '#888'; ctx.strokeRect(checkXStart + 30, currentY + 8, 12, 12);
                            ctx.fillStyle = '#aaa'; ctx.fillText("y", checkXStart + 45, currentY + 18);
                            const linkBtnX = EVENT_LEFT_PANEL_WIDTH - 113;
                            ctx.fillStyle = track.linked ? '#666' : '#444'; ctx.fillRect(linkBtnX, currentY + 8, 10, 12);
                            ctx.strokeStyle = '#888'; ctx.strokeRect(linkBtnX, currentY + 8, 10, 12);
                            ctx.fillStyle = track.linked ? '#fff' : '#888'; ctx.fillText(track.linked ? "∞" : "-", linkBtnX + 1, currentY + 17);
                        }
                    } else {
                        const vx = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.VAL_SINGLE_RIGHT;
                        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(vx, currentY + 4, UI_LAYOUT.VAL_SINGLE_WIDTH, 22);
                        ctx.fillStyle = '#eee'; ctx.textAlign = 'right'; ctx.fillText(event_formatValue(val, track.type), vx + UI_LAYOUT.VAL_SINGLE_WIDTH - 4, currentY + 19);
                        ctx.textAlign = 'left';
                    }

                    const btnX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.KEY_ADD_RIGHT;
                    ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(btnX, currentY + 15 - 5); ctx.lineTo(btnX + 5, currentY + 15); ctx.lineTo(btnX, currentY + 15 + 5); ctx.lineTo(btnX - 5, currentY + 15); ctx.closePath(); ctx.stroke();
                    if (track.keys && track.keys.some(k => Math.abs(k.time - drawTime) < 0.001)) { ctx.fillStyle = '#48f'; ctx.fill(); }

                    if (track.keys) {
                        track.keys.forEach(k => {
                            const kx = EVENT_LEFT_PANEL_WIDTH + (k.time - event_viewStartTime) * event_pixelsPerSec;
                            if (kx >= EVENT_LEFT_PANEL_WIDTH && kx <= w) {
                                const isSel = (event_selectedKey && event_selectedKey.keyObj === k) || event_selectedKeys.some(sk => sk.keyObj === k);
                                ctx.fillStyle = isSel ? '#ff0' : (k.interpolation === 'Hold' ? '#f88' : (k.easeIn || k.easeOut ? '#8f8' : '#ddd'));
                                ctx.beginPath();
                                if (k.interpolation === 'Hold') ctx.rect(kx - 4, currentY + 11, 8, 8);
                                else if (k.easeIn || k.easeOut) ctx.arc(kx, currentY + 15, 4, 0, Math.PI * 2);
                                else { ctx.moveTo(kx, currentY + 10); ctx.lineTo(kx + 5, currentY + 15); ctx.lineTo(kx, currentY + 20); ctx.lineTo(kx - 5, currentY + 15); }
                                ctx.fill();
                            }
                        });
                    }
                }
                currentY += EVENT_TRACK_HEIGHT;
            });
        }
    });

    return currentY;
};

window.event_drawTimelineAudioCompact = function(ctx, w, h, currentY) {
    // --- 音声トラックエリア (結合モード時) ---
    if (event_audioCompactMode) {
        if (currentY > EVENT_HEADER_HEIGHT && currentY < h) {
            ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, currentY); ctx.lineTo(w, currentY); ctx.stroke(); ctx.lineWidth = 1;
        }
        for (let t = 0; t < 4; t++) {
            const trackY = currentY;
            if (trackY + EVENT_TRACK_HEIGHT > EVENT_HEADER_HEIGHT && trackY < h) {
                ctx.fillStyle = '#222'; ctx.fillRect(0, trackY, w, EVENT_TRACK_HEIGHT);
                ctx.fillStyle = '#333'; ctx.fillRect(0, trackY, EVENT_LEFT_PANEL_WIDTH, EVENT_TRACK_HEIGHT);
                ctx.strokeStyle = '#444'; ctx.strokeRect(0, trackY, w, EVENT_TRACK_HEIGHT);
                ctx.fillStyle = '#aaa'; ctx.fillText(`Audio ${t + 1}`, 10, trackY + 18);
            }

            event_data.layers.forEach((layer, layerIdx) => {
                if (layer.type !== 'audio') return;
                const tr = (layer.trackIdx !== undefined) ? layer.trackIdx : 0;
                if (tr !== t) return;
                if (trackY + EVENT_TRACK_HEIGHT <= EVENT_HEADER_HEIGHT || trackY >= h) return;

                const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
                const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
                const barX = Math.max(EVENT_LEFT_PANEL_WIDTH, inX);
                const barW = Math.max(0, outX - barX);

                if (barW > 0) {
                    const isLayerSelected = (layerIdx === event_selectedLayerIndex || event_selectedLayerIndices.includes(layerIdx));
                    const isMainSelected = (layerIdx === event_selectedLayerIndex);
                    ctx.save(); ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, h); ctx.clip();
                    ctx.fillStyle = isMainSelected ? 'rgba(100, 255, 100, 0.7)' : (isLayerSelected ? 'rgba(100, 255, 100, 0.5)' : 'rgba(80, 200, 80, 0.4)');
                    ctx.fillRect(barX, trackY + 4, barW, EVENT_TRACK_HEIGHT - 8);
                    ctx.fillStyle = '#fff'; ctx.fillText(layer.name, barX + 5, trackY + 18);

                    const asset = event_findAssetById(layer.assetId);
                    if (asset && asset.waveform) {
                        const startT = layer.startTime || 0;
                        const wfX = EVENT_LEFT_PANEL_WIDTH + (startT - event_viewStartTime) * event_pixelsPerSec;
                        ctx.globalAlpha = 0.5;
                        ctx.save(); ctx.beginPath(); ctx.rect(barX, trackY + 4, barW, EVENT_TRACK_HEIGHT - 8); ctx.clip();
                        if (event_isValidDrawable(asset.waveform)) {
                            try {
                                ctx.drawImage(asset.waveform, wfX, trackY + 4, asset.duration * event_pixelsPerSec, EVENT_TRACK_HEIGHT - 8);
                            } catch (e) { console.warn("Waveform draw error (compact)", e); }
                        }
                        ctx.restore();
                    }
                    ctx.restore();
                }
            });
            currentY += EVENT_TRACK_HEIGHT;
        }
    }

    return currentY;
};

window.event_drawTimelineHeaderAndOverlays = function(ctx, w, h, drawTime, scrollY) {
    const viewEndTime = event_viewStartTime + ((w - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
    const secStep = event_pixelsPerSec > 100 ? 0.5 : 1.0;
    // --- 固定ヘッダー ---
    ctx.save();
    ctx.fillStyle = '#333'; ctx.fillRect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.fillStyle = '#444'; ctx.fillRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(0, EVENT_HEADER_HEIGHT); ctx.lineTo(w, EVENT_HEADER_HEIGHT); ctx.stroke();

    ctx.save(); ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT); ctx.clip();
    for (let t = Math.floor(event_viewStartTime); t <= viewEndTime; t += secStep) {
        const x = EVENT_LEFT_PANEL_WIDTH + (t - event_viewStartTime) * event_pixelsPerSec;
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, EVENT_HEADER_HEIGHT); ctx.stroke();
        if (Math.floor(t) === t) { ctx.fillStyle = '#aaa'; ctx.fillText(t + 's', x + 3, 14); }
    }
    ctx.restore();

    ctx.fillStyle = '#aaa'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText("Md", EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.BLEND_RIGHT + 2, 18);
    ctx.fillText("親", EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PARENT_RIGHT + 5, 18);
    ctx.fillText("Link", EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PICK_RIGHT - 10, 18);

    // ★修正: フレーム数表示を復活
    const fps = event_data.composition.fps || 30;
    const sec = Math.floor(event_currentTime);
    const frame = Math.floor(((event_currentTime + 0.0001) % 1) * fps);
    ctx.fillStyle = '#0ff'; ctx.font = 'bold 14px monospace';
    ctx.fillText(`${event_currentTime.toFixed(2)}s (${sec}s ${frame}f)`, 10, 20);

    const headX = EVENT_LEFT_PANEL_WIDTH + (drawTime - event_viewStartTime) * event_pixelsPerSec;
    if (headX >= EVENT_LEFT_PANEL_WIDTH && headX <= w) {
        ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.moveTo(headX, EVENT_HEADER_HEIGHT); ctx.lineTo(headX - 6, EVENT_HEADER_HEIGHT - 10); ctx.lineTo(headX + 6, EVENT_HEADER_HEIGHT - 10); ctx.fill();
    }
    ctx.restore();

    const lineX = EVENT_LEFT_PANEL_WIDTH + (drawTime - event_viewStartTime) * event_pixelsPerSec;
    if (lineX >= EVENT_LEFT_PANEL_WIDTH && lineX <= w) {
        ctx.strokeStyle = '#f00'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lineX, EVENT_HEADER_HEIGHT); ctx.lineTo(lineX, h); ctx.stroke();
    }

    if (event_state === 'rect-select') {
        const x1 = Math.min(event_rectStartPos.x, event_rectEndPos.x);
        const x2 = Math.max(event_rectStartPos.x, event_rectEndPos.x);
        const y1 = Math.min(event_rectStartPos.y, event_rectEndPos.y);
        const y2 = Math.max(event_rectStartPos.y, event_rectEndPos.y);
        ctx.strokeStyle = '#0ff'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); ctx.strokeRect(x1, y1 - scrollY, x2 - x1, y2 - y1);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)'; ctx.fillRect(x1, y1 - scrollY, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
    }

    if (window.event_updateTextPropertyUI) window.event_updateTextPropertyUI();
};

