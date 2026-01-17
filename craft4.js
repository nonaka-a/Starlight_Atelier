/**
 * --- Craft 4: しあげ (Polishing & Result) ---
 * 改修: 磨き修正、リザルト日本語化、カウントアップ演出
 */
const CraftPolishing = {
    shineLevel: 0,
    lastX: 0,
    lastY: 0, // ★追加: Y座標の履歴

    // リザルト管理
    isResultMode: false,
    resultTimer: 0,
    displayScores: { mix: -1, mold: -1, fire: -1, polish: -1, total: -1, stars: 0 },
    rank: '',
    bonusRate: 1.0,
    starAnimX: 0,

    // カウントアップ演出用
    countUpValue: 0,
    targetStars: 0,
    // スタンプ演出
    stampScale: 0,

    // UI
    btnResultOK: { x: 0, y: 0, w: 160, h: 50, text: "OK!", visible: false },

    init: function () {
        this.shineLevel = 0;
        this.lastX = 0;
        this.lastY = 0;
        this.isResultMode = false;
        this.resultTimer = 0;
        this.displayScores = { mix: -1, mold: -1, fire: -1, polish: -1, total: -1, stars: 0 };
        this.starAnimX = 0;
        this.countUpValue = 0;
        this.targetStars = 0;
        this.stampScale = 0;
        this.btnResultOK.visible = false;

        CraftManager.ui.btnNext.visible = true;
        CraftManager.ui.btnNext.text = "かんせい！";
    },

    update: function () {
        const cm = CraftManager;

        // --- リザルトモード ---
        if (this.isResultMode) {
            this.updateResult(cm);
            return;
        }

        // --- 磨きモード ---
        cm.ui.btnNext.visible = true;

        // 完了ボタン
        if (cm.checkBtn(cm.ui.btnNext)) {
            this.finishPolishing();
            AudioSys.playTone(1000, 'sine', 0.1);
            return;
        }

        const mx = Input.x - cm.camera.x;
        const my = Input.y;

        if (Input.isJustPressed) {
            this.lastX = mx;
            this.lastY = my;
        }

        const offsetX = 3000;
        const sx = offsetX + 500;
        const sy = 320;

        const starRadius = 150;

        // カメラ補正なしの生のInput.xを使うかどうか。
        // CraftManager.camera.x は 3000 になっているので、
        // 画面中央(500, 350)の星の位置は、World座標(3500, 350)。
        // Input.x は World座標のはずなので、
        // mx = Input.x - 3000 = 500 が中央。これで合ってる。
        // ただしInputの座標更新が1フレーム遅れなどに影響されないよう、isDown判定とともにチェック

        const distToStar = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);

        // 磨き操作
        if (Input.isDown) {
            // 判定を広めに (半径+50)
            if (distToStar < starRadius + 50) {
                const moveX = Math.abs(mx - this.lastX);
                const moveY = Math.abs(my - this.lastY);
                const move = moveX + moveY;

                // 動いていればOK
                if (move > 0.5) {
                    this.shineLevel = Math.min(100, this.shineLevel + 0.5);

                    if (Math.random() < 0.2) {
                        const px = mx + cm.camera.x + (Math.random() - 0.5) * 60;
                        const py = my + (Math.random() - 0.5) * 60;
                        cm.addParticle(px, py, 'white', 2);
                    }
                }
            }
        }
        this.lastX = mx;
        this.lastY = my;
    },

    finishPolishing: function () {
        const cm = CraftManager;

        const pScore = Math.floor(this.shineLevel * 0.05);
        cm.currentStar.scorePolish = pScore;
        console.log("Polish Score:", pScore);

        const s = cm.currentStar;
        const total = s.scoreMix + s.scoreMold + s.scoreFire + s.scorePolish;

        // ランク判定 (日本語)
        if (total >= 96) { this.rank = "パーフェクト"; this.bonusRate = 1.0; }
        else if (total >= 81) { this.rank = "エクセレント"; this.bonusRate = 0.5; }
        else if (total >= 61) { this.rank = "グッド"; this.bonusRate = 0.1; }
        else { this.rank = "ノーマル"; this.bonusRate = 0.0; }

        console.log(`Total: ${total}, Rank: ${this.rank}`);

        this.isResultMode = true;
        this.resultTimer = 0;
        this.starAnimX = 0;
        this.stampScale = 0;

        // 最終的な獲得数を計算して保持
        const base = cm.craftAmount;
        const bonusVal = Math.ceil(base * this.bonusRate);
        this.targetStars = base + (this.rank === "ノーマル" ? 0 : bonusVal);
        this.countUpValue = 0;

        cm.ui.btnNext.visible = false;
        cm.ui.btnCancel.visible = false;
    },

    updateResult: function (cm) {
        this.resultTimer++;

        // 星を右へスライド
        if (this.starAnimX < 250) {
            this.starAnimX += (250 - this.starAnimX) * 0.1;
        }

        const playSound = () => AudioSys.playTone(800, 'sine', 0.1);

        if (this.resultTimer === 30) {
            this.displayScores.mix = cm.currentStar.scoreMix;
            playSound();
        }
        if (this.resultTimer === 60) {
            this.displayScores.mold = cm.currentStar.scoreMold;
            playSound();
        }
        if (this.resultTimer === 90) {
            this.displayScores.fire = cm.currentStar.scoreFire;
            playSound();
        }
        if (this.resultTimer === 120) {
            this.displayScores.polish = cm.currentStar.scorePolish;
            playSound();
        }
        if (this.resultTimer === 160) {
            const s = cm.currentStar;
            this.displayScores.total = s.scoreMix + s.scoreMold + s.scoreFire + s.scorePolish;
            AudioSys.playTone(1200, 'square', 0.2);
            this.btnResultOK.visible = true;
        }

        // カウントアップ演出 (160フレーム以降)
        if (this.resultTimer >= 160) {
            if (this.countUpValue < this.targetStars) {
                const diff = this.targetStars - this.countUpValue;
                const step = Math.ceil(diff * 0.1);
                this.countUpValue += step;
                if (this.resultTimer % 4 === 0) {
                    AudioSys.playTone(1500, 'sine', 0.05);
                }
            } else {
                this.countUpValue = this.targetStars;

                // カウントアップ完了でスタンプ演出開始
                if (this.stampScale === 0) {
                    this.stampScale = 2.0; // 初期拡大
                    AudioSys.playTone(600, 'square', 0.2); // ドン！
                }
            }
        }

        // スタンプのアニメーション
        if (this.stampScale > 1.0) {
            this.stampScale += (1.0 - this.stampScale) * 0.2;
        }

        if (this.btnResultOK.visible) {
            if (cm.checkBtn(this.btnResultOK)) {
                if (this.countUpValue < this.targetStars) {
                    this.countUpValue = this.targetStars;
                    this.stampScale = 1.0;
                    return;
                }
                cm.craftAmount = this.targetStars;
                cm.stop();
                AudioSys.playTone(1000, 'sine', 0.1);
            }
        }
    },

    draw: function (offsetX) {
        if (this.isResultMode) {
            this.drawResultMode(offsetX);
            return;
        }

        CraftManager.drawTitle(offsetX, "しあげ");
        CraftManager.drawSpeechBubble(offsetX, "きれいにみがいて 完成させよう！");

        this.drawPolishingStar(offsetX, 0);
    },

    drawResultMode: function (offsetX) {
        // 背景暗転なし
        this.drawPolishingStar(offsetX, this.starAnimX);
        this.drawResultWindow(offsetX);
    },

    drawPolishingStar: function (offsetX, slideX) {
        const ctx = CraftManager.ctx;
        const cx = offsetX + 500 + slideX;
        const cy = 320;
        const radius = 150;

        const color = CraftManager.currentStar.color;

        ctx.save();
        ctx.translate(cx, cy);

        // 1. くすんだ下地
        ctx.fillStyle = '#777';
        ctx.beginPath();
        CraftManager.drawStarShape(ctx, 0, 0, radius, radius / 2);
        ctx.fill();

        // 2. 本来の色
        ctx.globalAlpha = 0.2 + (this.shineLevel / 100) * 0.8;
        ctx.fillStyle = color;
        ctx.shadowBlur = this.shineLevel * 0.5;
        ctx.shadowColor = color;
        ctx.beginPath();
        CraftManager.drawStarShape(ctx, 0, 0, radius, radius / 2);
        ctx.fill();

        if (this.shineLevel > 50) {
            ctx.globalAlpha = (this.shineLevel - 50) / 100;
            ctx.fillStyle = 'white';
            ctx.globalCompositeOperation = 'overlay';
            ctx.beginPath();
            CraftManager.drawStarShape(ctx, 0, 0, radius, radius / 2);
            ctx.fill();
        }

        ctx.restore();
    },

    drawResultWindow: function (offsetX) {
        const ctx = CraftManager.ctx;

        const w = 440;
        const h = 420;
        const cx = offsetX + 250;
        const cy = 300;

        ctx.save();
        ctx.translate(cx - w / 2, cy - h / 2);

        // 影
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(8, 8, w, h, 20);
        ctx.fill();

        // 背景
        ctx.fillStyle = '#f3e5f5';
        ctx.strokeStyle = '#9c27b0';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 20);
        ctx.fill();
        ctx.stroke();

        // タイトル
        ctx.fillStyle = '#7b1fa2';
        ctx.font = "bold 26px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText("けっか はっぴょう", w / 2, 40);

        // 各スコア
        const labels = [
            { txt: "きじづくり", val: this.displayScores.mix, max: 30, y: 85 },
            { txt: "かたぬき", val: this.displayScores.mold, max: 30, y: 120 },
            { txt: "ほしやき", val: this.displayScores.fire, max: 30, y: 155 },
            { txt: "しあげ", val: this.displayScores.polish, max: 5, y: 190 },
        ];

        ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";

        labels.forEach(item => {
            ctx.fillStyle = '#555';
            ctx.textAlign = 'left';
            ctx.fillText(item.txt, 40, item.y);

            if (item.val >= 0) {
                ctx.textAlign = 'right';
                // 満点なら赤
                const ratio = item.val / item.max;
                ctx.fillStyle = ratio === 1 ? '#e91e63' : '#333';
                ctx.fillText(`${item.val}/${item.max}`, w - 40, item.y);
            }
        });

        // 合計とランク
        if (this.displayScores.total >= 0) {
            // 区切り線
            ctx.strokeStyle = '#ce93d8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(30, 210);
            ctx.lineTo(w - 30, 210);
            ctx.stroke();

            // Total: シンプルに「86てん」とエクセレントを並列
            ctx.font = "bold 32px 'M PLUS Rounded 1c', sans-serif";
            const r = this.rank;
            let rColor = '#333';
            if (r === 'パーフェクト') rColor = '#ffd700';
            else if (r === 'エクセレント') rColor = '#ff4500';
            else if (r === 'グッド') rColor = '#1e90ff';

            ctx.fillStyle = rColor;

            // 中央揃えで2行に
            ctx.fillText(`${this.displayScores.total}てん`, w / 2, 260);
            ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(r, w / 2, 310);

            // ボーナス表記
            if (this.rank !== 'ノーマル') {
                const bonusCount = this.targetStars - CraftManager.craftAmount;
                if (bonusCount > 0) {
                    ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
                    ctx.fillStyle = '#e91e63';
                    ctx.textAlign = 'center';
                    ctx.fillText(`ついかボーナス ほし+${bonusCount}こ`, w / 2, 350);
                }
            }

            // 右下にスタンプ風「ごうけい」
            if (this.countUpValue > 0) {
                // 座布団
                const badgeX = w - 60;
                const badgeY = h - 60;
                const scale = this.stampScale > 0 ? this.stampScale : 1.0;

                ctx.save();
                ctx.translate(badgeX, badgeY);
                ctx.scale(scale, scale);
                ctx.rotate(0.2); // 少し傾ける

                // 黄色い星
                ctx.fillStyle = '#ffeb3b';
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                CraftManager.drawStarShape(ctx, 0, 0, 60, 30);
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#fbc02d';
                ctx.lineWidth = 3;
                ctx.stroke();

                // 文字
                ctx.fillStyle = '#d84315';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.font = "bold 14px 'M PLUS Rounded 1c', sans-serif";
                ctx.fillText("ごうけい", 0, -20);

                ctx.font = "900 32px 'M PLUS Rounded 1c', sans-serif";
                ctx.fillText(`${this.countUpValue}こ`, 0, 10);

                ctx.restore();
            }
        }

        ctx.restore();

        // OKボタン
        if (this.btnResultOK.visible) {
            this.btnResultOK.x = 250 - this.btnResultOK.w / 2;
            this.btnResultOK.y = cy + h / 2 - 25;

            const btn = { ...this.btnResultOK, x: offsetX + this.btnResultOK.x };
            CraftManager.drawBtn(btn, '#9c27b0');
        }
    }
};