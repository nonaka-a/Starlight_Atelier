/**
 * イベントエディタ: プロジェクト管理
 */

window.event_draggedAsset = null;
window.event_draggedProjectItem = null; // プロジェクト内移動用

window.event_initProject = function () {
    event_refreshProjectList();

    const list = document.getElementById('event-project-list');

    // 背景ダブルクリックで画像読み込み
    list.addEventListener('dblclick', (e) => {
        if (e.target === list) {
            if (typeof event_onFileSelected === 'function') {
                event_onFileSelected();
            }
        }
    });

    // リスト全体へのドロップ (ルートへの移動用)
    list.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (window.event_draggedProjectItem) {
            e.dataTransfer.dropEffect = 'move';
            list.style.backgroundColor = '#3a3a3a';
        }
    });
    list.addEventListener('dragleave', () => {
        list.style.backgroundColor = '';
    });
    list.addEventListener('drop', (e) => {
        e.preventDefault();
        list.style.backgroundColor = '';

        if (e.target === list && window.event_draggedProjectItem) {
            event_moveAssetToFolder(window.event_draggedProjectItem, null);
        }
    });
};

// アセット移動処理
function event_moveAssetToFolder(item, targetFolder) {
    if (targetFolder && item.type === 'folder') {
        let parent = targetFolder;
        // 簡易的な循環参照チェック
        if (parent === item) return;
    }

    event_pushHistory();
    event_removeAssetFromTree(event_data.assets, item);

    if (targetFolder) {
        if (!targetFolder.children) targetFolder.children = [];
        targetFolder.children.push(item);
        targetFolder._collapsed = false;
    } else {
        event_data.assets.push(item);
    }

    window.event_draggedProjectItem = null;
    event_refreshProjectList();
}

function event_removeAssetFromTree(list, item) {
    const idx = list.indexOf(item);
    if (idx !== -1) {
        list.splice(idx, 1);
        return true;
    }
    for (let child of list) {
        if (child.type === 'folder' && child.children) {
            if (event_removeAssetFromTree(child.children, item)) return true;
        }
    }
    return false;
}

// --- カスタムプロンプト (Electron対策) ---
let event_activePromptCallback = null;

window.event_customPrompt = function (title, defaultValue, callback) {
    const modal = document.getElementById('event-prompt-modal');
    const input = document.getElementById('event-prompt-input');
    const titleEl = document.getElementById('event-prompt-title');

    titleEl.textContent = title;
    input.value = defaultValue;
    modal.style.display = 'flex';
    input.focus();
    input.select();

    event_activePromptCallback = callback;

    // Enterキー対応
    const onKey = (e) => {
        if (e.key === 'Enter') {
            input.removeEventListener('keydown', onKey);
            event_onPromptOK();
        } else if (e.key === 'Escape') {
            input.removeEventListener('keydown', onKey);
            event_onPromptCancel();
        }
    };
    input.addEventListener('keydown', onKey);
};

window.event_onPromptOK = function () {
    const modal = document.getElementById('event-prompt-modal');
    const input = document.getElementById('event-prompt-input');
    const val = input.value;
    modal.style.display = 'none';
    if (event_activePromptCallback) event_activePromptCallback(val);
    event_activePromptCallback = null;
};

window.event_onPromptCancel = function () {
    const modal = document.getElementById('event-prompt-modal');
    modal.style.display = 'none';
    event_activePromptCallback = null;
};

window.event_createFolder = function () {
    event_customPrompt("フォルダ名を入力してください", "New Folder", (name) => {
        if (!name) return;
        if (typeof event_pushHistory === 'function') event_pushHistory();
        const folder = {
            type: 'folder',
            name: name,
            id: 'folder_' + Date.now() + Math.random(),
            children: [],
            _collapsed: false
        };
        event_data.assets.push(folder);
        event_refreshProjectList();
    });
};

