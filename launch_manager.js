
/**
 * --- Launch Manager: うちあげミニゲーム ---
 */
const LaunchManager = {
    isActive: false,
    state: 'select_type', // select_type, select_pos, animation

    // 選択データ
    stockList: [], // { size: 0-2, color: code, gx: null, gy: null, placed: false }
    selectedColor: '#ffffff',
    costs: [10, 50, 100],

    // UI定義
    ui: {
        sizes: [
            { x: 50, y: 150, w: 140, h: 200, label: "星玉", cost: 10 },
            { x: 210, y: 150, w: 140, h: 200, label: "5星玉", cost: 50 },
            { x: 370, y: 150, w: 140, h: 200, label: "10星玉", cost: 100 }
        ],
        colors: [
            { code: '#ffffff', x: 100, y: 500, r: 25 }, // 白
            { code: '#ff5252', x: 180, y: 500, r: 25 }, // 赤
            { code: '#448aff', x: 260, y: 500, r: 25 }, // 青
            { code: '#e040fb', x: 340, y: 500, r: 25 }, // 紫
            { code: '#69f0ae', x: 420, y: 500, r: 25 }  // 緑
        ],
        btnCancel: { x: 800, y: 480, w: 150, h: 60, text: "やめる" },
        btnOk: { x: 800, y: 400, w: 150, h: 60, text: "おっけー" },
        btnLaunch: { x: 800, y: 400, w: 150, h: 60, text: "うちあげ" }
    },

    // マップ選択用
    camera: { x: 0, y: 0 },
    cursor: { gx: 0, gy: 0 }, // グリッド座標

    // 演出用
    animTimer: 0,
    launchIndex: 0,
    launchedItems: [],

    start: function () {
        if (typeof SkyManager === 'undefined' || !SkyManager.isLoaded) {
            SkyManager.init(); // 未ロードなら初期化
        }

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'none';

        this.isActive = true;
        this.state = 'select_type';
        this.stockList = [];
        this.selectedColor = '#ffffff';
        this.camera.x = (SkyManager.worldWidth - 1000) / 2;
        this.camera.y = (SkyManager.worldHeight - 600) / 2;

        if (typeof isGameRunning !== 'undefined') isGameRunning = false;
        if (typeof gameLoopId !== 'undefined' && gameLoopId) cancelAnimationFrame(gameLoopId);

        this.loop();
    },

    stop: function () {
        this.isActive = false;

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'block';

        // 未使用分の払い戻し (キャンセル時・配置前にやめた時)
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
        // キャンセル共通
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
            // サイズ選択
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

            // おっけーボタン
            if (this.stockList.length > 0) {
                if (this.checkBtn(this.ui.btnOk)) {
                    this.state = 'select_pos';
                    AudioSys.playTone(1200, 'sine', 0.1);
                }
            }
        }
    },

    updateSelectPos: function () {
        // ドラッグでカメラ移動
        if (Input.isDown) {
            const scrollSpeed = 10;
            if (Input.x < 100) this.camera.x -= scrollSpeed;
            if (Input.x > 900) this.camera.x += scrollSpeed;
            if (Input.y < 100) this.camera.y -= scrollSpeed;
            if (Input.y > 500) this.camera.y += scrollSpeed;

            this.camera.x = Math.max(0, Math.min(SkyManager.worldWidth - 1000, this.camera.x));
            this.camera.y = Math.max(0, Math.min(SkyManager.worldHeight - 600, this.camera.y));
        }

        // カーソル座標の計算
        const wx = Input.x + this.camera.x;
        const wy = Input.y + this.camera.y;
        this.cursor.gx = Math.floor(wx / SkyManager.gridSize);
        this.cursor.gy = Math.floor(wy / SkyManager.gridSize);

        // 決定（クリック）
        if (Input.isJustPressed) {
            // うちあげボタン
            const placedItems = this.stockList.filter(it => it.placed);
            if (placedItems.length > 0 && this.checkBtn(this.ui.btnLaunch)) {
                this.startAnimation();
                return;
            }

            // マスへの配置
            const nextItem = this.stockList.find(it => !it.placed);
            if (nextItem && Input.y < 400) {
                nextItem.gx = this.cursor.gx;
                nextItem.gy = this.cursor.gy;
                nextItem.placed = true;
                AudioSys.playTone(600, 'sine', 0.1);
            }
        }
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
            if (this.animTimer > 120) { // 2秒の余韻
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
                this.animTimer = 0; // 終了後の余韻用
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

        // 共通UI
        if (this.state !== 'animation') {
            this.drawBtn(ctx, this.ui.btnCancel, '#ff6b6b');
        }
    },

    drawSelectType: function (ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, 1000, 600);

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = "bold 32px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("うちあげ じゅんび", 500, 80);
        ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("左でえらんで、おっけーを押してね", 500, 110);

        // サイズボタン
        this.ui.sizes.forEach((b, i) => {
            const canBuy = (totalStarCount >= b.cost);
            ctx.fillStyle = canBuy ? '#fff' : '#555';
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 20);
            ctx.fill();
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 5;
            ctx.stroke();

            ctx.fillStyle = canBuy ? '#333' : '#888';
            ctx.font = "bold 32px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(b.label, b.x + b.w / 2, b.y + 60);

            ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(`星 ${b.cost}個`, b.x + b.w / 2, b.y + 160);

            const r = 15 + i * 10;
            ctx.fillStyle = this.selectedColor;
            ctx.beginPath();
            ctx.arc(b.x + b.w / 2, b.y + 110, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // 色パレット
        this.ui.colors.forEach((c) => {
            const isSelect = (this.selectedColor === c.code);
            ctx.fillStyle = c.code;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.fill();
            if (isSelect) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        });

        this.drawStockList(ctx);

        if (this.stockList.length > 0) {
            this.drawBtn(ctx, this.ui.btnOk, '#4ecdc4');
        }
    },

    drawStockList: function (ctx) {
        const lx = 550, ly = 150, lw = 400, lh = 230;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
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
            const size = item.size;
            const r = 10 + size * 5;
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(iconX, iconY, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();

            iconX += 40;
            if (iconX > lx + lw - 30) {
                iconX = lx + 30;
                iconY += 40;
            }
            if (iconY > ly + lh - 20) break;
        }
    },

    drawMapMode: function (ctx) {
        if (SkyManager.canvas) {
            ctx.drawImage(SkyManager.canvas, this.camera.x, this.camera.y, 1000, 600, 0, 0, 1000, 600);
        }

        if (this.state === 'select_pos') {
            // 配置済みのプレビュー
            this.stockList.forEach(it => {
                if (it.placed) {
                    const px = it.gx * SkyManager.gridSize - this.camera.x;
                    const py = it.gy * SkyManager.gridSize - this.camera.y;
                    let radius = 1;
                    if (it.size === 1) radius = 2;
                    if (it.size === 2) radius = 4;
                    const size = (radius * 2 + 1) * SkyManager.gridSize;
                    const offset = radius * SkyManager.gridSize;

                    ctx.strokeStyle = it.color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(px - offset, py - offset, size, size);
                    ctx.fillStyle = it.color + "33";
                    ctx.fillRect(px - offset, py - offset, size, size);
                }
            });

            const nextItem = this.stockList.find(it => !it.placed);
            if (nextItem) {
                const sx = this.cursor.gx * SkyManager.gridSize - this.camera.x;
                const sy = this.cursor.gy * SkyManager.gridSize - this.camera.y;
                let radius = 1;
                if (nextItem.size === 1) radius = 2;
                if (nextItem.size === 2) radius = 4;
                const size = (radius * 2 + 1) * SkyManager.gridSize;
                const offset = radius * SkyManager.gridSize;

                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.strokeRect(sx - offset, sy - offset, size, size);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillRect(sx - offset, sy - offset, size, size);

                this.drawSpeechBubble(ctx, "どこにうちあげよう？");
            } else {
                this.drawSpeechBubble(ctx, "うちあげボタンをおしてね！");
            }

            if (this.stockList.some(it => it.placed)) {
                this.drawBtn(ctx, this.ui.btnLaunch, '#4ecdc4');
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
        const tx = currentItem.gx * SkyManager.gridSize - this.camera.x + 16;
        const ty = currentItem.gy * SkyManager.gridSize - this.camera.y + 16;
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