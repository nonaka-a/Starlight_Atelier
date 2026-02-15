/**
 * イベントエディタ: 描画関連
 * Step 25 (Fix): 固定ヘッダー描画位置修正、波形表示位置修正
 */

// UI定数のオーバーライド
Object.assign(UI_LAYOUT, {
    VAL_VEC_X_RIGHT: 175,
    VAL_VEC_Y_RIGHT: 100
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

function event_isValidDrawable(obj) {
    if (!obj) return false;
    if (obj instanceof HTMLImageElement) {
        return obj.complete && obj.naturalWidth > 0;
    }
    return (obj instanceof HTMLCanvasElement || obj instanceof OffscreenCanvas || obj instanceof ImageBitmap);
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

    const containerW = event_timelineContainer.clientWidth;
    const containerH = event_timelineContainer.clientHeight;

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

        event_timelineContainer.onscroll = () => {
            window.event_draw();
        };
    }

    const totalContentWidth = EVENT_LEFT_PANEL_WIDTH + (event_data.composition.duration || 10) * event_pixelsPerSec + 400; 
    let totalTracks = 0;
    event_data.layers.forEach(l => {
        totalTracks++;
        if (l.expanded) totalTracks += Object.keys(l.tracks).length;
    });
    const totalContentHeight = Math.max(containerH, EVENT_HEADER_HEIGHT + totalTracks * EVENT_TRACK_HEIGHT + 100);

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

    // --- プレビュー描画 ---
    event_calcPreviewScale();
    const scale = event_previewScale;

    const pW = event_data.composition.width * scale;
    const pH = event_data.composition.height * scale;
    if (event_canvasPreview.width !== pW || event_canvasPreview.height !== pH) {
        event_canvasPreview.width = pW;
        event_canvasPreview.height = pH;
    }

    if (event_offscreenCanvas.width !== event_data.composition.width || event_offscreenCanvas.height !== event_data.composition.height) {
        event_offscreenCanvas.width = event_data.composition.width || 100;
        event_offscreenCanvas.height = event_data.composition.height || 100;
    }

    event_ctxPreview.fillStyle = '#000';
    event_ctxPreview.fillRect(0, 0, pW, pH);

    event_ctxPreview.save();
    event_ctxPreview.scale(scale, scale);

    const osCtx = event_offscreenCtx;
    const cw = event_data.composition.width;
    const ch = event_data.composition.height;

    for (let i = event_data.layers.length - 1; i >= 0; i--) {
        const idx = i;
        const layer = event_data.layers[idx];
        if (drawTime < layer.inPoint || drawTime > layer.outPoint || layer.type === 'audio') continue;

        osCtx.clearRect(0, 0, cw, ch);
        osCtx.save();
        event_applyLayerTransform(osCtx, idx, drawTime);

        let drawW = 0, drawH = 0;
        let drawAnchorX = 0, drawAnchorY = 0;

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
                const charWidths = chars.map(c => {
                    const w = osCtx.measureText(c).width;
                    lineWidth += w + letterSpacing;
                    return w;
                });
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
                            osCtx.shadowOffsetX = 0;
                            osCtx.shadowOffsetY = 0;
                        } else {
                            osCtx.shadowColor = 'transparent';
                            osCtx.shadowBlur = 0;
                        }

                        if (strokeWidth > 0) {
                            osCtx.lineWidth = strokeWidth;
                            osCtx.strokeStyle = strokeColor;
                            osCtx.lineJoin = 'round';
                            osCtx.strokeText(char, drawX, drawY);
                            osCtx.shadowColor = 'transparent';
                            osCtx.shadowBlur = 0;
                        }

                        osCtx.fillStyle = color;
                        osCtx.fillText(char, drawX, drawY);
                        
                        currentX += cw + letterSpacing;
                        charCounter++;
                    }
                });
            });

            osCtx.shadowColor = 'transparent';
            osCtx.shadowBlur = 0;

            let maxW = 0;
            lines.forEach(l => {
                const w = osCtx.measureText(l).width + (l.length - 1) * letterSpacing;
                if (w > maxW) maxW = w;
            });
            drawW = maxW + strokeWidth; 
            drawH = totalHeight + strokeWidth;
            drawAnchorX = -drawW / 2;
            drawAnchorY = -drawH / 2;

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
                    if (frame && event_isValidDrawable(imgToDraw) && imgToDraw.complete) {
                        try {
                            osCtx.drawImage(imgToDraw, frame.x, frame.y, frame.w, frame.h, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
                            drawW = frame.w; drawH = frame.h;
                            drawAnchorX = -frame.w / 2; drawAnchorY = -frame.h / 2;
                        } catch (e) {
                            console.error("Draw error (animated_layer):", e, layer);
                        }
                    }
                }
            }
        } else if (event_isValidDrawable(layer.imgObj) && layer.imgObj.complete && layer.imgObj.naturalWidth > 0) {
            try {
                const iw = layer.imgObj.naturalWidth;
                const ih = layer.imgObj.naturalHeight;
                osCtx.drawImage(layer.imgObj, -iw / 2, -ih / 2);
                drawW = iw; drawH = ih;
                drawAnchorX = -iw / 2; drawAnchorY = -ih / 2;
            } catch (e) {
                console.error("Draw error (image):", e, layer);
            }
        } else {
            osCtx.fillStyle = '#48f';
            osCtx.fillRect(-32, -32, 64, 64);
            drawW = 64; drawH = 64;
            drawAnchorX = -32; drawAnchorY = -32;
        }
        osCtx.restore();

        event_ctxPreview.save();
        const opacity = event_getInterpolatedValue(idx, "opacity", drawTime);
        event_ctxPreview.globalAlpha = opacity / 100;

        let filterStr = "";
        if (layer.effects) {
            layer.effects.forEach(fx => {
                if (fx.type === 'blur') {
                    let val = 0;
                    if (fx.trackName && layer.tracks[fx.trackName]) {
                        val = event_getInterpolatedValue(idx, fx.trackName, drawTime);
                    } else {
                        val = fx.blur || 0;
                    }
                    filterStr += ` blur(${val}px)`;
                }
            });
        }
        if (event_ctxPreview.filter !== undefined) {
            event_ctxPreview.filter = filterStr.trim() || 'none';
        }

        if (event_isValidDrawable(event_offscreenCanvas) && event_offscreenCanvas.width > 0 && event_offscreenCanvas.height > 0) {
            try {
                event_ctxPreview.drawImage(event_offscreenCanvas, 0, 0);
            } catch (e) {
                console.error("Draw error (offscreen):", e);
            }
        }

        if (event_ctxPreview.filter !== undefined) {
            event_ctxPreview.filter = 'none';
        }

        if (idx === event_selectedLayerIndex) {
            event_applyLayerTransform(event_ctxPreview, idx, drawTime);
            const currentTransform = event_ctxPreview.getTransform();
            const pixelRatio = 1 / Math.sqrt(currentTransform.a * currentTransform.a + currentTransform.b * currentTransform.b);
            event_ctxPreview.strokeStyle = '#0ff';
            event_ctxPreview.lineWidth = 2 * pixelRatio;
            event_ctxPreview.strokeRect(drawAnchorX, drawAnchorY, drawW, drawH);
        }
        event_ctxPreview.restore();
    }
    event_ctxPreview.restore();

    // --- タイムライン描画 (コンテンツ部分) ---
    const viewEndTime = event_viewStartTime + ((w - EVENT_LEFT_PANEL_WIDTH) / event_pixelsPerSec);
    const secStep = event_pixelsPerSec > 100 ? 0.5 : 1.0;

    // トラックエリアの背景クリッピング
    ctx.save();
    ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, h); ctx.clip();
    const compDurationX = EVENT_LEFT_PANEL_WIDTH + (event_data.composition.duration - event_viewStartTime) * event_pixelsPerSec;
    
    if (compDurationX < w) {
        ctx.fillStyle = '#111';
        ctx.fillRect(compDurationX, 0, w - compDurationX, h);
    }

    // 縦グリッド線
    for (let t = Math.floor(event_viewStartTime); t <= viewEndTime; t += secStep) {
        if (t < 0) continue;
        if (t > event_data.composition.duration) break;
        const x = EVENT_LEFT_PANEL_WIDTH + (t - event_viewStartTime) * event_pixelsPerSec;
        ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.restore();

    // トラック描画ループ
    let currentY = EVENT_HEADER_HEIGHT - scrollY; // 縦スクロール位置を適用
    
    event_data.layers.forEach((layer, layerIdx) => {
        // カリング
        const isVisible = (currentY + EVENT_TRACK_HEIGHT > EVENT_HEADER_HEIGHT && currentY < h);
        
        if (isVisible) {
            ctx.fillStyle = (layerIdx === event_selectedLayerIndex) ? '#556' : '#3a3a3a';
            ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);

            if (layerIdx === event_selectedLayerIndex) {
                ctx.strokeStyle = '#88a';
                ctx.lineWidth = 2;
                ctx.strokeRect(1, currentY + 1, EVENT_LEFT_PANEL_WIDTH - 2, EVENT_TRACK_HEIGHT - 2);
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = '#222';
                ctx.strokeRect(0, currentY, w, EVENT_TRACK_HEIGHT);
            }

            ctx.fillStyle = '#aaa';
            ctx.font = '10px sans-serif';
            const expandMark = layer.expanded ? "▼" : "▶";
            ctx.fillText(expandMark, 5, currentY + 18);

            const iconSize = 20;
            const iconX = 25;
            const iconY = currentY + 5;
            if (event_isValidDrawable(layer.imgObj) && layer.imgObj.complete) {
                try {
                    const aspect = layer.imgObj.width / layer.imgObj.height;
                    let dw = iconSize;
                    let dh = iconSize;
                    if (aspect > 1) dh = iconSize / aspect;
                    else dw = iconSize * aspect;
                    ctx.drawImage(layer.imgObj, iconX + (iconSize - dw) / 2, iconY + (iconSize - dh) / 2, dw, dh);
                } catch (e) {
                    ctx.fillText("🖼️", iconX, currentY + 20);
                }
            } else {
                ctx.fillText(layer.type === 'audio' ? "🔊" : (layer.type === 'text' ? "T" : "📄"), iconX, currentY + 20);
            }

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px sans-serif';
            const nameRightLimit = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PARENT_RIGHT - 10;
            const nameStart = iconX + iconSize + 5;
            const maxNameW = Math.max(10, nameRightLimit - nameStart);
            let dName = layer.name;
            if (ctx.measureText(dName).width > maxNameW) {
                while (ctx.measureText(dName + '...').width > maxNameW && dName.length > 0) dName = dName.slice(0, -1);
                dName += '...';
            }
            ctx.fillText(dName, nameStart, currentY + 20);

            const pickWhipX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PICK_RIGHT;
            const parentSelX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PARENT_RIGHT;
            const parentSelW = UI_LAYOUT.PARENT_RIGHT - UI_LAYOUT.PICK_RIGHT - 5;

            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(pickWhipX + 8, currentY + EVENT_TRACK_HEIGHT / 2, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(pickWhipX + 8, currentY + EVENT_TRACK_HEIGHT / 2, 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#222';
            ctx.fillRect(parentSelX, currentY + 4, parentSelW, EVENT_TRACK_HEIGHT - 8);
            ctx.fillStyle = '#ccc';
            ctx.font = '10px sans-serif';
            let parentName = "なし";
            if (layer.parent) {
                const p = event_data.layers.find(l => l.id === layer.parent);
                if (p) parentName = p.name;
            }
            if (ctx.measureText(parentName).width > parentSelW - 15) parentName = parentName.substring(0, 5) + '..';
            ctx.fillText(parentName, parentSelX + 4, currentY + 18);
            ctx.fillStyle = '#666';
            ctx.fillText("▼", parentSelX + parentSelW - 12, currentY + 18);

            const trashX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.TRASH_RIGHT;
            const trashY = currentY + 5;
            ctx.fillStyle = '#d44';
            ctx.fillRect(trashX, trashY, 20, 20);
            ctx.fillStyle = '#fff';
            ctx.fillText("×", trashX + 6, trashY + 14);

            const inX = EVENT_LEFT_PANEL_WIDTH + (layer.inPoint - event_viewStartTime) * event_pixelsPerSec;
            const outX = EVENT_LEFT_PANEL_WIDTH + (layer.outPoint - event_viewStartTime) * event_pixelsPerSec;
            const barX = Math.max(EVENT_LEFT_PANEL_WIDTH, inX);
            const barW = Math.max(0, outX - barX);

            ctx.save();
            ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, h); ctx.clip();

            if (barW > 0) {
                // 背景色分岐
                let r = 100, g = 150, b = 255;
                if (layer.type === 'animated_layer') { r = 230; g = 200; b = 20; }
                else if (layer.type === 'text') { r = 255; g = 80; b = 80; }
                else if (layer.type === 'audio') { r = 80; g = 200; b = 80; }

                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
                ctx.fillRect(barX, currentY + 4, barW, EVENT_TRACK_HEIGHT - 8);

                // 波形描画
                if (layer.type === 'audio') {
                    const asset = event_findAssetById(layer.assetId);
                    if (asset && asset.waveform) {
                        const startT = layer.startTime || 0;
                        const wfCanvas = asset.waveform;
                        const waveformW = asset.duration * event_pixelsPerSec;
                        const waveformX = EVENT_LEFT_PANEL_WIDTH + (startT - event_viewStartTime) * event_pixelsPerSec;

                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(barX, currentY + 4, barW, EVENT_TRACK_HEIGHT - 8);
                        ctx.clip();
                        ctx.globalAlpha = 0.8;
                        if (event_isValidDrawable(wfCanvas)) {
                            try {
                                ctx.drawImage(wfCanvas, waveformX, currentY + 4, waveformW, EVENT_TRACK_HEIGHT - 8);
                            } catch (e) {
                                console.error("Draw error (waveform):", e);
                            }
                        }
                        ctx.restore();
                    }
                }

                // ハンドルと枠
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
                if (inX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(inX, currentY + 4, EVENT_LAYER_HANDLE_WIDTH, EVENT_TRACK_HEIGHT - 8);
                if (outX >= EVENT_LEFT_PANEL_WIDTH) ctx.fillRect(outX - EVENT_LAYER_HANDLE_WIDTH, currentY + 4, EVENT_LAYER_HANDLE_WIDTH, EVENT_TRACK_HEIGHT - 8);
            }
            ctx.restore();
        }
        currentY += EVENT_TRACK_HEIGHT;

        if (layer.expanded) {
            Object.keys(layer.tracks).forEach(propName => {
                const track = layer.tracks[propName];
                const isTrackVisible = (currentY + EVENT_TRACK_HEIGHT > EVENT_HEADER_HEIGHT && currentY < h);

                if (isTrackVisible) {
                    ctx.fillStyle = '#2d2d2d'; ctx.fillRect(0, currentY, w, EVENT_TRACK_HEIGHT);
                    ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.moveTo(0, currentY + EVENT_TRACK_HEIGHT); ctx.lineTo(w, currentY + EVENT_TRACK_HEIGHT); ctx.stroke();
                    ctx.fillStyle = '#ddd'; ctx.font = '11px sans-serif'; ctx.fillText(track.label, 30, currentY + 19);

                    if (propName.startsWith('fx_')) {
                        const delBtnX = 15;
                        const delBtnY = currentY + 10;
                        ctx.fillStyle = '#d44';
                        ctx.fillRect(delBtnX, delBtnY, 12, 12);
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 10px sans-serif';
                        ctx.fillText('×', delBtnX + 2, delBtnY + 9);
                    }

                    const val = event_getInterpolatedValue(layerIdx, propName, drawTime);

                    if (track.type === 'vector2') {
                        if (propName === 'scale') {
                            const checkXStart = EVENT_LEFT_PANEL_WIDTH - 220;
                            ctx.fillStyle = (val.x < 0) ? '#0ff' : '#444';
                            ctx.fillRect(checkXStart, currentY + 8, 12, 12);
                            ctx.strokeStyle = '#888';
                            ctx.strokeRect(checkXStart, currentY + 8, 12, 12);
                            ctx.fillStyle = '#aaa';
                            ctx.fillText("x", checkXStart + 15, currentY + 18);

                            ctx.fillStyle = (val.y < 0) ? '#0ff' : '#444';
                            ctx.fillRect(checkXStart + 30, currentY + 8, 12, 12);
                            ctx.strokeStyle = '#888';
                            ctx.strokeRect(checkXStart + 30, currentY + 8, 12, 12);
                            ctx.fillStyle = '#aaa';
                            ctx.fillText("y", checkXStart + 45, currentY + 18);

                            const linkBtnX = EVENT_LEFT_PANEL_WIDTH - 113;
                            const linkBtnY = currentY + 8;
                            ctx.fillStyle = track.linked ? '#666' : '#444';
                            ctx.fillRect(linkBtnX, linkBtnY, 10, 12);
                            ctx.strokeStyle = '#888';
                            ctx.strokeRect(linkBtnX, linkBtnY, 10, 12);
                            ctx.fillStyle = track.linked ? '#fff' : '#888';
                            ctx.fillText(track.linked ? "∞" : "-", linkBtnX + 1, currentY + 17);
                        }

                        const valX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.VAL_VEC_X_RIGHT;
                        ctx.fillStyle = '#3a2a2a';
                        ctx.fillRect(valX, currentY + 4, UI_LAYOUT.VAL_VEC_WIDTH, EVENT_TRACK_HEIGHT - 8);
                        ctx.fillStyle = '#f88';
                        ctx.textAlign = 'right';
                        ctx.fillText(Math.abs(val.x).toFixed(1), valX + UI_LAYOUT.VAL_VEC_WIDTH - 4, currentY + 19);

                        const valY = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.VAL_VEC_Y_RIGHT;
                        ctx.fillStyle = '#2a3a2a';
                        ctx.fillRect(valY, currentY + 4, UI_LAYOUT.VAL_VEC_WIDTH, EVENT_TRACK_HEIGHT - 8);
                        ctx.fillStyle = '#8f8';
                        ctx.textAlign = 'right';
                        ctx.fillText(Math.abs(val.y).toFixed(1), valY + UI_LAYOUT.VAL_VEC_WIDTH - 4, currentY + 19);
                        ctx.textAlign = 'left';
                    } else {
                        const valText = event_formatValue(val, track.type);
                        const valX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.VAL_SINGLE_RIGHT;
                        ctx.fillStyle = '#3a3a3a';
                        ctx.fillRect(valX, currentY + 4, UI_LAYOUT.VAL_SINGLE_WIDTH, EVENT_TRACK_HEIGHT - 8);
                        ctx.fillStyle = '#eee';
                        ctx.textAlign = 'right';
                        ctx.fillText(valText, valX + UI_LAYOUT.VAL_SINGLE_WIDTH - 4, currentY + 19);
                        ctx.textAlign = 'left';
                    }

                    const btnX = EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.KEY_ADD_RIGHT;
                    const btnY = currentY + EVENT_TRACK_HEIGHT / 2;
                    ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(btnX, btnY - 5); ctx.lineTo(btnX + 5, btnY); ctx.lineTo(btnX, btnY + 5); ctx.lineTo(btnX - 5, btnY); ctx.closePath(); ctx.stroke();
                    const hasKey = track.keys && track.keys.some(k => Math.abs(k.time - drawTime) < 0.001);
                    if (hasKey) { ctx.fillStyle = '#48f'; ctx.fill(); }

                    ctx.save();
                    ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, currentY, w - EVENT_LEFT_PANEL_WIDTH, EVENT_TRACK_HEIGHT); ctx.clip();
                    if (track.keys) {
                        track.keys.forEach(key => {
                            const kx = EVENT_LEFT_PANEL_WIDTH + (key.time - event_viewStartTime) * event_pixelsPerSec;
                            const ky = currentY + EVENT_TRACK_HEIGHT / 2;
                            const isSelected = (event_selectedKey && event_selectedKey.keyObj === key) || (event_selectedKeys && event_selectedKeys.some(sk => sk.keyObj === key));
                            const isDragging = (event_dragTarget && event_dragTarget.type === 'keys' && event_dragTarget.keys.some(k => k.key === key));
                            const isHold = (key.interpolation === 'Hold');
                            const isEase = (key.easeIn || key.easeOut);

                            if (isSelected || isDragging) { ctx.fillStyle = '#ff0'; ctx.strokeStyle = '#fff'; }
                            else { ctx.fillStyle = isHold ? '#f88' : '#ddd'; ctx.strokeStyle = '#000'; }

                            ctx.beginPath();
                            if (isHold) ctx.rect(kx - 4, ky - 4, 8, 8);
                            else if (isEase) ctx.arc(kx, ky, EVENT_KEYFRAME_SIZE, 0, Math.PI * 2);
                            else {
                                ctx.moveTo(kx, ky - EVENT_KEYFRAME_SIZE);
                                ctx.lineTo(kx + EVENT_KEYFRAME_SIZE, ky);
                                ctx.lineTo(kx, ky + EVENT_KEYFRAME_SIZE);
                                ctx.lineTo(kx - EVENT_KEYFRAME_SIZE, ky);
                                ctx.closePath();
                            }
                            ctx.fill(); ctx.stroke();
                        });
                    }
                    ctx.restore();
                }
                currentY += EVENT_TRACK_HEIGHT;
            });
        }
    });

    // --- 固定ヘッダーの描画 ---
    ctx.save();
    // 固定のためtranslateなし
    
    // ヘッダー背景
    ctx.fillStyle = '#333';
    ctx.fillRect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT);
    ctx.strokeStyle = '#555';
    ctx.beginPath(); ctx.moveTo(0, EVENT_HEADER_HEIGHT); ctx.lineTo(w, EVENT_HEADER_HEIGHT); ctx.stroke();

    // 時間目盛り
    ctx.save();
    ctx.beginPath(); ctx.rect(EVENT_LEFT_PANEL_WIDTH, 0, w - EVENT_LEFT_PANEL_WIDTH, EVENT_HEADER_HEIGHT); ctx.clip();
    for (let t = Math.floor(event_viewStartTime); t <= viewEndTime; t += secStep) {
        if (t < 0 || t > event_data.composition.duration) continue;
        const x = EVENT_LEFT_PANEL_WIDTH + (t - event_viewStartTime) * event_pixelsPerSec;
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, EVENT_HEADER_HEIGHT); ctx.stroke();
        if (Math.floor(t) === t) {
            ctx.fillStyle = '#aaa'; ctx.font = '10px sans-serif';
            ctx.fillText(t + 's', x + 3, 14);
        }
    }
    ctx.restore();

    // ヘッダーラベルと現在時刻
    ctx.fillStyle = '#aaa'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText("親", EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PARENT_RIGHT + 5, 18);
    ctx.fillText("Link", EVENT_LEFT_PANEL_WIDTH - UI_LAYOUT.PICK_RIGHT - 10, 18);

    const fps = event_data.composition.fps || 30;
    const sec = Math.floor(event_currentTime);
    const frame = Math.floor(((event_currentTime + 0.0001) % 1) * fps);
    ctx.fillStyle = '#0ff'; ctx.font = 'bold 14px monospace';
    ctx.fillText(`${event_currentTime.toFixed(2)}s (${sec}s ${frame}f)`, 10, 20);

    // 再生ヘッド (三角形) - ヘッダー上
    const headX = EVENT_LEFT_PANEL_WIDTH + (drawTime - event_viewStartTime) * event_pixelsPerSec;
    if (headX >= EVENT_LEFT_PANEL_WIDTH && headX <= w) {
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.moveTo(headX, EVENT_HEADER_HEIGHT);
        ctx.lineTo(headX - 6, EVENT_HEADER_HEIGHT - 10);
        ctx.lineTo(headX + 6, EVENT_HEADER_HEIGHT - 10);
        ctx.fill();
    }
    ctx.restore();

    // 再生ヘッド (線) - トラック上 (スクロールに関係なく表示位置はCanvas相対)
    const lineX = EVENT_LEFT_PANEL_WIDTH + (drawTime - event_viewStartTime) * event_pixelsPerSec;
    if (lineX >= EVENT_LEFT_PANEL_WIDTH && lineX <= w) {
        ctx.strokeStyle = '#f00'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lineX, EVENT_HEADER_HEIGHT); ctx.lineTo(lineX, h); ctx.stroke();
    }

    // --- 矩形選択範囲の描画 (スクロール補正済み) ---
    if (event_state === 'rect-select') {
        const x1 = Math.min(event_rectStartPos.x, event_rectEndPos.x);
        const x2 = Math.max(event_rectStartPos.x, event_rectEndPos.x);
        const y1 = Math.min(event_rectStartPos.y, event_rectEndPos.y);
        const y2 = Math.max(event_rectStartPos.y, event_rectEndPos.y);

        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x1, y1 - scrollY, x2 - x1, y2 - y1);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.fillRect(x1, y1 - scrollY, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
    }

    if (window.event_updateTextPropertyUI) window.event_updateTextPropertyUI();
};