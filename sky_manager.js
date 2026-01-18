/* ------------------------------------------------------------
   FILE: sky_manager.js (Auto Hide UI Ver.)
   ------------------------------------------------------------ */

/**
 * --- Sky Manager: 夜空とキャンバスの管理 ---
 */
const SkyManager = {
    // --- 設定 ---
    worldWidth: 2000,
    worldHeight: 1200,
    gridSize: 32,
    resolutionScale: 2.0, // 高画質化倍率
    viewScale: 0.5,       // デフォルト倍率 (うちあげ用)
    
    // 内部変数
    canvas: null,
    ctx: null,
    stampsImage: new Image(),
    bgImage: new Image(),
    mountainImage: new Image(),
    charImage: new Image(),
    isLoaded: false,

    // ほしを見るモード用
    isActive: false,
    camera: { x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
    isDragging: false,
    uiAlpha: 1.0,
    uiTimer: 0,

    init: function () {
        if (this.canvas) return;

        // 裏画面（オフスクリーンキャンバス）
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.worldWidth * this.resolutionScale;
        this.canvas.height = this.worldHeight * this.resolutionScale;
        this.ctx = this.canvas.getContext('2d');

        // BGMロード
        if (typeof AudioSys !== 'undefined') {
            AudioSys.loadBGM('suzumuai', 'sounds/suzumuai.mp3');
        }

        // 画像ロード管理
        let loadedCount = 0;
        const totalImages = 4;

        const checkLoad = () => {
            loadedCount++;
            if (loadedCount >= totalImages) {
                this.isLoaded = true;
                this.initBackground();
            }
        };

        this.stampsImage.src = 'image/star_stamps_h.png';
        this.stampsImage.onload = checkLoad;
        this.stampsImage.onerror = checkLoad;

        this.bgImage.src = 'image/bg_sky.jpg';
        this.bgImage.onload = checkLoad;
        this.bgImage.onerror = () => {
            console.warn("背景画像(bg_sky.jpg)が見つかりません");
            checkLoad();
        };

        this.mountainImage.src = 'image/bg_mountain.png';
        this.mountainImage.onload = checkLoad;
        this.mountainImage.onerror = () => {
            console.warn("山画像(bg_mountain.png)が見つかりません");
            checkLoad();
        };

        this.charImage.src = 'image/maimai_watching.png';
        this.charImage.onload = checkLoad;
        this.charImage.onerror = () => {
            console.warn("キャラ画像(maimai_watching.png)が見つかりません");
            checkLoad();
        };
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

    // --- 描画命令 ---
    drawCluster: function (gridX, gridY, sizeLevel, color) {
        if (!this.isLoaded) return;

        let radius = 1;
        if (sizeLevel === 1) radius = 2; 
        if (sizeLevel === 2) radius = 4; 

        const ctx = this.ctx;
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

                if (densityIndex === 2 && Math.random() < 0.4) continue;
                if (densityIndex === 1 && Math.random() < 0.1) continue;

                this.drawStampAtGrid(gridX + dx, gridY + dy, densityIndex, color);

                if (densityIndex === 0 && Math.random() < 0.5) {
                    this.drawStampAtGrid(gridX + dx, gridY + dy, densityIndex, color);
                }
            }
        }

        // ステップ2: 拡張
        const spikeCount = 2 + Math.floor(Math.random() * 2); 
        for (let i = 0; i < spikeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spikeLen = radius + 2 + Math.floor(Math.random() * 3);
            
            for (let d = radius + 1; d <= spikeLen; d++) {
                const ox = Math.round(Math.cos(angle) * d);
                const oy = Math.round(Math.sin(angle) * d);
                if (Math.random() < 0.6) {
                    const spikeDensity = (Math.random() < 0.2) ? 1 : 2;
                    this.drawStampAtGrid(gridX + ox, gridY + oy, spikeDensity, color);
                }
            }
        }

        // ステップ3: 飛び地 (近距離)
        const strayCount = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < strayCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = radius * (1.5 + Math.random() * 0.8);
            const sx = Math.round(Math.cos(angle) * dist);
            const sy = Math.round(Math.sin(angle) * dist);
            this.drawStampAtGrid(gridX + sx, gridY + sy, 2, color);
        }

        // ステップ4: 遠方飛び地
        const farStrayCount = 3 + Math.floor(Math.random() * 4);
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
            scale * this.resolutionScale
        );
    },

    drawSingleStamp: function (ctx, x, y, row, col, color, scale) {
        const sw = 64; 
        const sh = 64;
        const sx = col * sw;
        const sy = row * sh;

        const centerOffset = (this.gridSize / 2) * this.resolutionScale;

        ctx.save();
        ctx.translate(x + centerOffset, y + centerOffset);
        
        const angle = Math.floor(Math.random() * 4) * (Math.PI / 2);
        ctx.rotate(angle);
        if (Math.random() < 0.5) ctx.scale(-scale, scale);
        else ctx.scale(scale, scale);

        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = color;
        ctx.shadowBlur = 15 * this.resolutionScale; 
        ctx.globalAlpha = 1.0;

        ctx.drawImage(this.stampsImage, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

        ctx.restore();
    },

    // --- ほしを見るモード ---
    startGazing: function () {
        this.viewScale = 0.6;
        
        this.isActive = true;
        this.uiAlpha = 1.0;
        this.uiTimer = 0;

        // タッチ操作UI（dpad等）は非表示
        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'none';

        // ★追加: HTML UIの初期同期（表示）
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

        // ★追加: HTML UIを必ず表示状態に戻す
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
        // UI操作（やめるボタン）
        if (Input.isJustPressed) {
            this.isDragging = true;
            this.dragStart.x = Input.x;
            this.dragStart.y = Input.y;
            this.uiTimer = 0; // 操作したらタイマーリセット
            this.uiAlpha = 1.0; // UI表示

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

        // UI自動フェードアウト
        this.uiTimer++;
        if (this.uiTimer > 180) { // 3秒経過後
            this.uiAlpha = Math.max(0, this.uiAlpha - 0.05);
        }

        // ★追加: HTML側のUI要素もCanvasのUIAlphaと同期させる
        this.syncHtmlUiOpacity(this.uiAlpha);
    },

    // ★追加: HTML要素の透明度を一括制御するヘルパー関数
    syncHtmlUiOpacity: function(alpha) {
        // 消したいHTML要素のIDリスト
        const ids = ['item-counter', 'star-counter', 'hp-counter', 'control-panel'];
        
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.opacity = alpha;
                // 透明になったらクリックできないようにする（誤操作防止）
                el.style.pointerEvents = alpha > 0.1 ? 'auto' : 'none';
            }
        });
    },

    clampCamera: function() {
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

        // 1. 空 + 星 (裏画面)
        if (this.canvas) {
            const sX = this.camera.x * this.resolutionScale;
            const sY = this.camera.y * this.resolutionScale;
            const sW = visibleW * this.resolutionScale;
            const sH = visibleH * this.resolutionScale;
            
            ctx.drawImage(
                this.canvas,
                sX, sY, sW, sH,   
                0, 0, 1000, 600   
            );
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 1000, 600);
        }

        // 2. 山 (前景)
        if (this.mountainImage.complete && this.mountainImage.naturalWidth > 0) {
            ctx.drawImage(
                this.mountainImage,
                this.camera.x, this.camera.y, visibleW, visibleH,
                0, 0, 1000, 600
            );
        }

        // 3. キャラクター
        this.drawCharacters(ctx);

        // 4. UI (Canvas内)
        if (this.uiAlpha > 0) {
            ctx.globalAlpha = this.uiAlpha;
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.roundRect(860, 520, 120, 60, 30);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
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
        // 画像: サイズ半分・少し右へ
        if (this.charImage.complete && this.charImage.naturalWidth > 0) {
            const imgW = this.charImage.naturalWidth * 0.5;
            const imgH = this.charImage.naturalHeight * 0.5;
            const x = 50; 
            const y = 600 - imgH; 
            ctx.drawImage(this.charImage, x, y, imgW, imgH);
        } else {
            // 仮描画
            ctx.fillStyle = '#1a237e'; 
            ctx.beginPath();
            ctx.ellipse(500, 700, 600, 200, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d32f2f'; 
            ctx.beginPath();
            ctx.arc(450, 530, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(450, 560, 30, 40, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f48fb1'; 
            ctx.beginPath();
            ctx.arc(520, 535, 23, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(520, 565, 28, 38, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
};