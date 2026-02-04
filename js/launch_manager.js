/* ------------------------------------------------------------
   FILE: launch_manager.js (Image Assets Ver.) - Single Draw Call
   ------------------------------------------------------------ */

/**
 * --- Launch Images: 画像リソース管理 ---
 */
const LaunchImages = {
    loaded: false,
    path: 'image/launch_image/',

    bg: new Image(),
    cardBg: new Image(),
    bgPrepare: new Image(),

    // 星玉
    balls: {
        base: [],
        mask: []
    },

    // 色選択ボタン
    colorBtns: {},

    // 各種アニメ
    launchPad: [],
    starRise: [],
    fireworks: {
        s: [], m: [], l: []
    },

    load: function () {
        if (this.loaded) return;

        const setSrc = (img, name) => {
            img.src = this.path + name;
        };

        setSrc(this.bg, 'bg_launch.png');
        setSrc(this.bgPrepare, 'bg_launch_prepare.png');
        setSrc(this.cardBg, 'card_bg.png');

        // 星玉画像 (0:S, 1:M, 2:L)
        const sizes = ['s', 'm', 'l'];
        this.balls.base = [];
        this.balls.mask = [];

        for (let i = 0; i < 3; i++) {
            const b = new Image();
            setSrc(b, `ball_base_${sizes[i]}.png`);
            this.balls.base.push(b);

            const m = new Image();
            setSrc(m, `ball_color_${sizes[i]}.png`);
            this.balls.mask.push(m);
        }

        // 色ボタン
        const colors = [
            { code: '#ffffff', name: 'white' },
            { code: '#ff5252', name: 'red' },
            { code: '#448aff', name: 'blue' },
            { code: '#e040fb', name: 'purple' },
            { code: '#69f0ae', name: 'green' }
        ];

        colors.forEach(c => {
            const img = new Image();
            setSrc(img, `btn_color_${c.name}.png`);
            this.colorBtns[c.code] = img;
        });

        // 発射台 (1-7)
        this.launchPad = [];
        for (let i = 1; i <= 7; i++) {
            const img = new Image();
            setSrc(img, `launch_pad_0${i}.png`);
            this.launchPad.push(img);
        }

        // 上昇アニメ (1-3)
        this.starRise = [];
        for (let i = 1; i <= 3; i++) {
            const img = new Image();
            setSrc(img, `star_rise_0${i}.png`);
            this.starRise.push(img);
        }

        // 花火 (S/M/L, 1-6)
        ['s', 'm', 'l'].forEach(size => {
            this.fireworks[size] = [];
            for (let i = 1; i <= 6; i++) {
                const img = new Image();
                setSrc(img, `firework_${size}_0${i}.png`);
                this.fireworks[size].push(img);
            }
        });

        this.loaded = true;
    }
};

/**
 * --- Launch Manager: うちあげミニゲーム ---
 */