window.event_createComp = function () {
    event_customPrompt("コンポジション名を入力してください", "New Comp", (name) => {
        if (!name) return;
        if (typeof event_pushHistory === 'function') event_pushHistory();
        const comp = {
            type: 'comp',
            name: name,
            id: 'comp_' + Date.now() + Math.random(),
            width: 1000,
            height: 600,
            duration: 10,
            fps: 30,
            layers: []
        };
        event_data.assets.push(comp);
        event_refreshProjectList();
    });
};

window.event_refreshProjectList = function () {
    const list = document.getElementById('event-project-list');
    if (!list) return;
    list.innerHTML = '';

    function renderItems(items, container, depth = 0) {
        items.forEach(item => {
            const div = document.createElement('div');
            div.style.paddingLeft = `${depth * 15 + 5}px`;
            div.style.paddingTop = '4px';
            div.style.paddingBottom = '4px';
            div.style.cursor = 'pointer';
            div.style.userSelect = 'none';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.className = 'project-item';
            div.style.borderBottom = '1px solid #333';

            let iconEl = document.createElement('span');
            iconEl.style.marginRight = '5px';

            if (item.type === 'image' && item.src) {
                const imgIcon = document.createElement('div');
                imgIcon.style.width = '24px';
                imgIcon.style.height = '24px';
                imgIcon.style.backgroundImage = `url(${item.src})`;
                imgIcon.style.backgroundSize = 'contain';
                imgIcon.style.backgroundPosition = 'center';
                imgIcon.style.backgroundRepeat = 'no-repeat';
                imgIcon.style.marginRight = '5px';
                iconEl = imgIcon;
            } else if (item.type === 'animation') {
                iconEl.textContent = (item._collapsed ? '📁' : '📽️') + ' ';
                div.onclick = (e) => {
                    item._collapsed = !item._collapsed;
                    event_refreshProjectList();
                    e.stopPropagation();
                };
            } else if (item.type === 'audio') {
                iconEl.textContent = '🔊 ';
            } else if (item.type === 'folder') {
                iconEl.textContent = (item._collapsed ? '📁' : '📂') + ' ';
                div.onclick = (e) => {
                    item._collapsed = !item._collapsed;
                    event_refreshProjectList();
                    e.stopPropagation();
                };
            } else if (item.type === 'comp') {
                iconEl.textContent = '🎞️ ';
                div.ondblclick = (e) => {
                    event_switchComposition(item.id);
                    e.stopPropagation();
                };
            } else {
                iconEl.textContent = '📄 ';
            }
            div.appendChild(iconEl);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            div.appendChild(nameSpan);

            div.draggable = true;
            div.addEventListener('dragstart', (e) => {
                window.event_draggedAsset = item;
                window.event_draggedProjectItem = item;
                e.dataTransfer.effectAllowed = 'all';
                e.dataTransfer.setData('text/plain', item.id);
                e.stopPropagation();
            });

            if (item.type === 'folder' || item.type === 'animation') {
                div.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (window.event_draggedProjectItem && window.event_draggedProjectItem !== item) {
                        div.style.backgroundColor = '#555';
                        e.dataTransfer.dropEffect = 'move';
                    }
                });
                div.addEventListener('dragleave', () => {
                    div.style.backgroundColor = '';
                });
                div.addEventListener('drop', (e) => {
                    e.preventDefault();
                    div.style.backgroundColor = '';
                    if (window.event_draggedProjectItem && window.event_draggedProjectItem !== item) {
                        event_moveAssetToFolder(window.event_draggedProjectItem, item);
                        e.stopPropagation();
                    }
                });
            }

            div.onmouseover = (e) => { if (!e.relatedTarget || !div.contains(e.relatedTarget)) div.style.backgroundColor = '#444'; };
            div.onmouseout = (e) => { if (!e.relatedTarget || !div.contains(e.relatedTarget)) div.style.backgroundColor = ''; };

            // 削除ボタン
            const delBtn = document.createElement('div');
            delBtn.textContent = '×';
            delBtn.style.marginLeft = 'auto';
            delBtn.style.marginRight = '5px';
            delBtn.style.color = '#fff';
            delBtn.style.backgroundColor = '#d44';
            delBtn.style.width = '16px';
            delBtn.style.height = '16px';
            delBtn.style.borderRadius = '2px';
            delBtn.style.textAlign = 'center';
            delBtn.style.lineHeight = '14px';
            delBtn.style.fontSize = '12px';
            delBtn.style.fontWeight = 'bold';
            delBtn.style.cursor = 'pointer';
            delBtn.style.display = 'block';

            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`"${item.name}" を削除しますか？`)) {
                    if (typeof event_pushHistory === 'function') event_pushHistory();
                    const idx = items.indexOf(item);
                    if (idx !== -1) {
                        items.splice(idx, 1);
                        event_refreshProjectList();
                    }
                }
            };
            div.appendChild(delBtn);
            container.appendChild(div);

            if (item.type === 'folder' && !item._collapsed && item.children) {
                renderItems(item.children, container, depth + 1);
            } else if (item.type === 'animation' && !item._collapsed && item.data) {
                Object.keys(item.data).forEach(animKey => {
                    const subDiv = document.createElement('div');
                    subDiv.style.paddingLeft = `${(depth + 1) * 15 + 10}px`;
                    subDiv.style.paddingTop = '2px';
                    subDiv.style.paddingBottom = '2px';
                    subDiv.style.cursor = 'pointer';
                    subDiv.style.display = 'flex';
                    subDiv.style.alignItems = 'center';
                    subDiv.className = 'project-item sub-anim';
                    subDiv.innerHTML = `<span style="margin-right:5px;">🏃</span> <span>${animKey}</span>`;

                    subDiv.draggable = true;
                    subDiv.addEventListener('dragstart', (e) => {
                        window.event_draggedAsset = {
                            type: 'sub_animation',
                            parentAssetId: item.id,
                            animId: animKey,
                            name: item.name.split('_')[0] + " (" + animKey + ")"
                        };
                        e.dataTransfer.effectAllowed = 'copy';
                        e.stopPropagation();
                    });

                    subDiv.onmouseover = () => subDiv.style.backgroundColor = '#444';
                    subDiv.onmouseout = () => subDiv.style.backgroundColor = '';
                    container.appendChild(subDiv);
                });
            }
        });
    }

    renderItems(event_data.assets, list);
};

