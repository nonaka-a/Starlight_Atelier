/**
 * --- ほしぞら工房 クラフト統合マネージャー ---
 * 修正: 外部譜面データの受け渡し機能追加
 */
const CraftManager = {
    isActive: false,
    loopId: null,
    ctx: null,

    // 現在の工程: 'select', 'pouring', 'mixing', 'molding', 'firing', 'polishing'
    state: 'select',

    camera: { x: 0, y: 0, targetX: 0 },

    // 共通データ
    craftAmount: 1,
    maxCraftAmount: 1,

    // ★追加: 外部から読み込んだ譜面データ
    externalChartData: null,

    currentStar: {
        mixProgress: 0,
        moldScore: 0,
        bakeTemp: 0,
        bakeProgress: 0,
        bakeState: 'raw',
        color: '#FFA500',
        particles: []
    },

    // 共通UI
    ui: {
        btnNext: { x: 400, y: 450, w: 200, h: 60, visible: false, text: "つぎへ！" },
        btnCancel: { x: 800, y: 480, w: 150, h: 60, text: "やめる" },
        // 確認画面用
        confirmYes: { x: 320, y: 350, w: 160, h: 60, text: "はい" },
        confirmNo: { x: 520, y: 350, w: 160, h: 60, text: "いいえ" }
    },

    showConfirm: false,

    init: function () {
        if (typeof canvas !== 'undefined') {
            this.ctx = canvas.getContext('2d');
        }
        // 各モジュールの初期化があればここで呼ぶ
    },

    // ★追加: 譜面データをセットするメソッド
    loadChart: function (data) {
        this.externalChartData = data;
        console.log("譜面データをロードしました", data.length, "ノーツ");
    },

    start: function (maxMaterials) {
        if (typeof Input !== 'undefined') Input.reset();
        this.isActive = true;
        this.state = 'select';
        this.camera.x = 0;
        this.camera.targetX = 0;

        this.maxCraftAmount = Math.min(999, Math.max(1, Math.floor(maxMaterials / 1)));
        this.craftAmount = 1;

        this.currentStar = {
            mixProgress: 0,
            moldScore: 0,
            bakeTemp: 0,
            bakeProgress: 0,
            bakeState: 'raw',
            color: '#FFA500',
            particles: [],
            // 各工程のスコア (Result集計用)
            scoreMix: 0,
            scoreMold: 0,
            scoreFire: 0,
            scorePolish: 0
        };

        this.resetNextBtn();
        this.ui.btnNext.visible = false;
        this.ui.btnNext.text = "つぎへ！";
        this.ui.btnCancel.visible = true; // ★追加: 二回目以降に消えないように明示的に表示設定する

        if (typeof CraftMolding !== 'undefined') CraftMolding.reset?.();
        if (typeof CraftPolishing !== 'undefined') CraftPolishing.reset?.();

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'none';

        // 最初の工程(Select)の初期化は Craft1 が担当するが、
        // Select自体はループ開始直後に処理される

        if (this.loopId) cancelAnimationFrame(this.loopId);
        this.loop();
    },

    stop: function () {
        this.isActive = false;
        if (this.loopId) cancelAnimationFrame(this.loopId);

        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'block';

        if (typeof resetGameFromCraft === 'function') {
            resetGameFromCraft(this.craftAmount);
        }
    },

    loop: function () {
        if (!this.isActive) return;
        Input.update();
        this.update();
        this.draw();
        this.loopId = requestAnimationFrame(() => this.loop());
    },

    update: function () {
        // デバッグ: 'C'キーで工程スキップ
        if (keys.KeyC) {
            keys.KeyC = false; // 連続スキップ防止
            console.log("Debug: Skipping stage");
            this.goToNextState();
            return;
        }

        this.camera.x += (this.camera.targetX - this.camera.x) * 0.1;

        // 確認ダイアログ表示中
        if (this.showConfirm) {
            if (this.checkBtn(this.ui.confirmYes)) {
                this.forceCancelCraft();
                AudioSys.playTone(400, 'sine', 0.1);
            } else if (this.checkBtn(this.ui.confirmNo)) {
                this.showConfirm = false;
                AudioSys.playTone(600, 'sine', 0.1);
            }
            return;
        }

        // 共通: やめるボタン (優先判定)
        if (this.checkBtn(this.ui.btnCancel)) {
            this.cancelCraft();
            AudioSys.playTone(200, 'sine', 0.1);
            return; // キャンセル時は他の更新をスキップ
        }

        // 状態に応じて各モジュールのupdateを呼ぶ
        if (this.state === 'select') {
            if (CraftMixing && CraftMixing.updateSelect) CraftMixing.updateSelect();
        } else if (this.state === 'pouring') {
            if (CraftMixing && CraftMixing.updatePouring) CraftMixing.updatePouring();
        } else if (this.state === 'mixing') {
            if (CraftMixing && CraftMixing.updateMix) CraftMixing.updateMix();
        } else if (this.state === 'molding') {
            if (CraftMolding && CraftMolding.update) CraftMolding.update();
        } else if (this.state === 'firing') {
            if (CraftFiring && CraftFiring.update) CraftFiring.update();
        } else if (this.state === 'polishing') {
            if (CraftPolishing && CraftPolishing.update) CraftPolishing.update();
        }

        // 共通: 次へボタン
        if (this.ui.btnNext.visible) {
            if (this.checkBtn(this.ui.btnNext)) {
                this.goToNextState();
                AudioSys.playTone(800, 'sine', 0.1);
            }
        }
    },

    draw: function () {
        const ctx = this.ctx;
        const w = 1000;
        const h = 600;

        ctx.fillStyle = '#f5e6d3';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(-this.camera.x, 0);

        // 各工程の描画
        // カメラ位置に基づいて描画すべきステージのみを描画し、表示バグを防ぐ

        // Craft 1 (Select/Pour/Mix) - Offset 0
        if (Math.abs(this.camera.x - 0) < 1100) {
            if (typeof CraftMixing !== 'undefined') {
                this.drawTable(0, "");
                // 工程が進んでも、カメラに映っている間は描画を続ける
                if (this.state === 'select') {
                    CraftMixing.drawSelect(0);
                } else {
                    CraftMixing.drawMixArea(0);
                }
            }
        }

        // Craft 2 (Mold) - Offset 1000
        if (Math.abs(this.camera.x - 1000) < 1100) {
            if (typeof CraftMolding !== 'undefined') {
                this.drawTable(1000, "");
                CraftMolding.draw(1000);
            }
        }

        // Craft 3 (Fire) - Offset 2000
        if (Math.abs(this.camera.x - 2000) < 1100) {
            if (typeof CraftFiring !== 'undefined') {
                this.drawTable(2000, "");
                CraftFiring.draw(2000);
            }
        }

        // Craft 4 (Polish) - Offset 3000
        if (Math.abs(this.camera.x - 3000) < 1100) {
            if (typeof CraftPolishing !== 'undefined') {
                this.drawTable(3000, "");
                CraftPolishing.draw(3000);
            }
        }

        ctx.restore();

        // UI (画面固定)
        if (this.ui.btnNext.visible) {
            this.drawBtn(this.ui.btnNext);
        }

        // 共通UI: やめるボタン (赤色)
        this.drawBtn(this.ui.btnCancel, '#ff6b6b');

        // 共通演出パーティクル
        this.drawCommonParticles();

        // 中断確認ダイアログ
        if (this.showConfirm) {
            this.drawConfirmOverlay();
        }
    },

    drawConfirmOverlay: function () {
        const ctx = this.ctx;
        const w = 1000, h = 600;

        // 背景オーバーレイ
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, w, h);

        // ダイアログボックス
        const bw = 500, bh = 250;
        const bx = (w - bw) / 2, by = (h - bh) / 2;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 20);
        ctx.fill();
        ctx.restore();

        // メッセージ
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("使ったほしのもとはなくなりますが", w / 2, by + 80);
        ctx.fillText("よいですか？", w / 2, by + 115);

        // ボタン
        this.drawBtn(this.ui.confirmYes, '#ff6b6b'); // はい (赤)
        this.drawBtn(this.ui.confirmNo, '#4ecdc4');  // いいえ (通常)
    },

    // --- 状態遷移 ---
    goToNextState: function () {
        this.resetNextBtn();

        if (this.state === 'mixing') {
            if (CraftMixing && CraftMixing.end) {
                CraftMixing.end();
            }
            this.state = 'molding';
            this.camera.targetX = 1000;

            // ★追加: 譜面データがあればセット
            if (CraftMolding) {
                if (this.externalChartData) {
                    CraftMolding.setChart(this.externalChartData);
                }
                CraftMolding.init();
            }

        } else if (this.state === 'molding') {
            // 前の工程の終了処理
            if (CraftMolding && CraftMolding.end) {
                CraftMolding.end();
            }

            this.state = 'firing';
            this.camera.targetX = 2000;
            if (CraftFiring) CraftFiring.init();
        } else if (this.state === 'firing') {
            // 前の工程の終了処理 (火の音などを止める)
            if (CraftFiring && CraftFiring.end) {
                CraftFiring.end();
            }
            this.state = 'polishing';
            this.camera.targetX = 3000;
            if (CraftPolishing) CraftPolishing.init();
        } else if (this.state === 'polishing') {
            if (CraftPolishing && CraftPolishing.end) {
                CraftPolishing.end();
            }
            this.stop();
        }
    },

    cancelCraft: function () {
        // 素材を消費する前(select工程)なら確認なしで戻る
        if (this.state === 'select') {
            this.forceCancelCraft();
            return;
        }

        // それ以外は確認を出す
        this.showConfirm = true;
    },

    forceCancelCraft: function () {
        // 現在の工程の終了処理を呼んで音などを止める
        if (this.state === 'firing' && typeof CraftFiring !== 'undefined' && CraftFiring.end) {
            CraftFiring.end();
        } else if (this.state === 'mixing' || this.state === 'pouring' || this.state === 'select') {
            if (typeof CraftMixing !== 'undefined' && CraftMixing.end) CraftMixing.end();
        } else if (this.state === 'molding' && typeof CraftMolding !== 'undefined' && CraftMolding.end) {
            CraftMolding.end();
        } else if (this.state === 'polishing' && typeof CraftPolishing !== 'undefined' && CraftPolishing.end) {
            CraftPolishing.end();
        }

        this.showConfirm = false;
        this.isActive = false;

        // HUD (カウンター等) を復元
        const ui = document.getElementById('ui-container');
        if (ui) ui.style.display = 'block';

        if (this.loopId) {
            cancelAnimationFrame(this.loopId);
            this.loopId = null;
        }

        if (typeof resetGameFromCraft === 'function') {
            resetGameFromCraft(0); // 獲得星0個で戻る
        }
    },

    // --- 共通ヘルパー関数 ---
    resetNextBtn: function () {
        this.ui.btnNext.visible = false;
    },

    checkBtn: function (btn) {
        if (btn.visible === false) return false;
        const mx = Input.x;
        const my = Input.y;
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
            if (Input.isJustPressed) return true;
        }
        return false;
    },

    hitTest: function (btn) {
        const mx = Input.x - this.camera.x;
        const my = Input.y;
        return (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h);
    },

    drawBtn: function (btn, color) {
        if (!btn.visible && btn.visible !== undefined) return;
        const ctx = this.ctx;

        // ボタンの色に応じた影色の設定
        let shadowColor = '#36b0a8'; // デフォルト (青緑系)
        if (color === '#ff6b6b') {
            shadowColor = '#d64545'; // 赤系
        } else if (color === '#9c27b0') {
            shadowColor = '#7b1fa2'; // 紫系
        }

        // 影を先に描画
        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.roundRect(btn.x, btn.y + 5, btn.w, btn.h, 30);
        ctx.fill();

        // 本体
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

    drawTriangleBtn: function (btn, isUp) {
        const ctx = this.ctx;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 10);
        ctx.fill();
        ctx.strokeStyle = '#ddd';
        ctx.stroke();

        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        const cx = btn.x + btn.w / 2;
        const cy = btn.y + btn.h / 2;
        const s = 10;
        if (isUp) {
            ctx.moveTo(cx, cy - s);
            ctx.lineTo(cx + s, cy + s);
            ctx.lineTo(cx - s, cy + s);
        } else {
            ctx.moveTo(cx, cy + s);
            ctx.lineTo(cx + s, cy - s);
            ctx.lineTo(cx - s, cy - s);
        }
        ctx.fill();
    },

    drawTable: function (offsetX, title) {
        if (!title) return;
        const ctx = this.ctx;
        ctx.fillStyle = '#d2b48c';
        ctx.fillRect(offsetX + 100, 200, 800, 350);
        ctx.fillStyle = '#c0a070';
        ctx.fillRect(offsetX + 100, 550, 800, 20);
        ctx.fillStyle = '#8b4513';
        ctx.font = "900 32px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(title, offsetX + 500, 100);
    },

    // --- 共通UI描画ヘルパー ---

    // 画面上部中央に表示するミニゲームタイトル
    drawTitle: function (offsetX, text) {
        const ctx = this.ctx;
        const cx = offsetX + 500;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 8;
        ctx.strokeText(text, cx, 60);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText(text, cx, 60);
        ctx.restore();
    },

    // 左下に表示する吹き出しテキスト
    drawSpeechBubble: function (offsetX, text) {
        const ctx = this.ctx;
        const x = offsetX + 20; // 50から20へ変更
        const y = 480;
        const w = 350;
        const h = 80;

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

        // 吹き出しのしっぽ
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

    // 情報表示用の黄色枠ウィンドウ
    drawYellowWindow: function (offsetX, cx, cy, w, h, title, content, contentColor, unitText) {
        const ctx = this.ctx;
        const r = 15;
        const tx = offsetX + cx;
        const ty = cy;

        ctx.save();
        ctx.translate(tx - w / 2, ty - h / 2);

        // 影
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.roundRect(6, 6, w, h, r);
        ctx.fill();

        // 本体
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, r);
        ctx.fill();

        // 枠
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#ffaa00";
        ctx.stroke();

        // タイトル
        if (title) {
            ctx.fillStyle = "#e67e22";
            ctx.font = "bold 16px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText(title, w / 2, 25);
        }

        // 内容
        if (content !== undefined) {
            ctx.fillStyle = contentColor || "#333";
            const baseY = title ? 65 : h / 2 + 15;

            if (unitText) {
                // 単位がある場合はサイズ違いで横並び
                ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";
                const contentW = ctx.measureText(content).width;

                ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
                const unitW = ctx.measureText(unitText).width;

                // 全体の幅から開始位置を計算 (中央揃え)
                const totalW = contentW + unitW;
                let currentX = (w - totalW) / 2;

                // 数値描画
                ctx.fillStyle = contentColor || "#333";
                ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";
                ctx.textAlign = 'left';
                ctx.fillText(content, currentX, baseY);

                // 単位描画
                ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
                ctx.fillText(unitText, currentX + contentW, baseY);

            } else {
                // 従来通り中央揃え
                ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";
                ctx.textAlign = 'center';
                ctx.fillText(content, w / 2, baseY);
            }
        }
        ctx.restore();
    },

    drawProgressBar: function (x, y, current, max) {
        const ctx = this.ctx;
        const w = 400;
        const h = 20;
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(x, y, w * (current / max), h);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(x, y, w, h);
    },

    addParticle: function (x, y, color, speed) {
        this.currentStar.particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.5) * speed,
            life: 30 + Math.random() * 20,
            color: color,
            r: Math.random() * 5 + 2
        });
    },

    drawCommonParticles: function () {
        if (this.state === 'select' || this.state === 'pouring' || this.state === 'mixing') return;

        const ctx = this.ctx;
        ctx.save();
        for (const p of this.currentStar.particles) {
            if (p.isIngredient) continue;
            const screenX = p.x - this.camera.x;
            ctx.globalAlpha = p.life / 50;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(screenX, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    },

    drawStarShape: function (ctx, cx, cy, outerR, innerR) {
        let rot = Math.PI / 2 * 3;
        let step = Math.PI / 5;
        ctx.moveTo(cx, cy - outerR);
        for (let i = 0; i < 5; i++) {
            let x = cx + Math.cos(rot) * outerR;
            let y = cy + Math.sin(rot) * outerR;
            ctx.lineTo(x, y);
            rot += step;
            x = cx + Math.cos(rot) * innerR;
            y = cy + Math.sin(rot) * innerR;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerR);
    }
};