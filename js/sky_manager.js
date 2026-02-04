/* ------------------------------------------------------------
   FILE: sky_manager.js (Watching Together Ver.)
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
    charImage2: new Image(), // ★追加: しろまいまい
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
    isWatchingTogether: false, // ★追加: 二人で見るフラグ

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
        const totalImages = 6; // 5枚から6枚へ変更

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

        this.stampsImage.src = 'image/sky/star_stamps_h.png';
        this.stampsImage.onload = checkLoad;
        this.stampsImage.onerror = checkLoad;

        this.bgImage.src = 'image/sky/bg_sky.jpg';
        this.bgImage.onload = checkLoad;
        this.bgImage.onerror = () => { console.warn("no bg image"); checkLoad(); };

        this.mountainImage.src = 'image/sky/bg_mountain.png';
        this.mountainImage.onload = checkLoad;
        this.mountainImage.onerror = () => { console.warn("no mountain image"); checkLoad(); };

        this.woodsImage.src = 'image/sky/bg_Woods.png';
        this.woodsImage.onload = checkLoad;
        this.woodsImage.onerror = () => { console.warn("no woods image"); checkLoad(); };

        this.charImage.src = 'image/sky/maimai_watching.png';
        this.charImage.onload = checkLoad;
        this.charImage.onerror = () => { console.warn("no char image"); checkLoad(); };

        // ★追加: しろまいまい画像
        this.charImage2.src = 'image/sky/shiromaimai_watching.png';
        this.charImage2.onload = checkLoad;
        this.charImage2.onerror = () => { console.warn("no char image 2"); checkLoad(); };
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
        if (this.pendingLoadData) {
            return this.pendingLoadData;
        }
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

                if (densityIndex === 0 && Math.random() < 0.66) densityIndex = 1;
                else if (densityIndex === 1 && Math.random() < 0.66) densityIndex = 2;

                if (densityIndex === 2 && Math.random() < 0.2) continue;

                this.drawStampAtGrid(gridX + dx, gridY + dy, densityIndex, color);

                if (densityIndex === 0 && Math.random() < 0.5) {
                    this.drawStampAtGrid(gridX + dx, gridY + dy, densityIndex, color);
                }
            }
        }

        const spikeCount = 3 + Math.floor(Math.random() * 3); 
        for (let i = 0; i < spikeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spikeLen = radius + 2 + Math.floor(Math.random() * 3);

            for (let d = radius + 1; d <= spikeLen; d++) {
                const ox = Math.round(Math.cos(angle) * d);
                const oy = Math.round(Math.sin(angle) * d);
                if (Math.random() < 0.8) {
                    const spikeDensity = (Math.random() < 0.2) ? 1 : 2;
                    this.drawStampAtGrid(gridX + ox, gridY + oy, spikeDensity, color);
                }
            }
        }

        const strayCount = 3 + Math.floor(Math.random() * 4); 
        for (let i = 0; i < strayCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = radius * (1.5 + Math.random() * 0.8);
            const sx = Math.round(Math.cos(angle) * dist);
            const sy = Math.round(Math.sin(angle) * dist);
            this.drawStampAtGrid(gridX + sx, gridY + sy, 2, color);
        }

        const farStrayCount = 4 + Math.floor(Math.random() * 5); 
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

        // ★確率判定 (0.8 = 80%)
        this.isWatchingTogether = Math.random() < 0.4;

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'none';
        this.syncHtmlUiOpacity(1.0);

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
            AudioSys.stopBGM();
            AudioSys.playBGM('atelier', 0.3);
        }

        if (!hasSeenDemoEnd && typeof totalConsumedStars !== 'undefined' && totalConsumedStars >= 300) {
            const screenDemoEnd = document.getElementById('screen-demo-end');
            if (screenDemoEnd) {
                hasSeenDemoEnd = true;
                if (typeof DataManager !== 'undefined') DataManager.save();
                screenDemoEnd.style.display = 'flex';
                return;
            }
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

        if (this.mountainImage.complete && this.mountainImage.naturalWidth > 0) {
            const parallaxFactor = 0.9;
            const px = this.camera.x * parallaxFactor;
            const py = this.camera.y * parallaxFactor;
            ctx.drawImage(this.mountainImage, px, py, visibleW, visibleH, 0, 0, 1000, 600);
        }

        if (this.woodsImage.complete && this.woodsImage.naturalWidth > 0) {
            const parallaxFactor = 0.7;
            const px = this.camera.x * parallaxFactor;
            const py = this.camera.y * parallaxFactor;
            ctx.drawImage(this.woodsImage, px, py, visibleW, visibleH, 0, 0, 1000, 600);
        }

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
        // 配置・確率調整用パラメータ
        const config = {
            scale: 0.5,
            baseX: 50,
            baseY: 600,
            offset2X: 150, // 2人目の横位置ずらし
            offset2Y: -213  // 2人目の縦位置ずらし
        };

        // 1人目
        if (this.charImage.complete && this.charImage.naturalWidth > 0) {
            const imgW = this.charImage.naturalWidth * config.scale;
            const imgH = this.charImage.naturalHeight * config.scale;
            const x = config.baseX;
            const y = config.baseY - imgH;
            ctx.drawImage(this.charImage, x, y, imgW, imgH);

            // 2人目 (上レイヤー)
            if (this.isWatchingTogether && this.charImage2.complete && this.charImage2.naturalWidth > 0) {
                const imgW2 = this.charImage2.naturalWidth * config.scale;
                const imgH2 = this.charImage2.naturalHeight * config.scale;
                ctx.drawImage(this.charImage2, x + config.offset2X, config.baseY - imgH2 + config.offset2Y, imgW2, imgH2);
            }
        } else {
            ctx.fillStyle = '#1a237e';
            ctx.beginPath();
            ctx.ellipse(500, 700, 600, 200, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d32f2f';
            ctx.beginPath();
            ctx.arc(450, 530, 25, 0, Math.PI * 2);
            ctx.fill();
            if (this.isWatchingTogether) {
                ctx.fillStyle = '#f48fb1';
                ctx.beginPath();
                ctx.arc(520, 535, 23, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
};