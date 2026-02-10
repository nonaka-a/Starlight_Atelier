/**
 * イベント再生テスト (更新版)
 * エディタの補間ロジック(EaseIn/Out, Hold, Vector2)とデータ構造に対応
 * 2026-02-10: 音声再生・音量キーフレーム対応
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

// ユーザー操作によるAudioContext初期化
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

// ファイル読み込みイベント
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
    stopAllAudio(); // 既存の音を止める

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

/**
 * アセットの復元
 */
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
                    img2.onerror = () => resolve(null);
                    img2.src = fallback;
                } else {
                    resolve(null);
                }
            };
            img.src = url;
        });
    }

    async function loadAudio(url) {
        if (!audioCtx) return null;
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
            if (url.startsWith('../')) {
                try {
                    const response = await fetch(url.substring(3));
                    const arrayBuffer = await response.arrayBuffer();
                    return await audioCtx.decodeAudioData(arrayBuffer);
                } catch (e2) {
                    return null;
                }
            }
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

/**
 * オーディオ同期
 */
function syncAudio(activeComp, time) {
    if (!audioCtx) return;

    activeComp.layers.forEach(layer => {
        if (layer.type !== 'audio') return;

        const inPoint = layer.inPoint || 0;
        const outPoint = layer.outPoint || (activeComp.duration || 10);

        // アセット取得
        const assetId = layer.assetId || layer.audioAssetId;
        const asset = findAssetById(assetId, projectData.assets);
        if (!asset || !asset.audioBuffer) return;

        const isActive = time >= inPoint && time <= outPoint;
        let audioState = audioLayers[layer.id];

        if (isActive) {
            const offset = (time - inPoint) + (layer.startTime || 0);
            const volumeDb = getInterpolatedValue(layer, "volume", time);
            const gain = Math.pow(10, volumeDb / 20);

            if (!audioState) {
                // 新しく再生開始
                const source = audioCtx.createBufferSource();
                source.buffer = asset.audioBuffer;
                source.loop = layer.loop;

                const gainNode = audioCtx.createGain();
                gainNode.gain.value = gain;

                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                source.start(0, offset % asset.audioBuffer.duration);
                audioLayers[layer.id] = { source, gainNode, lastPlayedTime: time };
            } else {
                // 音量更新
                audioState.gainNode.gain.setTargetAtTime(gain, audioCtx.currentTime, 0.02);

                // ループなしで再生終了している場合（簡易チェック）
                if (!layer.loop && offset > asset.audioBuffer.duration) {
                    stopLayerAudio(layer.id);
                }
            }
        } else {
            // 範囲外なら止める
            if (audioState) {
                stopLayerAudio(layer.id);
            }
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

    // 時間が巻き戻った（ループした）場合はオーディオをリセット
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

    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer.type === 'audio') continue;
        if (time < (layer.inPoint || 0) || time > (layer.outPoint || duration)) continue;

        ctx.save();
        ctx.globalAlpha = getInterpolatedValue(layer, "opacity", time) / 100;

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

        if (layer.type === 'animated_layer') {
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
                    if (frame && img) ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
                }
            }
        } else if (layer.imgObj) {
            ctx.drawImage(layer.imgObj, -layer.imgObj.width / 2, -layer.imgObj.height / 2);
        }
        ctx.restore();
    }
    animationId = requestAnimationFrame(update);
}