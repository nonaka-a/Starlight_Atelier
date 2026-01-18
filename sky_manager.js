
/**
 * --- Sky Manager: 夜空とキャンバスの管理 ---
 */
const SkyManager = {
    // 設定
    worldWidth: 2000,
    worldHeight: 1200,
    gridSize: 32,

    // 内部変数
    canvas: null,      // オフスクリーンキャンバス（描画用）
    ctx: null,
    stampsImage: new Image(),
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

        // 裏画面（オフスクリーンキャンバス）の作成
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.worldWidth;
        this.canvas.height = this.worldHeight;
        this.ctx = this.canvas.getContext('2d');

        // スタンプ画像のロード
        this.stampsImage.src = 'image/star_stamps.png';
        this.stampsImage.onload = () => {
            this.isLoaded = true;
            this.initBackground();
        };
    },

    // 最初の夜空の下地を作る（真っ暗だと寂しいのでうっすら星を入れる等も可）
    initBackground: function () {
        const ctx = this.ctx;
        // 背景色（濃い紺色グラデーション）
        const grad = ctx.createLinearGradient(0, 0, 0, this.worldHeight);
        grad.addColorStop(0, '#050510');
        grad.addColorStop(1, '#101025');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    },

    // --- 外部から呼ばれる描画命令 ---
    // cx, cy: グリッド座標 (0~), sizeLevel: 0(小)/1(中)/2(大), color: 色コード
    drawCluster: function (gridX, gridY, sizeLevel, color) {
        if (!this.isLoaded) return;

        const ctx = this.ctx;
        const basePx = gridX * this.gridSize;
        const basePy = gridY * this.gridSize;

        // 範囲の設定 (半径マス数)
        let radius = 1;
        if (sizeLevel === 1) radius = 2; // 5星玉
        if (sizeLevel === 2) radius = 4; // 10星玉

        // 描画設定（加算合成で光らせる）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 色の適用（星画像を白で作っておき、globalCompositeOperationで色味を足す手法もあるが、
        // ここでは単純に色付き矩形を重ねるか、tint処理が必要。
        // 簡易的に、先にスタンプを描いて、その上から色を乗算する方式をとる）
        // ※ここではパフォーマンス重視で、「着色済みのスタンプ」を擬似的に描画するアプローチをとります。

        // 範囲内のセルを走査
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                // 距離判定
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius + 0.5) continue;

                // 密度の決定
                let densityRow = 2; // 低 (index 2)
                if (dist <= 1) densityRow = 0; // 高 (index 0)
                else if (dist <= radius * 0.6) densityRow = 1; // 中 (index 1)

                // ランダムにスタンプ選択 (0~9)
                const stampIndex = Math.floor(Math.random() * 10);

                // 描画座標
                const tx = basePx + dx * this.gridSize;
                const ty = basePy + dy * this.gridSize;

                // 範囲外チェック
                if (tx < 0 || tx >= this.worldWidth || ty < 0 || ty >= this.worldHeight) continue;

                // スタンプ描画
                this.drawSingleStamp(ctx, tx, ty, densityRow, stampIndex, color);
            }
        }
        ctx.restore();
    },

    drawSingleStamp: function (ctx, x, y, row, col, color) {
        const sw = 32, sh = 32;
        const sx = col * sw;
        const sy = row * sh;

        ctx.save();
        ctx.translate(x + sw / 2, y + sh / 2);

        // ランダム回転・反転
        const angle = Math.floor(Math.random() * 4) * (Math.PI / 2);
        ctx.rotate(angle);
        if (Math.random() < 0.5) ctx.scale(-1, 1);

        // 加算合成ですべて描画する (背景が暗いのでこれが一番きれい)
        ctx.globalCompositeOperation = 'lighter';

        // 色を纏わせるために shadowBlur を使用
        ctx.shadowColor = color;
        ctx.shadowBlur = 15; // 少し強めにしても良いかも
        ctx.globalAlpha = 1.0;

        // 2. 星スタンプを描画 (本体)
        ctx.drawImage(this.stampsImage, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

        ctx.restore();
    },

    // --- ほしを見るモード ---
    startGazing: function () {
        this.isActive = true;
        this.uiAlpha = 1.0;
        this.uiTimer = 0;

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'none';

        // カメラ初期位置（中央）
        this.camera.x = (this.worldWidth - 1000) / 2;
        this.camera.y = (this.worldHeight - 600) / 2;

        if (typeof isGameRunning !== 'undefined') isGameRunning = false;
        if (typeof gameLoopId !== 'undefined' && gameLoopId) cancelAnimationFrame(gameLoopId);

        this.loop();
    },

    stopGazing: function () {
        this.isActive = false;

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'block';

        // ゲーム復帰
        if (typeof resetGameFromCraft === 'function') {
            // 特に報酬はないので0
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
        // ドラッグスクロール
        if (Input.isJustPressed) {
            this.isDragging = true;
            this.dragStart.x = Input.x;
            this.dragStart.y = Input.y;
            this.uiTimer = 0; // 触ったらUI表示
            this.uiAlpha = 1.0;

            // 戻るボタン判定 (右下)
            if (Input.x > 850 && Input.y > 500) {
                this.stopGazing();
                return;
            }
        }

        if (Input.isDown && this.isDragging) {
            const dx = Input.x - this.dragStart.x;
            const dy = Input.y - this.dragStart.y;

            this.camera.x -= dx;
            this.camera.y -= dy;

            this.dragStart.x = Input.x;
            this.dragStart.y = Input.y;

            // 範囲制限
            this.camera.x = Math.max(0, Math.min(this.worldWidth - 1000, this.camera.x));
            this.camera.y = Math.max(0, Math.min(this.worldHeight - 600, this.camera.y));
        } else {
            this.isDragging = false;
        }

        // UI自動非表示
        this.uiTimer++;
        if (this.uiTimer > 180) { // 3秒後
            this.uiAlpha = Math.max(0, this.uiAlpha - 0.05);
        }
    },

    draw: function () {
        const ctx = canvas.getContext('2d'); // メインキャンバス

        // 1. 裏画面（夜空）をカメラ位置に応じて描画
        if (this.canvas) {
            ctx.drawImage(
                this.canvas,
                this.camera.x, this.camera.y, 1000, 600,
                0, 0, 1000, 600
            );
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 1000, 600);
        }

        // 2. キャラクター（赤まいまい・ピンクまいまい）を合成
        // 常に画面手前に座っている演出
        this.drawCharacters(ctx);

        // 3. UI（戻るボタンなど）
        if (this.uiAlpha > 0) {
            ctx.globalAlpha = this.uiAlpha;

            // 戻るボタン
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.roundRect(860, 520, 120, 60, 30);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("もどる", 920, 550);

            // ガイド
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fff';
            ctx.fillText("ドラッグで夜空を見渡せます", 20, 570);

            ctx.globalAlpha = 1.0;
        }
    },

    drawCharacters: function (ctx) {
        // 簡易描画：丘と背中
        // 本来は画像を用意して drawImage する
        ctx.fillStyle = '#1a237e'; // 暗い丘の色
        ctx.beginPath();
        ctx.ellipse(500, 700, 600, 200, 0, 0, Math.PI * 2);
        ctx.fill();

        // 赤まいまい・ピンクまいまい（シルエット風）
        // 左
        ctx.fillStyle = '#d32f2f'; // 赤
        ctx.beginPath();
        ctx.arc(450, 530, 25, 0, Math.PI * 2); // 頭
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(450, 560, 30, 40, 0, 0, Math.PI * 2); // 体
        ctx.fill();

        // 右
        ctx.fillStyle = '#f48fb1'; // ピンク
        ctx.beginPath();
        ctx.arc(520, 535, 23, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(520, 565, 28, 38, 0, 0, Math.PI * 2);
        ctx.fill();
    }
};