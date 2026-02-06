/**
 * イベント再生テスト (更新版)
 * エディタの補間ロジック(EaseIn/Out, Hold, Vector2)とデータ構造に対応
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

    projectData = json;

    // データ形式の検証
    if (!projectData.assets) {
        throw new Error("Invalid JSON format: 'assets' not found.");
    }

    // アクティブなコンポジションを探す
    const compId = projectData.activeCompId;
    activeComp = findAssetById(compId, projectData.assets);

    if (!activeComp) {
        // 見つからない場合は最初に見つかったコンポジションにする
        activeComp = findCompRecursive(projectData.assets);
    }

    if (!activeComp) throw new Error("Composition not found in JSON");

    // キャンバスサイズ設定
    canvas.width = activeComp.width || 1000;
    canvas.height = activeComp.height || 600;

    // 画像の読み込み（再帰的に検索してロード）
    await restoreImages(projectData.assets);

    info.textContent = `Playing: ${activeComp.name}`;
    isLoaded = true;
    startTime = performance.now();
    animationId = requestAnimationFrame(update);
}

// アセットID検索
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

// 再帰的にコンポジションを探す
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

// 画像の復元 (再帰)
async function restoreImages(items) {
    const promises = [];

    function traverse(list) {
        for (const item of list) {
            // コンポジション内のレイヤー
            if (item.type === 'comp' && item.layers) {
                item.layers.forEach(l => {
                    if (l.source) {
                        const p = new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => {
                                l.imgObj = img;
                                resolve();
                            };
                            img.onerror = () => {
                                console.warn("Failed to load image:", l.source);
                                resolve();
                            };
                            img.src = l.source;
                        });
                        promises.push(p);
                    }
                });
            }
            // フォルダ再帰
            if (item.type === 'folder' && item.children) {
                traverse(item.children);
            }
        }
    }

    traverse(items);
    await Promise.all(promises);
}

// 補間値の取得 (エディタのロジックに準拠)
function getInterpolatedValue(layer, propName, time) {
    const track = layer.tracks[propName];
    // トラックが存在しない、またはキーがない場合のデフォルト値
    if (!track || !track.keys || track.keys.length === 0) {
        if (track && track.initialValue !== undefined) return track.initialValue;
        
        // フォールバック
        if (propName === 'position') return { x: canvas.width / 2, y: canvas.height / 2 };
        if (propName === 'scale') return { x: 100, y: 100 }; // Vector2
        if (propName === 'rotation') return 0;
        if (propName === 'opacity') return 100;
        if (propName === 'motion') return layer.animId || "idle";
        return 0;
    }

    const keys = track.keys;
    // キーフレームが1つの場合
    if (keys.length === 1) return keys[0].value;

    // 範囲外チェック
    if (time <= keys[0].time) return keys[0].value;
    if (time >= keys[keys.length - 1].time) return keys[keys.length - 1].value;

    // キーフレーム間を探す
    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i + 1];
        if (time >= k1.time && time < k2.time) {
            // 停止キーフレーム (Hold)
            if (track.type === 'string' || k1.interpolation === 'Hold') {
                return k1.value;
            }

            let t = (time - k1.time) / (k2.time - k1.time);

            // イージング計算 (k2のインとk1のアウトを使用)
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
                // Vector2 (Position, Scale)
                return {
                    x: k1.value.x + (k2.value.x - k1.value.x) * t,
                    y: k1.value.y + (k2.value.y - k1.value.y) * t
                };
            }
        }
    }
    return keys[keys.length - 1].value;
}

// Transform適用 (再帰)
function applyTransform(ctx, layer, layers, time) {
    if (layer.parent) {
        const parent = layers.find(l => l.id === layer.parent);
        if (parent) {
            applyTransform(ctx, parent, layers, time);
        }
    }

    const pos = getInterpolatedValue(layer, "position", time);
    const lScale = getInterpolatedValue(layer, "scale", time);
    const rot = getInterpolatedValue(layer, "rotation", time);

    ctx.translate(pos.x, pos.y);
    ctx.rotate(rot * Math.PI / 180);
    
    // ScaleはVector2 {x, y} で管理されている (単位:%)
    const sx = (lScale.x !== undefined ? lScale.x : 100) / 100;
    const sy = (lScale.y !== undefined ? lScale.y : 100) / 100;
    ctx.scale(sx, sy);
}

// メインループ
function update(now) {
    if (!isLoaded || !activeComp) return;

    const elapsed = (now - startTime) / 1000;
    const duration = activeComp.duration || 10;
    const time = elapsed % duration; // ループ再生

    // 背景クリア
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const layers = activeComp.layers;
    
    // 描画順: 配列の後ろ（リストの下）から順に描画（リストの上(index0)が最前面）
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];

        // 表示期間チェック
        if (time < (layer.inPoint || 0) || time > (layer.outPoint || duration)) continue;

        ctx.save();

        // 不透明度
        const opacity = getInterpolatedValue(layer, "opacity", time);
        ctx.globalAlpha = opacity / 100;

        // エフェクト（簡易適用：Blurのみ）
        let filterStr = "";
        if (layer.effects) {
            layer.effects.forEach(fx => {
                if (fx.type === 'blur') {
                    let val = fx.blur || 0;
                    if (fx.trackName && layer.tracks[fx.trackName]) {
                        val = getInterpolatedValue(layer, fx.trackName, time);
                    }
                    filterStr += ` blur(${val}px)`;
                }
            });
        }
        if (filterStr && ctx.filter !== undefined) {
            ctx.filter = filterStr.trim();
        }

        // 変形適用
        applyTransform(ctx, layer, layers, time);

        // コンテンツ描画
        if (layer.type === 'animated_layer') {
            const asset = findAssetById(layer.animAssetId, projectData.assets);
            const animId = getInterpolatedValue(layer, "motion", time);

            if (asset && asset.data && asset.data[animId]) {
                const anim = asset.data[animId];
                const localTime = time - (layer.startTime || 0);
                
                // アニメーションフレーム計算
                if (localTime >= 0 && anim.frames.length > 0) {
                    const frameIdx = Math.floor(localTime * anim.fps);
                    const actualIdx = layer.loop ? (frameIdx % anim.frames.length) : Math.min(frameIdx, anim.frames.length - 1);
                    const frame = anim.frames[actualIdx];
                    
                    if (frame && layer.imgObj) {
                        // 中心基準で描画
                        ctx.drawImage(layer.imgObj, frame.x, frame.y, frame.w, frame.h, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
                    }
                }
            }
        } else if (layer.imgObj && layer.imgObj.complete && layer.imgObj.naturalWidth > 0) {
            // 通常画像描画 (中心基準)
            const w = layer.imgObj.naturalWidth;
            const h = layer.imgObj.naturalHeight;
            ctx.drawImage(layer.imgObj, -w / 2, -h / 2);
        } else {
            // 画像がない場合のプレースホルダー
            ctx.fillStyle = '#48f';
            ctx.fillRect(-32, -32, 64, 64);
        }

        ctx.restore();
    }

    animationId = requestAnimationFrame(update);
}