const LaunchManager = {
    isActive: false,
    state: 'select_type', // select_type, launch_pad_anim, select_pos, animation

    // 選択データ
    stockList: [],
    selectedColor: '#ffffff',
    costs: [10, 50, 100],

    // 色塗り用オフスクリーンキャンバス
    tintCanvas: null,
    tintCtx: null,

    // UI定義
    ui: {
        sizes: [
            { x: 50, y: 158, w: 140, h: 200, label: "10星玉", cost: 10 },
            { x: 210, y: 158, w: 140, h: 200, label: "50星玉", cost: 50 },
            { x: 370, y: 158, w: 140, h: 200, label: "100星玉", cost: 100 }
        ],
        colors: [
            { code: '#ffffff', x: 100, y: 460, r: 25 }, // 白
            { code: '#ff5252', x: 180, y: 460, r: 25 }, // 赤
            { code: '#448aff', x: 260, y: 460, r: 25 }, // 青
            { code: '#e040fb', x: 340, y: 460, r: 25 }, // 紫
            { code: '#69f0ae', x: 420, y: 460, r: 25 }  // 緑
        ],
        btnCancel: { x: 800, y: 510, w: 150, h: 60, text: "やめる" },
        btnOk: { x: 800, y: 430, w: 150, h: 60, text: "おっけー" },
        btnBack: { x: 630, y: 430, w: 150, h: 60, text: "1つもどる" },
        btnLaunch: { x: 800, y: 430, w: 150, h: 60, text: "うちあげ" }
    },

    camera: { x: 0, y: 0 },
    cursor: { gx: 0, gy: 0 },

    animTimer: 0,
    launchIndex: 0,
    launchedItems: [],

    // フラッシュ演出用
    flashAlpha: 0,
    hasDrawnStar: false,

    start: function () {
        if (typeof Input !== 'undefined') Input.reset();
        LaunchImages.load();
        if (typeof SkyManager === 'undefined' || !SkyManager.isLoaded) {
            SkyManager.init();
        }

        // SEとBGMロード
        if (typeof AudioSys !== 'undefined') {
            AudioSys.loadBGM('se_launch', 'sounds/firework_launch.mp3');
            AudioSys.loadBGM('se_firework', 'sounds/firework.mp3');
            AudioSys.loadBGM('se_firework_s', 'sounds/firework_s.mp3');
            AudioSys.loadBGM('se_firework_m', 'sounds/firework_m.mp3');
            AudioSys.loadBGM('suzumuai', 'sounds/suzumuai.mp3');
        }

        // うちあげ時はズームアウト
        SkyManager.viewScale = 0.5;

        // 色塗り用Canvas初期化
        if (!this.tintCanvas) {
            this.tintCanvas = document.createElement('canvas');
            this.tintCanvas.width = 200; // 十分なサイズ
            this.tintCanvas.height = 200;
            this.tintCtx = this.tintCanvas.getContext('2d');
        }

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'none';

        this.isActive = true;
        this.state = 'select_type';
        this.stockList = [];
        this.selectedColor = '#ffffff';
        this.launchedItems = [];
        this.flashAlpha = 0;
        this.fadeAlpha = 0; // 暗転用
        this.toggleHtmlUi(true); // 初期状態は表示

        const visibleW = 1000 / SkyManager.viewScale;
        const visibleH = 600 / SkyManager.viewScale;
        this.camera.x = (SkyManager.worldWidth - visibleW) / 2;
        this.camera.y = (SkyManager.worldHeight - visibleH) / 2;
        this.clampCamera();

        if (typeof isGameRunning !== 'undefined') isGameRunning = false;
        if (typeof gameLoopId !== 'undefined' && gameLoopId) cancelAnimationFrame(gameLoopId);

        this.loop();
    },

    stop: function () {
        this.isActive = false;

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'block';

        if (this.state === 'select_type' || this.state === 'select_pos') {
            let refund = 0;
            this.stockList.forEach(item => {
                refund += this.costs[item.size];
            });
            if (refund > 0 && typeof totalStarCount !== 'undefined') {
                totalStarCount += refund;
                if (typeof updateScoreDisplay === 'function') updateScoreDisplay();
            }
        }

        // BGMをatelier_bgm1に戻す
        if (typeof AudioSys !== 'undefined') {
            AudioSys.playBGM('atelier_bgm1', 0.5);
        }

        this.toggleHtmlUi(true); // UIを戻す

        // ★デモ終了判定 (1回のみ: 300以上)
        if (!hasSeenDemoEnd && typeof totalConsumedStars !== 'undefined' && totalConsumedStars >= 300) {
            const screenDemoEnd = document.getElementById('screen-demo-end');
            if (screenDemoEnd) {
                hasSeenDemoEnd = true; // フラグを立てる
                if (typeof DataManager !== 'undefined') DataManager.save(); // セーブ
                screenDemoEnd.style.display = 'flex'; // 表示
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
        // アニメーション中はキャンセル不可
        if (this.state !== 'animation' && this.state !== 'launch_pad_anim') {
            if (this.checkBtn(this.ui.btnCancel)) {
                this.stop();
                return;
            }
        }

        // フラッシュフェードアウト
        if (this.flashAlpha > 0) {
            this.flashAlpha = Math.max(0, this.flashAlpha - 0.01); // 約80フレームで消える
        }

        // ズームアニメーション (打ち上げ中のみ)
        if (this.state === 'animation' && this.zoomTimer < this.zoomDuration) {
            this.zoomTimer++;
            const progress = Math.min(1.0, this.zoomTimer / this.zoomDuration);

            // easeOutQuad で減速しながらズームアウト
            const eased = 1 - Math.pow(1 - progress, 2);
            const oldScale = SkyManager.viewScale;
            SkyManager.viewScale = this.zoomStartScale + (this.zoomEndScale - this.zoomStartScale) * eased;

            // カメラ位置を中央基準で再計算
            this.camera.x = this.zoomCenterX - (1000 / SkyManager.viewScale) / 2;
            this.camera.y = this.zoomCenterY - (600 / SkyManager.viewScale) / 2;
            this.clampCamera();
        }

        if (this.state === 'select_type') {
            this.updateSelectType();
        } else if (this.state === 'launch_pad_anim') {
            this.updateLaunchPadAnim();
        } else if (this.state === 'select_pos') {
            this.updateSelectPos();
        } else if (this.state === 'animation') {
            this.updateAnimation();
        } else if (this.state === 'fade_out') {
            this.updateFadeOut();
        }
    },

    updateFadeOut: function () {
        this.fadeAlpha += 0.02; // フェードアウト速度
        if (this.fadeAlpha >= 1.0) {
            this.fadeAlpha = 1.0;
            this.stop();
        }
    },

    updateSelectType: function () {
        if (Input.isJustPressed) {
            // 星玉選択
            for (let i = 0; i < this.ui.sizes.length; i++) {
                const b = this.ui.sizes[i];
                if (this.hitTest(b.x, b.y, b.w, b.h)) {
                    if (totalStarCount >= b.cost) {
                        this.stockList.push({
                            size: i,
                            color: this.selectedColor,
                            gx: null, gy: null, placed: false
                        });
                        totalStarCount -= b.cost;
                        if (typeof updateScoreDisplay === 'function') updateScoreDisplay();
                        AudioSys.playTone(800, 'sine', 0.1);
                    } else {
                        AudioSys.playTone(200, 'sawtooth', 0.2);
                    }
                }
            }
            // 色選択
            for (let i = 0; i < this.ui.colors.length; i++) {
                const c = this.ui.colors[i];
                const dx = Input.x - c.x;
                const dy = Input.y - c.y;
                if (dx * dx + dy * dy < c.r * c.r) {
                    this.selectedColor = c.code;
                    AudioSys.playTone(1000, 'sine', 0.05);
                }
            }

            if (this.stockList.length > 0) {
                // OKボタン
                if (this.checkBtn(this.ui.btnOk)) {
                    this.state = 'select_pos';
                    this.toggleHtmlUi(false); // 場所選択モードに入ったらUIを隠す
                    AudioSys.playTone(1200, 'sine', 0.1);
                }
                // 1つもどるボタン
                if (this.checkBtn(this.ui.btnBack)) {
                    const removed = this.stockList.pop();
                    if (removed) {
                        totalStarCount += this.costs[removed.size];
                        if (typeof updateScoreDisplay === 'function') updateScoreDisplay();
                        AudioSys.playTone(400, 'sine', 0.1);
                    }
                }
            }
        }
    },

    updateSelectPos: function () {
        if (Input.isDown) {
            const scrollSpeed = 10 / SkyManager.viewScale;
            if (Input.x < 100) this.camera.x -= scrollSpeed;
            if (Input.x > 900) this.camera.x += scrollSpeed;
            if (Input.y < 100) this.camera.y -= scrollSpeed;
            if (Input.y > 500) this.camera.y += scrollSpeed;

            this.clampCamera();
        }

        const wx = (Input.x / SkyManager.viewScale) + this.camera.x;
        const wy = (Input.y / SkyManager.viewScale) + this.camera.y;

        this.cursor.gx = Math.floor(wx / SkyManager.gridSize);
        this.cursor.gy = Math.floor(wy / SkyManager.gridSize);

        if (Input.isJustPressed) {
            const placedItems = this.stockList.filter(it => it.placed);

            // うちあげボタン
            if (placedItems.length > 0 && this.checkBtn(this.ui.btnLaunch)) {
                // ★追加: 累計消費した星の数を加算
                let consumed = 0;
                let refund = 0;
                this.stockList.forEach(it => {
                    if (it.placed) consumed += this.costs[it.size];
                    else refund += this.costs[it.size];
                });
                totalConsumedStars += consumed;

                // 未配置分を返却
                if (refund > 0) {
                    totalStarCount += refund;
                    if (typeof updateScoreDisplay === 'function') updateScoreDisplay();
                }

                // セーブ
                if (typeof DataManager !== 'undefined') DataManager.save();

                // atelier_bgm1をフェードアウト
                if (typeof AudioSys !== 'undefined') {
                    AudioSys.fadeOutBGM(2.0); // 2秒かけてフェードアウト
                    // フェードアウト後にsuzumuaiを再生
                    setTimeout(() => {
                        AudioSys.playBGM('suzumuai', 0.5);
                    }, 2000);
                }
                this.startLaunchPadAnim();
                return;
            }

            // 1つもどるボタン (配置済みを1つキャンセル)
            if (placedItems.length > 0 && this.checkBtn(this.ui.btnBack)) {
                const lastPlaced = [...this.stockList].reverse().find(it => it.placed);
                if (lastPlaced) {
                    lastPlaced.placed = false;
                    lastPlaced.gx = null;
                    lastPlaced.gy = null;
                    AudioSys.playTone(400, 'sine', 0.1);
                }
                return;
            }

            const nextItem = this.stockList.find(it => !it.placed);
            if (nextItem && Input.y < 400) {
                nextItem.gx = this.cursor.gx;
                nextItem.gy = this.cursor.gy;
                nextItem.placed = true;
                AudioSys.playTone(600, 'sine', 0.1);
            }
        }
    },

    // --- 発射台アニメーション (地上) ---
    startLaunchPadAnim: function () {
        this.state = 'launch_pad_anim';
        this.animTimer = 0;
        this.launchIndex = 0;
        this.launchedItems = this.stockList.filter(it => it.placed);
    },

    updateLaunchPadAnim: function () {
        this.animTimer++;

        const frameDur = 5;
        const totalFrames = 7;
        const oneShotDur = frameDur * totalFrames;

        const currentShotTime = this.animTimer % Math.ceil(oneShotDur);

        // 鳴るタイミングを約0.2秒（12フレーム）早くする (35 - 12 = 23)
        if (currentShotTime === 23 && this.launchIndex < this.launchedItems.length) {
            AudioSys.playSE('se_launch', 0.6);
        }

        if (this.animTimer >= Math.ceil(oneShotDur)) {
            this.animTimer = 0;
            this.launchIndex++;
        }

        if (this.launchIndex >= this.launchedItems.length) {
            this.startAnimation();
        }
    },

    clampCamera: function () {
        const visibleW = 1000 / SkyManager.viewScale;
        const visibleH = 600 / SkyManager.viewScale;

        const maxX = Math.max(0, SkyManager.worldWidth - visibleW);
        const maxY = Math.max(0, SkyManager.worldHeight - visibleH);

        this.camera.x = Math.max(0, Math.min(maxX, this.camera.x));
        this.camera.y = Math.max(0, Math.min(maxY, this.camera.y));
    },

    startAnimation: function () {
        this.state = 'animation';
        this.animTimer = 0;
        this.launchIndex = 0;
        // launchedItems は startLaunchPadAnim で生成済みなのでそのまま使用

        this.animPhase = 0; // 0:Init, 1:Rise, 2:Explode
        this.animY = 0;
        this.hasDrawnStar = false;
        this.flashAlpha = 0;

        // ズームアニメーション用
        this.zoomTimer = 0;
        this.zoomStartScale = 0.55; // 最初はズームイン (0.55倍)
        this.zoomEndScale = 0.5;   // 最終的なズーム
        this.zoomDuration = 300;   // 5秒 (60fps × 5)

        // 画面中央の座標を記録
        const centerWorldX = this.camera.x + (1000 / SkyManager.viewScale) / 2;
        const centerWorldY = this.camera.y + (600 / SkyManager.viewScale) / 2;
        this.zoomCenterX = centerWorldX;
        this.zoomCenterY = centerWorldY;

        SkyManager.viewScale = this.zoomStartScale;

        // カメラ位置を中央基準で再計算
        this.camera.x = this.zoomCenterX - (1000 / SkyManager.viewScale) / 2;
        this.camera.y = this.zoomCenterY - (600 / SkyManager.viewScale) / 2;
        this.clampCamera();

        // BGMフェードアウトフラグをリセット
        this.bgmFadedOut = false;
    },

    updateAnimation: function () {
        const currentItem = this.launchedItems[this.launchIndex];
        if (!currentItem) {
            this.animTimer++;
            if (this.animTimer > 60) {
                // 打ち上げ終了時にsuzumuaiをフェードアウト
                if (typeof AudioSys !== 'undefined' && !this.bgmFadedOut) {
                    AudioSys.fadeOutBGM(2.0);
                    this.bgmFadedOut = true;
                }
                if (this.animTimer > 180) { // フェードアウト後、少し待って暗転開始
                    this.state = 'fade_out';
                }
            }
            return;
        }

        const targetX = (currentItem.gx * SkyManager.gridSize);
        const targetY = (currentItem.gy * SkyManager.gridSize);

        // フェーズ0: 初期化
        if (this.animPhase === 0) {
            const visibleH = 600 / SkyManager.viewScale;
            this.animStartY = this.camera.y + visibleH + 100;
            this.animY = this.animStartY;
            this.animTargetY = targetY;
            this.animProgress = 0;
            this.animPhase = 1;
            this.hasDrawnStar = false;
        }

        // フェーズ1: 上昇 (減速イージング付き)
        if (this.animPhase === 1) {
            // 進行度を更新 (0.0 ~ 1.0)
            const progressSpeed = 0.015; // 進行速度を遅く調整
            this.animProgress += progressSpeed;

            if (this.animProgress >= 1.0) {
                this.animProgress = 1.0;
            }

            // イージング関数: easeOutSine (なだらかな減速カーブ)
            // 最後まで速度が0にならず、滑らかに減速
            const eased = Math.sin((this.animProgress * Math.PI) / 2);

            // イージングを適用した位置を計算
            this.animY = this.animStartY + (this.animTargetY - this.animStartY) * eased;

            // 目標地点の95%に到達したら花火を開く（速度を保ったまま）
            if (this.animProgress >= 0.95) {
                this.animY = targetY;
                this.animPhase = 2;
                this.animSubTimer = 0;
            }
        }

        // フェーズ2: 爆発（花火）
        if (this.animPhase === 2) {
            this.animSubTimer++;
            const frameDur = 7.5;
            const totalFrames = 6;

            // 花火開始から約0.13秒後 (2フレーム目開始時)
            if (!this.hasDrawnStar && this.animSubTimer >= frameDur * 1) {
                // 1回呼び出しに戻す（SkyManager側で生成量を調整済み）
                SkyManager.drawCluster(currentItem.gx, currentItem.gy, currentItem.size, currentItem.color);

                this.hasDrawnStar = true;
                this.flashAlpha = 0.8;

                let seName = 'se_firework'; // デフォルト (大: size=2)
                if (currentItem.size === 0) seName = 'se_firework_s'; // 小
                else if (currentItem.size === 1) seName = 'se_firework_m'; // 中

                AudioSys.playSE(seName, 0.7);
            }

            // 花火アニメ終了
            if (this.animSubTimer >= frameDur * totalFrames) {
                // 次へ
                this.launchIndex++;
                this.animPhase = 0;
            }
        }
    },

    draw: function () {
        const ctx = canvas.getContext('2d');

        if (this.state === 'select_type') {
            this.drawSelectType(ctx);
        } else if (this.state === 'launch_pad_anim') {
            this.drawLaunchPadAnim(ctx);
        } else if (this.state === 'select_pos' || this.state === 'animation' || this.state === 'fade_out') {
            this.drawMapMode(ctx);
        }

        // フラッシュエフェクト描画 (全ステート共通で上書き)
        if (this.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
            ctx.fillRect(0, 0, 1000, 600);
        }

        // 暗転描画 (最前面)
        if (this.fadeAlpha > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
            ctx.fillRect(0, 0, 1000, 600);
        }

        if (this.state !== 'animation' && this.state !== 'launch_pad_anim' && this.state !== 'fade_out') {
            this.drawBtn(ctx, this.ui.btnCancel, '#ff6b6b');
        }
    },

    drawTintedBall: function (ctx, x, y, sizeIndex, color, w, h) {
        if (!this.tintCtx) return;

        const maskImg = LaunchImages.balls.mask[sizeIndex];
        const baseImg = LaunchImages.balls.base[sizeIndex];

        if (!maskImg || !baseImg) return;
        if (!maskImg.complete || !baseImg.complete) return;

        this.tintCtx.clearRect(0, 0, w, h);
        this.tintCtx.drawImage(maskImg, 0, 0, w, h);

        this.tintCtx.globalCompositeOperation = 'source-in';
        this.tintCtx.fillStyle = color;
        this.tintCtx.fillRect(0, 0, w, h);

        this.tintCtx.globalCompositeOperation = 'source-over';

        ctx.drawImage(baseImg, x, y, w, h);
        ctx.drawImage(this.tintCanvas, 0, 0, w, h, x, y, w, h);
    },

    drawSelectType: function (ctx) {
        if (LaunchImages.bg.complete) {
            ctx.drawImage(LaunchImages.bg, 0, 0, 1000, 600);
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, 1000, 600);
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 8;
        ctx.strokeText("うちあげ じゅんび", 500, 60);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText("うちあげ じゅんび", 500, 60);
        ctx.restore();

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = "900 20px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("うちあげたい星玉をえらんで　おっけーを押そう", 500, 135);

        this.ui.sizes.forEach((b, i) => {
            const canBuy = (totalStarCount >= b.cost);

            if (LaunchImages.cardBg.complete) {
                if (!canBuy) ctx.globalAlpha = 0.5;
                const cardScale = 1.05;
                const cw = b.w * cardScale;
                const ch = b.h * cardScale;
                const cx = b.x - (cw - b.w) / 2;
                const cy = b.y - (ch - b.h) / 2;
                ctx.drawImage(LaunchImages.cardBg, cx, cy, cw, ch);
                ctx.globalAlpha = 1.0;
            } else {
                ctx.fillStyle = canBuy ? '#fff' : '#555';
                ctx.beginPath();
                ctx.roundRect(b.x, b.y, b.w, b.h, 20);
                ctx.fill();
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 5;
                ctx.stroke();
            }

            ctx.fillStyle = canBuy ? '#5d4037' : '#888';
            ctx.font = "900 28px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(b.label, b.x + b.w / 2, b.y + 35);
            ctx.font = "900 24px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(`星 ${b.cost}個`, b.x + b.w / 2, b.y + 175);

            const ballSize = 140;
            const bx = b.x + b.w / 2 - ballSize / 2;
            const by = b.y + 105 - ballSize / 2;

            this.drawTintedBall(ctx, bx, by, i, this.selectedColor, ballSize, ballSize);
        });

        this.ui.colors.forEach((c) => {
            const btnImg = LaunchImages.colorBtns[c.code];
            const size = 64;
            const cx = c.x - size / 2;
            const cy = c.y - size / 2;

            if (btnImg && btnImg.complete) {
                ctx.drawImage(btnImg, cx, cy, size, size);
            } else {
                ctx.fillStyle = c.code;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
            }

            if (this.selectedColor === c.code) {
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(c.x - 12, c.y - 55);
                ctx.lineTo(c.x + 12, c.y - 55);
                ctx.lineTo(c.x, c.y - 43);
                ctx.fill();
            }
        });

        this.drawStockList(ctx);

        if (this.stockList.length > 0) {
            this.drawBtn(ctx, this.ui.btnOk, '#4ecdc4');
            this.drawBtn(ctx, this.ui.btnBack, '#ffaa00');
        }
    },

    drawLaunchPadAnim: function (ctx) {
        const bg = LaunchImages.bgPrepare.complete ? LaunchImages.bgPrepare : LaunchImages.bg;
        if (bg.complete) {
            ctx.drawImage(bg, 0, 0, 1000, 600);
        } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, 1000, 600);
        }

        const padImgs = LaunchImages.launchPad;
        if (padImgs.length > 0) {
            let frameIndex = 0;
            if (this.launchIndex < this.launchedItems.length) {
                const frameDur = 5;
                const totalFrames = 7;
                const animTime = this.animTimer % Math.ceil(frameDur * totalFrames);
                frameIndex = Math.floor(animTime / frameDur);
                if (frameIndex >= padImgs.length) frameIndex = padImgs.length - 1;
            } else {
                frameIndex = 0;
            }

            const img = padImgs[frameIndex];
            if (img && img.complete) {
                ctx.drawImage(img, 100, 0, 800, 600);
            }
        }
    },

    drawStockList: function (ctx) {
        const lx = 550, ly = 158, lw = 400, lh = 230;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.roundRect(lx, ly, lw, lh, 10);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.font = "900 24px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("選んだ星玉", lx + 20, ly + 40);

        let iconX = lx + 30;
        let iconY = ly + 80;
        for (let i = 0; i < this.stockList.length; i++) {
            const item = this.stockList[i];
            const iconSize = 72;
            this.drawTintedBall(ctx, iconX - iconSize / 2, iconY - iconSize / 2, item.size, item.color, iconSize, iconSize);

            iconX += 50;
            if (iconX > lx + lw - 40) {
                iconX = lx + 30;
                iconY += 55;
            }
            if (iconY > ly + lh - 20) break;
        }
    },

    drawMapMode: function (ctx) {
        if (SkyManager.canvas) {
            const sScale = SkyManager.resolutionScale;
            const vScale = SkyManager.viewScale;

            const sWidth = (1000 / vScale) * sScale;
            const sHeight = (600 / vScale) * sScale;
            const sX = (this.camera.x) * sScale;
            const sY = (this.camera.y) * sScale;

            ctx.drawImage(
                SkyManager.canvas,
                sX, sY, sWidth, sHeight,
                0, 0, 1000, 600
            );
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 1000, 600);
        }

        if (SkyManager.mountainImage.complete && SkyManager.mountainImage.naturalWidth > 0) {
            const visibleW = 1000 / SkyManager.viewScale;
            const visibleH = 600 / SkyManager.viewScale;
            ctx.drawImage(
                SkyManager.mountainImage,
                this.camera.x, this.camera.y, visibleW, visibleH,
                0, 0, 1000, 600
            );
        }

        if (SkyManager.woodsImage.complete && SkyManager.woodsImage.naturalWidth > 0) {
            const visibleW = 1000 / SkyManager.viewScale;
            const visibleH = 600 / SkyManager.viewScale;
            ctx.drawImage(
                SkyManager.woodsImage,
                this.camera.x, this.camera.y, visibleW, visibleH,
                0, 0, 1000, 600
            );
        }

        if (this.state === 'select_pos') {
            this.stockList.forEach(it => {
                if (it.placed) {
                    const px = (it.gx * SkyManager.gridSize - this.camera.x) * SkyManager.viewScale;
                    const py = (it.gy * SkyManager.gridSize - this.camera.y) * SkyManager.viewScale;

                    let radius = 1;
                    if (it.size === 1) radius = 2;
                    if (it.size === 2) radius = 4;
                    const size = (radius * 2 + 1) * SkyManager.gridSize * SkyManager.viewScale;
                    const offset = radius * SkyManager.gridSize * SkyManager.viewScale;

                    ctx.strokeStyle = it.color;
                    ctx.lineWidth = 4;
                    ctx.strokeRect(px - offset, py - offset, size, size);
                    ctx.fillStyle = it.color;
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(px - offset, py - offset, size, size);
                    ctx.globalAlpha = 1.0;
                }
            });

            const nextItem = this.stockList.find(it => !it.placed);
            if (nextItem) {
                const sx = (this.cursor.gx * SkyManager.gridSize - this.camera.x) * SkyManager.viewScale;
                const sy = (this.cursor.gy * SkyManager.gridSize - this.camera.y) * SkyManager.viewScale;

                let radius = 1;
                if (nextItem.size === 1) radius = 2;
                if (nextItem.size === 2) radius = 4;

                const size = (radius * 2 + 1) * SkyManager.gridSize * SkyManager.viewScale;
                const offset = radius * SkyManager.gridSize * SkyManager.viewScale;

                ctx.strokeStyle = nextItem.color;
                ctx.lineWidth = 4;
                ctx.strokeRect(sx - offset, sy - offset, size, size);
                ctx.fillStyle = nextItem.color;
                ctx.globalAlpha = 0.3;
                ctx.fillRect(sx - offset, sy - offset, size, size);
                ctx.globalAlpha = 1.0;

                this.drawSpeechBubble(ctx, "どこにうちあげよう？");

                // 次に配置する星玉を画面下中央（音量ボタンの上）に表示
                const bSize = 80;
                const bx = 500 - bSize / 2;
                const by = 440; // 音量ボタンの上あたり
                this.drawTintedBall(ctx, bx, by, nextItem.size, nextItem.color, bSize, bSize);

                // 星玉の名前をラベルとして表示
                const label = this.ui.sizes[nextItem.size].label;
                ctx.save();
                ctx.fillStyle = "#fff";
                ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "rgba(0,0,0,0.8)";
                ctx.shadowBlur = 4;
                ctx.fillText(label, bx + bSize - 5, by + bSize / 2);
                ctx.restore();
            } else {
                this.drawSpeechBubble(ctx, "うちあげボタンをおしてね！");
            }

            if (this.stockList.some(it => it.placed)) {
                this.drawBtn(ctx, this.ui.btnLaunch, '#4ecdc4');
                this.drawBtn(ctx, this.ui.btnBack, '#ffaa00');
            }
        }

        if (this.state === 'animation') {
            this.drawAnimationEffect(ctx);
        }
    },

    drawAnimationEffect: function (ctx) {
        const currentItem = this.launchedItems[this.launchIndex];
        if (!currentItem) return;

        if (this.animPhase === 1) {
            const tx = (currentItem.gx * SkyManager.gridSize - this.camera.x + SkyManager.gridSize / 2) * SkyManager.viewScale;
            const vy = (this.animY - this.camera.y) * SkyManager.viewScale;

            const riseImgs = LaunchImages.starRise;
            if (riseImgs.length > 0) {
                const frameIndex = Math.floor((Date.now() / 1000 * 12) % 3);
                const img = riseImgs[frameIndex];

                if (img && img.complete) {
                    const w = img.naturalWidth;
                    const h = img.naturalHeight;
                    ctx.drawImage(img, tx - w / 2, vy - h / 2);
                }
            }
        } else if (this.animPhase === 2) {
            const tx = (currentItem.gx * SkyManager.gridSize - this.camera.x + SkyManager.gridSize / 2) * SkyManager.viewScale;
            const ty = (currentItem.gy * SkyManager.gridSize - this.camera.y + SkyManager.gridSize / 2) * SkyManager.viewScale;

            const sizeKey = ['s', 'm', 'l'][currentItem.size];
            const fwImgs = LaunchImages.fireworks[sizeKey];

            if (fwImgs && fwImgs.length > 0) {
                const frameDur = 7.5;
                let frameIndex = Math.floor(this.animSubTimer / frameDur);
                if (frameIndex >= fwImgs.length) frameIndex = fwImgs.length - 1;

                const img = fwImgs[frameIndex];
                if (img && img.complete) {
                    let fwScale = 0.5;
                    if (currentItem.size === 1) fwScale = 0.42; // 中サイズを少し小さく
                    if (currentItem.size === 2) fwScale = 0.38; // 大サイズを少し小さく

                    const w = img.naturalWidth * fwScale;
                    const h = img.naturalHeight * fwScale;
                    ctx.drawImage(img, tx - w / 2, ty - h / 2, w, h);
                }
            }
        }
    },

    checkBtn: function (btn) {
        if (Input.isJustPressed) {
            return this.hitTest(btn.x, btn.y, btn.w, btn.h);
        }
        return false;
    },
    hitTest: function (x, y, w, h) {
        return (Input.x >= x && Input.x <= x + w && Input.y >= y && Input.y <= y + h);
    },
    drawBtn: function (ctx, btn, color) {
        let shadowColor = '#36b0a8';
        if (color === '#ff6b6b') shadowColor = '#d64545';
        else if (color === '#ffaa00') shadowColor = '#cc8800';

        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.roundRect(btn.x, btn.y + 5, btn.w, btn.h, 30);
        ctx.fill();

        ctx.fillStyle = color || '#4ecdc4';
        ctx.beginPath();
        ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 30);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = "800 20px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btn.text, btn.x + btn.w / 2, btn.y + btn.h / 2);
    },
    drawSpeechBubble: function (ctx, text) {
        const x = 20, y = 480, w = 350, h = 80;
        ctx.save();
        ctx.translate(x, y);
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 30);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        const tailX = w * 0.7;
        ctx.moveTo(tailX, h - 3);
        ctx.quadraticCurveTo(tailX + 10, h + 20, tailX + 20, h - 3);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX - 2, h - 1);
        ctx.quadraticCurveTo(tailX + 10, h + 24, tailX + 22, h - 1);
        ctx.stroke();

        ctx.fillStyle = '#555';
        ctx.font = "800 22px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 2);
        ctx.restore();
    },

    toggleHtmlUi: function (visible) {
        const ids = ['item-counter', 'star-counter', 'hp-counter'];
        const disp = visible ? '' : 'none'; // '' ならCSSの指定(flex等)が適用される
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = disp;
        });
    }
};