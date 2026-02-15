/**
 * イベント再生テスト (Fix: 音声読み込み強化版)
 */

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const fileInput = document.getElementById('file-input');

let projectData = null;
let activeComp = null;
let startTime = 0;
let isLoaded = false;
let animationId = null;

// オーディオ管理
let audioCtx = null;
let audioLayers = {}; // layerId -> { sourceNode, gainNode, lastPlayedTime }

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}
window.addEventListener('mousedown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const json = JSON.parse(ev.target.result);
            await loadProject(json);
        } catch (err) {
            console.error(err);
            info.textContent = "Error: " + err.message;
        }
    };
    reader.readAsText(file);
});

async function loadProject(json) {
    if (animationId) cancelAnimationFrame(animationId);
    stopAllAudio();

    projectData = json;

    if (!projectData.assets) {
        throw new Error("Invalid JSON format: 'assets' not found.");
    }

    const compId = projectData.activeCompId;
    activeComp = findAssetById(compId, projectData.assets);

    if (!activeComp) {
        activeComp = findCompRecursive(projectData.assets);
    }

    if (!activeComp) throw new Error("Composition not found in JSON");

    canvas.width = activeComp.width || 1000;
    canvas.height = activeComp.height || 600;

    info.textContent = "Loading assets...";
    await restoreAssetsRecursive(projectData.assets);

    // フォント読み込み待ち
    await document.fonts.ready;

    info.textContent = `Playing: ${activeComp.name}`;
    isLoaded = true;
    startTime = performance.now();
    animationId = requestAnimationFrame(update);
}

function findAssetById(id, list) {
    for (const item of list) {
        if (item.id === id) return item;
        if (item.type === 'folder' && item.children) {
            const found = findAssetById(id, item.children);
            if (found) return found;
        }
    }
    return null;
}

function findCompRecursive(items) {
    for (const item of items) {
        if (item.type === 'comp') return item;
        if (item.type === 'folder' && item.children) {
            const found = findCompRecursive(item.children);
            if (found) return found;
        }
    }
    return null;
}

async function restoreAssetsRecursive(items) {
    async function loadImg(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                if (url.startsWith('../')) {
                    const fallback = url.substring(3);
                    const img2 = new Image();
                    img2.onload = () => resolve(img2);
                    img2.onerror = () => {
                        console.warn("Failed to load image:", url);
                        resolve(null);
                    };
                    img2.src = fallback;
                } else {
                    console.warn("Failed to load image:", url);
                    resolve(null);
                }
            };
            img.src = url;
        });
    }

    async function loadAudio(url) {
        if (!audioCtx) return null;

        const fetchAudio = async (path) => {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            return await audioCtx.decodeAudioData(arrayBuffer);
        };

        try {
            return await fetchAudio(url);
        } catch (e) {
            if (url.startsWith('../')) {
                try {
                    return await fetchAudio(url.substring(3));
                } catch (e2) {
                    console.warn("Failed to load audio:", url);
                    return null;
                }
            }
            console.warn("Failed to load audio:", url);
            return null;
        }
    }

    async function traverse(list) {
        for (const item of list) {
            if ((item.type === 'image' && item.src) || (item.type === 'animation' && item.source)) {
                item.imgObj = await loadImg(item.src || item.source);
            } else if (item.type === 'audio' && item.src) {
                item.audioBuffer = await loadAudio(item.src);
            } else if (item.type === 'comp' && item.layers) {
                for (const l of item.layers) {
                    if (l.source && (l.type === 'image' || l.type === 'animated_layer' || !l.type)) {
                        l.imgObj = await loadImg(l.source);
                    }
                }
            }
            if (item.type === 'folder' && item.children) {
                await traverse(item.children);
            }
        }
    }
    await traverse(items);
}

function getInterpolatedValue(layer, propName, time) {
    const track = layer.tracks ? layer.tracks[propName] : null;

    if (!track || !track.keys || track.keys.length === 0) {
        if (track && track.initialValue !== undefined) {
            return (typeof track.initialValue === 'object') ? { ...track.initialValue } : track.initialValue;
        }
        if (propName === 'position') return { x: canvas.width / 2, y: canvas.height / 2 };
        if (propName === 'scale') return { x: 100, y: 100 };
        if (propName === 'rotation') return 0;
        if (propName === 'opacity') return 100;
        if (propName === 'volume') return 0;
        if (propName === 'motion') return layer.animId || "idle";
        if (propName === 'typewriter') return 100;
        if (propName === 'letterSpacing') return 0;
        return 0;
    }

    const keys = track.keys;
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i + 1];
        if (time >= k1.time && time < k2.time) {
            if (track.type === 'string' || k1.interpolation === 'Hold') return k1.value;

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
    return keys[keys.length - 1].value;
}

