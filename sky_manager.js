/* ------------------------------------------------------------
   FILE: sky_manager.js (Fix Data Loss Ver.)
   ------------------------------------------------------------ */

/**
 * --- Sky Manager: 夜空とキャンバスの管理 ---
 */
const SkyManager = {
    // --- 設定 ---
    worldWidth: 2000,
    worldHeight: 1200,
    gridSize: 32,
    resolutionScale: 1.0,
    viewScale: 0.5,

    useShadow: true,

    // 内部変数
    canvas: null,
    ctx: null,
    stampsImage: new Image(),
    bgImage: new Image(),
    mountainImage: new Image(),
    woodsImage: new Image(),
    charImage: new Image(),
    isLoaded: false,

    // データ保存用
    starDataList: [],
    pendingLoadData: null,

    // ほしを見るモード用
    isActive: false,
    camera: { x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
    isDragging: false,
    uiAlpha: 1.0,
    uiTimer: 0,

    init: function () {
        if (this.canvas) return;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.worldWidth * this.resolutionScale;
        this.canvas.height = this.worldHeight * this.resolutionScale;
        this.ctx = this.canvas.getContext('2d');

        if (typeof AudioSys !== 'undefined') {
            AudioSys.loadBGM('suzumuai', 'sounds/suzumuai.mp3');
        }

        let loadedCount = 0;
        const totalImages = 5;

        const checkLoad = () => {
            if (this.isLoaded) return; // 二重実行防止

            loadedCount++;
            if (loadedCount >= totalImages) {
                console.log("SkyManager: Images Loaded.");
                this.isLoaded = true;
                this.initBackground();

                // ロード待ちデータがあれば復元
                if (this.pendingLoadData) {
                    console.log("SkyManager: Found pending data, restoring...");
                    this.restoreStarData(this.pendingLoadData);
                    this.pendingLoadData = null;
                }
            }
        };

        this.stampsImage.src = 'image/star_stamps_h.png';
        this.stampsImage.onload = checkLoad;
        this.stampsImage.onerror = checkLoad;

        this.bgImage.src = 'image/bg_sky.jpg';
        this.bgImage.onload = checkLoad;
        this.bgImage.onerror = () => { console.warn("no bg image"); checkLoad(); };

        this.mountainImage.src = 'image/bg_mountain.png';
        this.mountainImage.onload = checkLoad;
        this.mountainImage.onerror = () => { console.warn("no mountain image"); checkLoad(); };

        this.woodsImage.src = 'image/bg_Woods.png';
        this.woodsImage.onload = checkLoad;
        this.woodsImage.onerror = () => { console.warn("no woods image"); checkLoad(); };

        this.charImage.src = 'image/maimai_watching.png';
        this.charImage.onload = checkLoad;
        this.charImage.onerror = () => { console.warn("no char image"); checkLoad(); };
    },

    initBackground: function () {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.save();
        if (this.bgImage.complete && this.bgImage.naturalWidth > 0) {
            ctx.drawImage(this.bgImage, 0, 0, w, h);
        } else {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#050510');
            grad.addColorStop(1, '#101025');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }
        ctx.restore();
    },

    // --- データ保存・読み込み ---
    getStarData: function () {
        // ★修正: 画像ロード待ちのデータがある場合はそれを返す (データ消失防止)
        // これにより、ロード中にセーブが走っても空データで上書きされるのを防ぎます
        if (this.pendingLoadData) {
            return this.pendingLoadData;
        }
        // 現在のリストを返す
        return this.starDataList;
    },

    setStarData: function (dataList) {
        if (!dataList || !Array.isArray(dataList)) {
            console.warn("SkyManager: Invalid data set.");
            return;
        }
        console.log(`SkyManager: Received ${dataList.length} stars.`);

        if (this.isLoaded) {
            this.restoreStarData(dataList);
        } else {
            console.log("SkyManager: Not loaded yet, pending data.");
            this.pendingLoadData = dataList;
        }
    },

    restoreStarData: function (dataList) {
        this.starDataList = dataList; // リストを上書き復元
        this.initBackground(); // キャンバスを一度クリア（背景のみにする）

        // 全ての星を再描画
        for (const s of this.starDataList) {
            // 第8引数 false = 履歴には追加しない(二重追加防止)
            this.drawSingleStamp(this.ctx, s.x, s.y, s.row, s.col, s.color, s.scale, false);
        }
        console.log(`SkyManager: Restored ${this.starDataList.length} stars on canvas.`);
    },

    // --- 描画ロジック ---
    drawCluster: function (gridX, gridY, sizeLevel, color, targetCtx = null) {
        if (!this.isLoaded) return;

        let radius = 1;
        if (sizeLevel === 1) radius = 2;
        if (sizeLevel === 2) radius = 4;

        const ctx = targetCtx || this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // ステップ1: 基本エリア
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius + 0.5) continue;

                let densityIndex = 2;
                if (dist <= 1.0) densityIndex = 0;
                else if (dist <= radius * 0.6) densityIndex = 1;

                // 密度のダウングレード（確率はそのまま）
                if (densityIndex === 0 && Math.random() < 0.66) densityIndex = 1;
                else if (densityIndex === 1 && Math.random() < 0.66) densityIndex = 2;

                // ★修正: 間引き率を緩和（iPad等でスカスカにならないように）
                // 低密度: 40%除外 -> 20%除外に変更
                if (densityIndex === 2 && Math.random() < 0.2) continue;
                // 中密度: 10%除外 -> 0% (必ず描く)
                // if (densityIndex === 1 && Math.random() < 0.1) continue; 

                this.drawStampAtGrid(gridX + dx, gridY + dy, densityIndex, color);

                // 重ね打ち（確率はそのまま）
                if (densityIndex === 0 && Math.random() < 0.5) {
                    this.drawStampAtGrid(gridX + dx, gridY + dy, densityIndex, color);
                }
            }
        }

        // ステップ2: 拡張 (Spikes)
        // ★修正: 本数を増やしてボリュームアップ
        const spikeCount = 3 + Math.floor(Math.random() * 3); // 2~3本 -> 3~5本
        for (let i = 0; i < spikeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spikeLen = radius + 2 + Math.floor(Math.random() * 3);

            for (let d = radius + 1; d <= spikeLen; d++) {
                const ox = Math.round(Math.cos(angle) * d);
                const oy = Math.round(Math.sin(angle) * d);
                // ★修正: 描画確率を上げる (0.6 -> 0.8)
                if (Math.random() < 0.8) {
                    const spikeDensity = (Math.random() < 0.2) ? 1 : 2;
                    this.drawStampAtGrid(gridX + ox, gridY + oy, spikeDensity, color);
                }
            }
        }

        // ステップ3: 飛び地 (近距離)
        // ★修正: 個数を微増
        const strayCount = 3 + Math.floor(Math.random() * 4); // 2~5 -> 3~6個
        for (let i = 0; i < strayCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = radius * (1.5 + Math.random() * 0.8);
            const sx = Math.round(Math.cos(angle) * dist);
            const sy = Math.round(Math.sin(angle) * dist);
            this.drawStampAtGrid(gridX + sx, gridY + sy, 2, color);
        }

        // ステップ4: 遠方飛び地
        // ★修正: 個数を微増
        const farStrayCount = 4 + Math.floor(Math.random() * 5); // 3~6 -> 4~8個
        for (let i = 0; i < farStrayCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = radius * 2.5 + Math.random() * 6.0;
            const fx = Math.round(Math.cos(angle) * dist);
            const fy = Math.round(Math.sin(angle) * dist);
            this.drawStampAtGrid(gridX + fx, gridY + fy, 2, color);
        }

        ctx.restore();
    },


    drawStampAtGrid: function (gx, gy, densityIndex, color) {
        const logicalPx = gx * this.gridSize;
        const logicalPy = gy * this.gridSize;

        if (logicalPx < 0 || logicalPx >= this.worldWidth || logicalPy < 0 || logicalPy >= this.worldHeight) return;

        const jitterX = (Math.random() - 0.5) * 20;
        const jitterY = (Math.random() - 0.5) * 20;
        const scale = 0.8 + Math.random() * 0.5;
        const stampCol = Math.floor(Math.random() * 10);

        this.drawSingleStamp(
            this.ctx,
            (logicalPx + jitterX) * this.resolutionScale,
            (logicalPy + jitterY) * this.resolutionScale,
            densityIndex,
            stampCol,
            color,
            scale * this.resolutionScale,
            true
        );
    },

    drawSingleStamp: function (ctx, x, y, row, col, color, scale, record) {
        if (record) {
            // ★修正: 保存データを軽量化
            // 座標は整数に丸める、スケールは小数点第2位までにする
            this.starDataList.push({
                x: Math.floor(x),
                y: Math.floor(y),
                row: row,
                col: col,
                color: color,
                scale: parseFloat(scale.toFixed(2))
            });
        }

        const sw = 64;
        const sh = 64;
        const sx = col * sw;
        const sy = row * sh;

        const baseScale = 0.8;
        const centerOffset = (this.gridSize / 2) * this.resolutionScale;

        ctx.save();
        ctx.translate(x + centerOffset, y + centerOffset);

        const angle = Math.floor(Math.random() * 4) * (Math.PI / 2);
        ctx.rotate(angle);

        const finalScale = scale * baseScale;

        if (Math.random() < 0.5) ctx.scale(-finalScale, finalScale);
        else ctx.scale(finalScale, finalScale);

        ctx.globalCompositeOperation = 'lighter';

        if (this.useShadow) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15 * this.resolutionScale * 0.8;
        }

        ctx.globalAlpha = 1.0;
        ctx.drawImage(this.stampsImage, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

        ctx.restore();
    },

    // --- モード制御 ---
    startGazing: function () {
        if (typeof Input !== 'undefined') Input.reset();
        this.viewScale = 0.6;

        this.isActive = true;
        this.uiAlpha = 1.0;
        this.uiTimer = 0;

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'none';
        this.syncHtmlUiOpacity(1.0);

        // カメラ初期位置 (中央)
        const visibleW = 1000 / this.viewScale;
        const visibleH = 600 / this.viewScale;
        this.camera.x = (this.worldWidth - visibleW) / 2;
        this.camera.y = (this.worldHeight - visibleH) / 2;
        this.clampCamera();

        if (typeof AudioSys !== 'undefined') {
            AudioSys.playBGM('suzumuai', 0.2);
        }

        if (typeof isGameRunning !== 'undefined') isGameRunning = false;
        if (typeof gameLoopId !== 'undefined' && gameLoopId) cancelAnimationFrame(gameLoopId);

        this.loop();
    },

    stopGazing: function () {
        this.isActive = false;
        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'block';
        this.syncHtmlUiOpacity(1.0);

        if (typeof AudioSys !== 'undefined') {
            AudioSys.playBGM('atelier', 0.3);
        }

        if (typeof resetGameFromCraft === 'function') {
            resetGameFromCraft(0);
        }
    },

    loop: function () {
        if (!this.isActive) return;
        Input.update();
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    },

    update: function () {
        if (Input.isJustPressed) {
            this.isDragging = true;
            this.dragStart.x = Input.x;
            this.dragStart.y = Input.y;
            this.uiTimer = 0;
            this.uiAlpha = 1.0;

            if (Input.x > 850 && Input.y > 500) {
                this.stopGazing();
                return;
            }
        }

        if (Input.isDown && this.isDragging) {
            const dx = (Input.x - this.dragStart.x) / this.viewScale;
            const dy = (Input.y - this.dragStart.y) / this.viewScale;
            this.camera.x -= dx;
            this.camera.y -= dy;
            this.dragStart.x = Input.x;
            this.dragStart.y = Input.y;
            this.clampCamera();
        } else {
            this.isDragging = false;
        }

        this.uiTimer++;
        if (this.uiTimer > 180) {
            this.uiAlpha = Math.max(0, this.uiAlpha - 0.05);
        }
        this.syncHtmlUiOpacity(this.uiAlpha);
    },

    syncHtmlUiOpacity: function (alpha) {
        const ids = ['item-counter', 'star-counter', 'hp-counter', 'control-panel'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.opacity = alpha;
                el.style.pointerEvents = alpha > 0.1 ? 'auto' : 'none';
            }
        });
    },

    clampCamera: function () {
        const visibleW = 1000 / this.viewScale;
        const visibleH = 600 / this.viewScale;
        const maxX = Math.max(0, this.worldWidth - visibleW);
        const maxY = Math.max(0, this.worldHeight - visibleH);
        this.camera.x = Math.max(0, Math.min(maxX, this.camera.x));
        this.camera.y = Math.max(0, Math.min(maxY, this.camera.y));
    },

    draw: function () {
        const ctx = canvas.getContext('2d');
        const visibleW = 1000 / this.viewScale;
        const visibleH = 600 / this.viewScale;

        // 1. 夜空と星 (背景)
        if (this.canvas) {
            const sX = this.camera.x * this.resolutionScale;
            const sY = this.camera.y * this.resolutionScale;
            const sW = visibleW * this.resolutionScale;
            const sH = visibleH * this.resolutionScale;
            ctx.drawImage(this.canvas, sX, sY, sW, sH, 0, 0, 1000, 600);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 1000, 600);
        }

        // 2. 山 (中景: 視差スクロール)
        if (this.mountainImage.complete && this.mountainImage.naturalWidth > 0) {
            // 移動距離を少しだけ短くすることで奥行き(密着マルチ)を表現
            const parallaxFactor = 0.9;
            const px = this.camera.x * parallaxFactor;
            const py = this.camera.y * parallaxFactor;
            ctx.drawImage(this.mountainImage, px, py, visibleW, visibleH, 0, 0, 1000, 600);
        }

        // 3. 森 (近景: 視差スクロール)
        if (this.woodsImage.complete && this.woodsImage.naturalWidth > 0) {
            // 移動倍率を0.7に下げて、動きをさらに抑制
            const parallaxFactor = 0.7;
            const px = this.camera.x * parallaxFactor;
            const py = this.camera.y * parallaxFactor;
            ctx.drawImage(this.woodsImage, px, py, visibleW, visibleH, 0, 0, 1000, 600);
        }

        // 4. キャラクター (前面)
        this.drawCharacters(ctx);

        if (this.uiAlpha > 0) {
            ctx.globalAlpha = this.uiAlpha;
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.roundRect(860, 520, 120, 60, 30);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = "800 20px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            ctx.fillText(`ほしぞらのあかるさ：${totalConsumedStars}`, 500, 505);
            ctx.restore();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("もどる", 920, 550);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fff';
            ctx.fillText("ドラッグで夜空を見渡せます", 20, 570);
            ctx.globalAlpha = 1.0;
        }
    },

    drawCharacters: function (ctx) {
        if (this.charImage.complete && this.charImage.naturalWidth > 0) {
            const imgW = this.charImage.naturalWidth * 0.5;
            const imgH = this.charImage.naturalHeight * 0.5;
            const x = 50;
            const y = 600 - imgH;
            ctx.drawImage(this.charImage, x, y, imgW, imgH);
        } else {
            ctx.fillStyle = '#1a237e';
            ctx.beginPath();
            ctx.ellipse(500, 700, 600, 200, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d32f2f';
            ctx.beginPath();
            ctx.arc(450, 530, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f48fb1';
            ctx.beginPath();
            ctx.arc(520, 535, 23, 0, Math.PI * 2);
            ctx.fill();
        }
    }
};