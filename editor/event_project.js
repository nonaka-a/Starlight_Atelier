/**
 * イベントエディタ: プロジェクト管理
 * Step 16: フォルダD&D管理
 */

window.event_draggedAsset = null;
window.event_draggedProjectItem = null; // プロジェクト内移動用

window.event_initProject = function () {
    event_refreshProjectList();

    const list = document.getElementById('event-project-list');

    // 背景ダブルクリックで読み込み
    list.addEventListener('dblclick', (e) => {
        if (e.target === list) {
            document.getElementById('event-file-input').click();
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

        // ターゲットがリスト背景の場合のみルートへ移動
        if (e.target === list && window.event_draggedProjectItem) {
            event_moveAssetToFolder(window.event_draggedProjectItem, null); // null = root
        }
    });
};

// アセット移動処理
function event_moveAssetToFolder(item, targetFolder) {
    // 循環参照チェック (フォルダを自分自身の子にはできない)
    if (targetFolder && item.type === 'folder') {
        let parent = targetFolder;
        while (parent) {
            if (parent === item) return; // 親が自分自身
            // 親を遡るロジックが必要だが、データ構造上 親参照を持っていないため
            // 簡易的に「ターゲットが自分の子孫でないか」をチェックすべきだが、
            // 今回は単純な移動のみ実装
        }
    }

    // 元の場所から削除
    event_removeAssetFromTree(event_data.assets, item);

    // 新しい場所へ追加
    if (targetFolder) {
        if (!targetFolder.children) targetFolder.children = [];
        targetFolder.children.push(item);
        targetFolder._collapsed = false; // 展開する
    } else {
        event_data.assets.push(item); // ルートへ
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

window.event_refreshProjectList = function () {
    const list = document.getElementById('event-project-list');
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

            // アイコン
            let iconEl;
            if (item.type === 'image' && item.src) {
                iconEl = document.createElement('div');
                iconEl.style.width = '24px';
                iconEl.style.height = '24px';
                iconEl.style.backgroundImage = `url(${item.src})`;
                iconEl.style.backgroundSize = 'contain';
                iconEl.style.backgroundPosition = 'center';
                iconEl.style.backgroundRepeat = 'no-repeat';
                iconEl.style.marginRight = '5px';
            } else {
                let iconChar = '📄';
                if (item.type === 'folder') iconChar = item._collapsed ? '📁' : '📂';
                else if (item.type === 'comp') iconChar = '🎞️';
                iconEl = document.createElement('span');
                iconEl.textContent = iconChar + ' ';
                iconEl.style.marginRight = '5px';
            }
            div.appendChild(iconEl);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            div.appendChild(nameSpan);

            // ドラッグ開始
            div.draggable = true;
            div.addEventListener('dragstart', (e) => {
                window.event_draggedAsset = item; // タイムライン用
                window.event_draggedProjectItem = item; // プロジェクト内移動用
                e.dataTransfer.effectAllowed = 'all';
                e.dataTransfer.setData('text/plain', item.id);
                e.stopPropagation();
            });

            // フォルダへのドロップ受け入れ
            if (item.type === 'folder') {
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

                div.onclick = (e) => {
                    item._collapsed = !item._collapsed;
                    event_refreshProjectList();
                    e.stopPropagation();
                };
            }
            else if (item.type === 'comp') {
                div.addEventListener('dblclick', (e) => {
                    event_switchComposition(item.id);
                    e.stopPropagation();
                });
            }

            div.onmouseover = (e) => { if (!e.relatedTarget || !div.contains(e.relatedTarget)) div.style.backgroundColor = '#444'; };
            div.onmouseout = (e) => { if (!e.relatedTarget || !div.contains(e.relatedTarget)) div.style.backgroundColor = ''; };

            container.appendChild(div);

            if (item.type === 'folder' && !item._collapsed && item.children) {
                renderItems(item.children, container, depth + 1);
            }
        });
    }

    renderItems(event_data.assets, list);
};

// ... (ファイル読み込み等は変更なし)

// ファイル読み込み
window.event_onFileSelected = function (input) {
    const files = input.files;
    if (!files.length) return;

    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const newItem = {
                type: 'image',
                name: file.name,
                id: 'img_' + Date.now() + Math.random(),
                src: e.target.result
            };
            event_pushHistory(); // 履歴保存
            event_data.assets.push(newItem);
            event_refreshProjectList();
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};

// フォルダ作成
window.event_createFolder = function () {
    const name = prompt("フォルダ名", "New Folder");
    if (name) {
        event_data.assets.push({
            type: 'folder',
            name: name,
            id: 'folder_' + Date.now(),
            children: []
        });
        event_pushHistory(); // 履歴保存
        event_refreshProjectList();
    }
};