// パスを相対化するユーティリティ
window.event_toRelativePath = function (fullPath) {
    if (!fullPath) return fullPath;
    // data URI (base64など) はそのまま返す
    if (fullPath.startsWith('data:')) return fullPath;

    // 過去のバグで壊れたbase64 (../image/png;base64,...) を復元する試み
    if (fullPath.includes('png;base64,') || fullPath.includes('jpeg;base64,') || fullPath.includes('gif;base64,')) {
        if (fullPath.includes('image/')) {
            return 'data:image/' + fullPath.split('image/').pop();
        }
    }

    let savedPath = fullPath;
    if (fullPath.includes('image/')) {
        savedPath = '../image/' + fullPath.split('image/').pop();
    } else if (fullPath.includes('sounds/')) {
        savedPath = '../sounds/' + fullPath.split('sounds/').pop();
    } else if (fullPath.includes('se/')) {
        savedPath = '../se/' + fullPath.split('se/').pop();
    } else if (fullPath.includes('bgm/')) {
        savedPath = '../bgm/' + fullPath.split('bgm/').pop();
    }
    return savedPath;
};

window.event_onFileSelected = async function () {
    if (!window.electronAPI) {
        console.error("electronAPI not available");
        return;
    }
    const filePaths = await window.electronAPI.openFileDialog();
    if (!filePaths || filePaths.length === 0) return;

    for (const fullPath of filePaths) {
        const fileName = fullPath.split('/').pop();
        const ext = fileName.split('.').pop().toLowerCase();

        const savedPath = event_toRelativePath(fullPath);
        const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);

        const newItem = {
            type: isAudio ? 'audio' : 'image',
            name: fileName,
            id: (isAudio ? 'audio_' : 'img_') + Date.now() + Math.random(),
            src: savedPath,
        };

        if (isAudio) {
            try {
                const rawBuffer = await window.electronAPI.readFile(fullPath, 'binary');
                if (event_audioCtx) {
                    const buffer = (rawBuffer instanceof Uint8Array) ? rawBuffer.buffer : rawBuffer;
                    const audioBuffer = await event_audioCtx.decodeAudioData(buffer);
                    newItem.audioBuffer = audioBuffer;
                    newItem.duration = audioBuffer.duration;
                    newItem.waveform = event_generateWaveform(audioBuffer);
                }
            } catch (err) {
                console.error("Audio Load Error:", fileName, err);
            }
        } else {
            const img = new Image();
            img.onload = () => {
                newItem.imgObj = img;
                event_draw();
            };
            img.src = fullPath;
        }

        if (typeof event_pushHistory === 'function') event_pushHistory();
        event_data.assets.push(newItem);
        event_refreshProjectList();
    }
};