function syncAudio(activeComp, time) {
    if (!audioCtx) return;

    activeComp.layers.forEach(layer => {
        if (layer.type !== 'audio') return;

        const inPoint = layer.inPoint || 0;
        const outPoint = layer.outPoint || (activeComp.duration || 10);

        const assetId = layer.assetId || layer.audioAssetId;
        const asset = findAssetById(assetId, projectData.assets);
        if (!asset || !asset.audioBuffer) return;

        const isActive = time >= inPoint && time <= outPoint;
        let audioState = audioLayers[layer.id];

        if (isActive) {
            const offset = time - (layer.startTime !== undefined ? layer.startTime : inPoint);
            const volumeDb = getInterpolatedValue(layer, "volume", time);
            const gain = Math.pow(10, volumeDb / 20);

            if (!audioState) {
                const source = audioCtx.createBufferSource();
                source.buffer = asset.audioBuffer;
                source.loop = layer.loop;

                const gainNode = audioCtx.createGain();
                gainNode.gain.value = gain;

                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                let startOffset = offset;
                if (layer.loop) startOffset = offset % asset.audioBuffer.duration;

                if (startOffset < asset.audioBuffer.duration) {
                    source.start(0, startOffset);
                    audioLayers[layer.id] = { source, gainNode, lastPlayedTime: time };
                }
            } else {
                audioState.gainNode.gain.setTargetAtTime(gain, audioCtx.currentTime, 0.02);
                if (!layer.loop && offset > asset.audioBuffer.duration) {
                    stopLayerAudio(layer.id);
                }
            }
        } else {
            if (audioState) stopLayerAudio(layer.id);
        }
    });
}

function stopLayerAudio(layerId) {
    if (audioLayers[layerId]) {
        try { audioLayers[layerId].source.stop(); } catch (e) { }
        audioLayers[layerId].source.disconnect();
        audioLayers[layerId].gainNode.disconnect();
        delete audioLayers[layerId];
    }
}

function stopAllAudio() {
    Object.keys(audioLayers).forEach(id => stopLayerAudio(id));
}

function applyTransform(ctx, layer, layers, time) {
    if (layer.parent) {
        const parent = layers.find(l => l.id === layer.parent);
        if (parent) applyTransform(ctx, parent, layers, time);
    }
    const pos = getInterpolatedValue(layer, "position", time);
    const lScale = getInterpolatedValue(layer, "scale", time);
    const rot = getInterpolatedValue(layer, "rotation", time);

    ctx.translate(pos.x, pos.y);
    ctx.rotate(rot * Math.PI / 180);
    ctx.scale((lScale.x || 100) / 100, (lScale.y || 100) / 100);
}

let lastTime = 0;

function update(now) {
    if (!isLoaded || !activeComp) return;

    const elapsed = (now - startTime) / 1000;
    const duration = activeComp.duration || 10;
    const time = elapsed % duration;

    if (time < lastTime) stopAllAudio();
    lastTime = time;

    syncAudio(activeComp, time);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const layers = activeComp.layers;
    if (!layers) {
        animationId = requestAnimationFrame(update);
        return;
    }

    // 描画順 (奥 -> 手前)
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer.type === 'audio') continue;

        const inP = layer.inPoint || 0;
        const outP = layer.outPoint || duration;
        if (time < inP || time > outP) continue;

        ctx.save();

        const opacity = getInterpolatedValue(layer, "opacity", time);
        ctx.globalAlpha = opacity / 100;

        if (layer.effects) {
            let filterStr = "";
            layer.effects.forEach(fx => {
                if (fx.type === 'blur') {
                    let val = fx.blur || 0;
                    if (fx.trackName) val = getInterpolatedValue(layer, fx.trackName, time);
                    filterStr += ` blur(${val}px)`;
                }
            });
            if (filterStr && ctx.filter !== undefined) ctx.filter = filterStr.trim();
        }

        applyTransform(ctx, layer, layers, time);

        if (layer.type === 'text') {
            const text = layer.text || "";
            const fontSize = layer.fontSize || 40;
            const fontFamily = layer.fontFamily || 'sans-serif';
            const color = layer.color || '#ffffff';
            const strokeColor = layer.strokeColor || '#000000';
            const strokeWidth = layer.strokeWidth || 0;
            const shadowOpacity = layer.shadowOpacity || 0;

            const typewriter = getInterpolatedValue(layer, "typewriter", time);
            const letterSpacing = getInterpolatedValue(layer, "letterSpacing", time);

            ctx.font = `bold ${fontSize}px ${fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

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
                    const w = ctx.measureText(c).width;
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
                            ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity / 100})`;
                            ctx.shadowBlur = fontSize * 0.15;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                        } else {
                            ctx.shadowColor = 'transparent';
                            ctx.shadowBlur = 0;
                        }

                        if (strokeWidth > 0) {
                            ctx.lineWidth = strokeWidth;
                            ctx.strokeStyle = strokeColor;
                            ctx.lineJoin = 'round';
                            ctx.strokeText(char, drawX, drawY);
                            ctx.shadowColor = 'transparent';
                            ctx.shadowBlur = 0;
                        }

                        ctx.fillStyle = color;
                        ctx.fillText(char, drawX, drawY);

                        currentX += cw + letterSpacing;
                        charCounter++;
                    }
                });
            });

        } else if (layer.type === 'animated_layer') {
            const asset = findAssetById(layer.animAssetId, projectData.assets);
            const animId = getInterpolatedValue(layer, "motion", time);
            if (asset && asset.data && asset.data[animId]) {
                const anim = asset.data[animId];
                const localTime = time - (layer.startTime || 0);
                if (localTime >= 0 && anim.frames.length > 0) {
                    const frameIdx = Math.floor(localTime * anim.fps);
                    const idx = layer.loop ? (frameIdx % anim.frames.length) : Math.min(frameIdx, anim.frames.length - 1);
                    const frame = anim.frames[idx];
                    const img = layer.imgObj || asset.imgObj;
                    if (frame && img) {
                        ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
                    }
                }
            }
        } else if (layer.imgObj) {
            ctx.drawImage(layer.imgObj, -layer.imgObj.width / 2, -layer.imgObj.height / 2);
        }
        ctx.restore();
    }
    animationId = requestAnimationFrame(update);
}