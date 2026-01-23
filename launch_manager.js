/* ------------------------------------------------------------
   FILE: launch_manager.js (Image Assets Ver.)
   ------------------------------------------------------------ */

/**
 * --- Launch Images: 画像リソース管理 ---
 */
const LaunchImages = {
    loaded: false,
    path: 'image/launch_image/',

    bg: new Image(),
    cardBg: new Image(),

    // 星玉 (Base: 影や枠 / Mask: 色を塗る部分)
    balls: {
        base: [], // [s, m, l]
        mask: []  // [s, m, l]
    },

    // 色選択ボタン
    colorBtns: {}, // '#ffffff': img, ...

    load: function () {
        if (this.loaded) return;

        const setSrc = (img, name) => {
            img.src = this.path + name;
        };

        setSrc(this.bg, 'bg_launch.png');
        setSrc(this.cardBg, 'card_bg.png');

        // 星玉画像 (0:S, 1:M, 2:L)
        const sizes = ['s', 'm', 'l'];
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

        this.loaded = true;
    }
};

/**
 * --- Launch Manager: うちあげミニゲーム ---
 */
const LaunchManager = {
    isActive: false,
    state: 'select_type', // select_type, select_pos, animation

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
            { x: 50, y: 158, w: 140, h: 200, label: "星玉", cost: 10 },
            { x: 210, y: 158, w: 140, h: 200, label: "5星玉", cost: 50 },
            { x: 370, y: 158, w: 140, h: 200, label: "10星玉", cost: 100 }
        ],
        colors: [
            { code: '#ffffff', x: 100, y: 460, r: 25 }, // 白
            { code: '#ff5252', x: 180, y: 460, r: 25 }, // 赤
            { code: '#448aff', x: 260, y: 460, r: 25 }, // 青
            { code: '#e040fb', x: 340, y: 460, r: 25 }, // 紫
            { code: '#69f0ae', x: 420, y: 460, r: 25 }  // 緑
        ],
        btnCancel: { x: 800, y: 480, w: 150, h: 60, text: "やめる" },
        btnOk: { x: 800, y: 400, w: 150, h: 60, text: "おっけー" },
        btnBack: { x: 630, y: 400, w: 150, h: 60, text: "1つもどる" },
        btnLaunch: { x: 800, y: 400, w: 150, h: 60, text: "うちあげ" }
    },

    camera: { x: 0, y: 0 },
    cursor: { gx: 0, gy: 0 },

    animTimer: 0,
    launchIndex: 0,
    launchedItems: [],

    start: function () {
        LaunchImages.load();
        if (typeof SkyManager === 'undefined' || !SkyManager.isLoaded) {
            SkyManager.init();
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
        if (this.state !== 'animation') {
            if (this.checkBtn(this.ui.btnCancel)) {
                this.stop();
                return;
            }
        }

        if (this.state === 'select_type') {
            this.updateSelectType();
        } else if (this.state === 'select_pos') {
            this.updateSelectPos();
        } else if (this.state === 'animation') {
            this.updateAnimation();
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
                this.startAnimation();
                return;
            }

            // 1つもどるボタン (配置済みを1つキャンセル)
            if (placedItems.length > 0 && this.checkBtn(this.ui.btnBack)) {
                // 最後に配置したものを探す
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
        this.launchedItems = this.stockList.filter(it => it.placed);
    },

    updateAnimation: function () {
        this.animTimer++;
        const currentItem = this.launchedItems[this.launchIndex];
        if (!currentItem) {
            if (this.animTimer > 120) {
                this.stop();
            }
            return;
        }

        const phase = this.animTimer % 100;
        if (phase === 0) {
            AudioSys.playTone(300, 'square', 0.1);
        }
        if (phase === 60) {
            AudioSys.playTone(100, 'noise', 0.5);
            SkyManager.drawCluster(currentItem.gx, currentItem.gy, currentItem.size, currentItem.color);
        }
        if (phase === 99) {
            this.launchIndex++;
            if (this.launchIndex >= this.launchedItems.length) {
                this.animTimer = 0;
            }
        }
    },

    draw: function () {
        const ctx = canvas.getContext('2d');

        if (this.state === 'select_type') {
            this.drawSelectType(ctx);
        } else if (this.state === 'select_pos' || this.state === 'animation') {
            this.drawMapMode(ctx);
        }

        if (this.state !== 'animation') {
            this.drawBtn(ctx, this.ui.btnCancel, '#ff6b6b');
        }
    },

    // 色付きの星玉画像を生成して描画するヘルパー
    drawTintedBall: function (ctx, x, y, sizeIndex, color, w, h) {
        if (!this.tintCtx) return;

        const maskImg = LaunchImages.balls.mask[sizeIndex];
        const baseImg = LaunchImages.balls.base[sizeIndex];

        if (!maskImg || !baseImg) return;
        if (!maskImg.complete || !baseImg.complete) return;

        // 一時キャンバスで色合成
        this.tintCtx.clearRect(0, 0, w, h);

        // 1. マスクを描画
        this.tintCtx.drawImage(maskImg, 0, 0, w, h);

        // 2. 色を塗りつぶし (source-in: 描画されている部分だけ色が残る)
        this.tintCtx.globalCompositeOperation = 'source-in';
        this.tintCtx.fillStyle = color;
        this.tintCtx.fillRect(0, 0, w, h);

        // 3. 合成モードを戻す
        this.tintCtx.globalCompositeOperation = 'source-over';

        // 4. ベース画像を下に敷く、または上に重ねる
        // ここでは「マスク部分に着色して、ベース(影など)を重ねる」想定
        // もしベースが不透明なら順序逆。通常ベースは乗算や半透明影を含む透過PNGと想定。

        // メインキャンバスに描画
        // 1. ベース画像(本体素材など)を先に描画
        ctx.drawImage(baseImg, x, y, w, h);
        // 2. その上から色付き部分を重ねて描画
        ctx.drawImage(this.tintCanvas, 0, 0, w, h, x, y, w, h);
    },

    drawSelectType: function (ctx) {
        // 背景画像
        if (LaunchImages.bg.complete) {
            ctx.drawImage(LaunchImages.bg, 0, 0, 1000, 600);
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, 1000, 600);
        }

        // タイトル
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
        ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("うちあげたい星玉をえらんで　おっけーを押そう", 500, 135);

        // カード描画
        this.ui.sizes.forEach((b, i) => {
            const canBuy = (totalStarCount >= b.cost);

            // カード背景
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

            // テキスト
            ctx.fillStyle = canBuy ? '#5d4037' : '#888';
            ctx.font = "bold 32px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(b.label, b.x + b.w / 2, b.y + 35);
            ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(`星 ${b.cost}個`, b.x + b.w / 2, b.y + 175);

            // 星玉画像描画 (色反映)
            // 画像サイズ 140x140 を想定
            const ballSize = 140;
            const bx = b.x + b.w / 2 - ballSize / 2;
            const by = b.y + 105 - ballSize / 2; // 中心位置(105)に合わせて配置

            // 選択中の色で描画
            this.drawTintedBall(ctx, bx, by, i, this.selectedColor, ballSize, ballSize);
        });

        // 色ボタン描画
        this.ui.colors.forEach((c) => {
            const btnImg = LaunchImages.colorBtns[c.code];
            const size = 64;
            const cx = c.x - size / 2;
            const cy = c.y - size / 2;

            if (btnImg && btnImg.complete) {
                ctx.drawImage(btnImg, cx, cy, size, size);
            } else {
                // 画像がない場合のフォールバック
                ctx.fillStyle = c.code;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
            }

            // 選択中の枠線 (画像がない場合や、強調として)
            // ★要望:「白い枠線」は無しで良いとのことだが、選択状態がわかるように
            // 選択されている色は少し大きく表示する等の演出を入れる
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

    drawStockList: function (ctx) {
        const lx = 550, ly = 158, lw = 400, lh = 230;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.roundRect(lx, ly, lw, lh, 10);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("選んだ星玉", lx + 20, ly + 40);

        let iconX = lx + 30;
        let iconY = ly + 80;
        for (let i = 0; i < this.stockList.length; i++) {
            const item = this.stockList[i];

            // アイコンとして小さく描画 (72x72)
            const iconSize = 72;
            // 描画位置調整
            this.drawTintedBall(ctx, iconX - iconSize / 2, iconY - iconSize / 2, item.size, item.color, iconSize, iconSize);

            iconX += 50;
            if (iconX > lx + lw - 40) {
                iconX = lx + 30;
                iconY += 55;
            }
            if (iconY > ly + lh - 20) break;
        }
    },

    // マップモードとアニメーション描画は既存のまま (画像化の影響なし)
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

        const phase = this.animTimer % 100;
        const tx = (currentItem.gx * SkyManager.gridSize - this.camera.x + 16) * SkyManager.viewScale;
        const ty = (currentItem.gy * SkyManager.gridSize - this.camera.y + 16) * SkyManager.viewScale;
        const sy = 600;

        if (phase < 60) {
            const t = phase / 60;
            const cy = sy + (ty - sy) * t;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(tx, cy, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx, cy);
            ctx.lineTo(tx, cy + 20);
            ctx.stroke();
        } else if (phase < 80) {
            const alpha = 1 - (phase - 60) / 20;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(0, 0, 1000, 600);
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
        ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
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
        ctx.font = "bold 22px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 2);
        ctx.restore();
    }
};