window.event_generateWaveform = function (audioBuffer) {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    ctx.fillStyle = '#4af';
    for (let i = 0; i < canvas.width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[i * step + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
    return canvas;
};

window.event_exportJSON = function () {
    if (event_data.activeCompId) {
        const comp = event_findAssetById(event_data.activeCompId);
        if (comp) {
            comp.layers = event_data.layers;
            comp.name = event_data.composition.name;
            comp.width = event_data.composition.width;
            comp.height = event_data.composition.height;
            comp.duration = event_data.composition.duration;
            comp.fps = event_data.composition.fps;
        }
    }

    const exportData = {
        activeCompId: event_data.activeCompId,
        assets: event_data.assets
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (event_data.composition.name || "event_project") + ".json";
    a.click();
    URL.revokeObjectURL(url);
};

window.event_importJSON = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                event_loadProjectData(data);
            } catch (err) {
                console.error(err);
                alert("JSON読み込みエラー: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

window.event_loadProjectData = function (data) {
    if (!data.assets) {
        alert("無効なプロジェクトファイルです: assetsが見つかりません");
        return;
    }

    if (typeof event_pushHistory === 'function') event_pushHistory();
    event_data.assets = data.assets;

    async function restoreAssets(list) {
        for (const item of list) {
            // パスを相対化 (絶対パスが混入していた場合の対策)
            if (item.src) item.src = event_toRelativePath(item.src);
            if (item.source) item.source = event_toRelativePath(item.source);

            if (item.type === 'folder' && item.children) {
                await restoreAssets(item.children);
            } else if ((item.type === 'image' && item.src) || (item.type === 'animation' && item.source)) {
                // 画像またはアニメーションの読み込み
                const url = item.src || item.source;
                const img = new Image();
                img.onload = () => { if (event_data.activeCompId) event_draw(); };
                img.onerror = () => {
                    // フォールバック: ../ を取り除いて再試行
                    if (url.startsWith('../')) {
                        const fallback = url.substring(3);
                        const img2 = new Image();
                        img2.onload = () => {
                            if (item.src) item.src = fallback;
                            if (item.source) item.source = fallback;
                            item.imgObj = img2;
                            event_draw();
                        };
                        img2.src = fallback;
                    }
                };
                img.src = url;
                item.imgObj = img;
            } else if (item.type === 'audio' && item.src) {
                try {
                    const response = await fetch(item.src);
                    const arrayBuffer = await response.arrayBuffer();
                    if (event_audioCtx) {
                        const audioBuffer = await event_audioCtx.decodeAudioData(arrayBuffer);
                        item.audioBuffer = audioBuffer;
                        item.duration = audioBuffer.duration;
                        item.waveform = event_generateWaveform(audioBuffer);
                    }
                } catch (e) {
                    console.warn("Failed to load audio asset:", item.src, e);
                }
            } else if (item.type === 'comp' && item.layers) {
                const cx = (item.width || 1000) / 2;
                const cy = (item.height || 600) / 2;
                item.layers.forEach(layer => {
                    if (!layer.tracks) layer.tracks = {};
                    if (layer.source) layer.source = event_toRelativePath(layer.source); // レイヤーのソースも相対化

                    if (layer.type === 'audio') {
                        if (!layer.tracks.volume) {
                            layer.tracks.volume = { label: "Volume (dB)", type: "number", keys: [], min: -60, max: 12, step: 0.1, initialValue: 0 };
                        }
                    } else {
                        if (!layer.tracks.position) layer.tracks.position = { label: "Position", type: "vector2", keys: [], initialValue: { x: cx, y: cy } };
                        if (!layer.tracks.scale) layer.tracks.scale = { label: "Scale", type: "vector2", linked: true, keys: [], initialValue: { x: 100, y: 100 } };
                        if (!layer.tracks.rotation) layer.tracks.rotation = { label: "Rotation", type: "rotation", keys: [], initialValue: 0 };
                        if (!layer.tracks.opacity) layer.tracks.opacity = { label: "Opacity", type: "number", keys: [], min: 0, max: 100, initialValue: 100 };
                    }
                    if (layer.source && (layer.type === 'image' || layer.type === 'animated_layer' || !layer.type)) {
                        const img = new Image();
                        img.src = layer.source;
                        layer.imgObj = img;
                        img.onload = () => { if (event_data.activeCompId === item.id) event_draw(); }
                        img.onerror = () => {
                            if (layer.source.startsWith('../')) {
                                const fallback = layer.source.substring(3);
                                const img2 = new Image();
                                img2.onload = () => { layer.source = fallback; layer.imgObj = img2; event_draw(); };
                                img2.src = fallback;
                            }
                        };

                        // アニメーションレイヤーの場合、アセットとの紐付けを再帰検索で試みる
                        if (layer.type === 'animated_layer' && !layer.animAssetId) {
                            const findAnimAsset = (list) => {
                                for (const a of list) {
                                    if (a.type === 'animation' && event_toRelativePath(a.source) === layer.source) return a;
                                    if (a.type === 'folder' && a.children) {
                                        const f = findAnimAsset(a.children);
                                        if (f) return f;
                                    }
                                }
                                return null;
                            };
                            const asset = findAnimAsset(data.assets);
                            if (asset) layer.animAssetId = asset.id;
                        }
                    }
                });
            }
        }
    }
    restoreAssets(event_data.assets).then(() => event_draw());

    if (data.activeCompId) {
        event_data.activeCompId = data.activeCompId;
        const newComp = event_findAssetById(data.activeCompId);
        if (newComp && newComp.type === 'comp') {
            event_data.composition = {
                name: newComp.name,
                width: newComp.width,
                height: newComp.height,
                duration: newComp.duration,
                fps: newComp.fps
            };
            event_data.layers = newComp.layers || [];
            const nameDisplay = document.getElementById('event-comp-name-display');
            if (nameDisplay) nameDisplay.textContent = newComp.name;
        }
    } else {
        const firstComp = event_data.assets.find(a => a.type === 'comp');
        if (firstComp) {
            event_switchComposition(firstComp.id);
        } else {
            event_data.activeCompId = null;
            event_data.layers = [];
            event_data.composition = { name: 'New Comp', width: 1000, height: 600, duration: 10, fps: 30 };
            const nameDisplay = document.getElementById('event-comp-name-display');
            if (nameDisplay) nameDisplay.textContent = '';
        }
    }

    event_currentTime = 0;
    event_viewStartTime = 0;
    event_draw();
    event_refreshProjectList();
    alert("プロジェクトを読み込みました。");
};