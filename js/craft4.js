/**
 * --- Craft 4: しあげ (画像差し替え版) ---
 */

const CraftPolishingImages = {
    loaded: false,
    path: 'image/craft_image4/',

    bgPolish: new Image(),
    starDirty: new Image(),
    starShiny: new Image(),
    stampStar: new Image(),
    tutorialHand: new Image(),
    sparkles: [],

    loadAssets: async function () {
        if (this.loaded) return;

        const promises = [];
        const path = this.path;
        const setSrc = (name) => CraftManager.loadImage(path + name);

        promises.push(setSrc('bg_polish.png').then(img => this.bgPolish = img));
        promises.push(setSrc('star_dirty.png').then(img => this.starDirty = img));
        promises.push(setSrc('star_shiny.png').then(img => this.starShiny = img));
        promises.push(setSrc('stamp_star.png').then(img => this.stampStar = img));
        promises.push(CraftManager.loadImage('image/tutorial/hand.png').then(img => this.tutorialHand = img));

        this.sparkles = new Array(3);
        for (let i = 0; i < 3; i++) {
            promises.push(setSrc(`effect_sparkle_${i + 1}.png`).then(img => this.sparkles[i] = img));
        }

        await Promise.all(promises);
        this.loaded = true;
    },

    // 互換性
    load: function () { this.loadAssets(); }
};

const CraftPolishing = {
    // 状態
    shineLevel: 0, // 0 to 100
    maskCanvas: null, // 汚れレイヤー用のオフスクリーンCanvas
    maskCtx: null,

    lastX: 0,
    lastY: 0,

    sparkleAnimTimer: 0,
    sparkleParticles: [], // {x, y, scale, frame, timer}
    seCooldown: 0,

    showTutorial: false,
    tutorialTimer: 0,

    // リザルト管理
    isResultMode: false,
    resultTimer: 0,
    displayScores: { mix: -1, mold: -1, fire: -1, polish: -1, total: -1 },
    rank: '',
    bonusRate: 1.0,
    starAnimX: 0,
    countUpValue: 0,
    targetStars: 0,
    stampScale: 0,

    // UI
    btnResultOK: { x: 0, y: 0, w: 160, h: 50, text: "OK!", visible: false },

    kiraPlayed: false, // ★追加: kira.mp3再生済みフラグ

    loadAssets: async function () {
        await CraftPolishingImages.loadAssets();
        await Promise.all([
            CraftManager.loadSound('se_polish', 'sounds/se_polish.mp3'),
            CraftManager.loadSound('se_kira', 'sounds/kira.mp3')
        ]);
    },

    init: function () {
        // CraftPolishingImages.load(); // 事前ロード済み

        this.shineLevel = 0;
        this.lastX = Input.x;
        this.lastY = Input.y;
        this.isResultMode = false;
        this.resultTimer = 0;
        this.displayScores = { mix: -1, mold: -1, fire: -1, polish: -1, total: -1 };
        this.starAnimX = 0;
        this.countUpValue = 0;
        this.targetStars = 0;
        this.stampScale = 0;
        this.btnResultOK.visible = false;
        this.sparkleParticles = [];
        this.seCooldown = 0;
        this.kiraPlayed = false; // ★リセット

        this.showTutorial = !hasSeenFinishTutorial;
        this.tutorialTimer = 0;

        // マスク用Canvasの初期化 (汚れ画像を描画しておく)
        if (!this.maskCanvas) {
            this.maskCanvas = document.createElement('canvas');
            this.maskCanvas.width = 300; // 星画像のサイズ
            this.maskCanvas.height = 300;
            this.maskCtx = this.maskCanvas.getContext('2d');
        }
        if (this.maskCtx) {
            this.maskCtx.clearRect(0, 0, 300, 300);
        }
        this.resetMask();

        CraftManager.ui.btnNext.visible = !this.showTutorial;
        CraftManager.ui.btnNext.text = "かんせい！";
    },

    end: function () {
        AudioSys.stopBGM();
    },

    resetMask: function () {
        if (!this.maskCtx) return;
        const ctx = this.maskCtx;
        const img = CraftPolishingImages.starDirty;

        ctx.clearRect(0, 0, 300, 300);
        ctx.globalCompositeOperation = 'source-over';

        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, 0, 0, 300, 300);
        } else {
            // ロード完了後に再描画するための簡易リトライ
            setTimeout(() => {
                if (img.complete) this.resetMask();
            }, 500);
        }
    },

    update: function () {
        const cm = CraftManager;

        // --- リザルトモード ---
        if (this.isResultMode) {
            this.updateResult(cm);
            return;
        }

        if (this.showTutorial) {
            this.updateTutorial();
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

        // 磨き処理
        // 星の中心: 画面上の (500, 280)
        // 星画像サイズ: 300x300 -> 描画範囲: x:350~650, y:130~430
        const starCx = 500;
        const starCy = 280;
        const starSize = 300;
        const starLeft = starCx - starSize / 2;
        const starTop = starCy - starSize / 2;

        const mx = Input.x - cm.camera.x; // 現在のコードではPolish時のCameraXは3000
        // ただし Input.x はスクリーン座標(0-1000)なので、そのまま使ってOK
        // CraftManager.drawで translate(-camera.x) しているので、
        // 描画座標系は (camera.x, 0) が原点。
        // つまり、スクリーン座標 (Input.x) を 描画ローカル座標 (Input.x + cm.camera.x) に変換する必要がある？
        // いいえ、Craft4は offset 3000 に描画されます。
        // 画面中央は offset + 500 = 3500 です。
        // Input.x (0~1000) をローカルに変換するには + 3000 ですが、
        // ここではスクリーン座標系で判定したほうが簡単です。

        // Input.x: 0~1000 (スクリーン)
        // 星の表示位置(スクリーン): 500, 320

        if (Input.isJustPressed) {
            this.lastX = Input.x;
            this.lastY = Input.y;
        }

        if (Input.isDown) {
            const dist = Math.sqrt((Input.x - starCx) ** 2 + (Input.y - starCy) ** 2);
            // 半径150px以内なら磨ける
            if (dist < 160) {
                // マスク上の座標に変換
                const localX = Input.x - starLeft;
                const localY = Input.y - starTop;

                // 消しゴム処理
                if (this.maskCtx) {
                    this.maskCtx.globalCompositeOperation = 'destination-out';
                    this.maskCtx.globalAlpha = 0.6; // 2回程度なぞると消えるように

                    // 境界をぼかすために放射状グラデーションを使用
                    const grad = this.maskCtx.createRadialGradient(localX, localY, 0, localX, localY, 30);
                    grad.addColorStop(0, 'rgba(0,0,0,1)');
                    grad.addColorStop(0.5, 'rgba(0,0,0,0.6)');
                    grad.addColorStop(1, 'rgba(0,0,0,0)');

                    this.maskCtx.fillStyle = grad;
                    this.maskCtx.beginPath();
                    this.maskCtx.arc(localX, localY, 30, 0, Math.PI * 2); // ぼかしに合わせて少し大きく
                    this.maskCtx.fill();

                    this.maskCtx.globalAlpha = 1.0;

                    // 動きがあったら進行度アップ
                    const move = Math.abs(Input.x - this.lastX) + Math.abs(Input.y - this.lastY);
                    if (move > 1.0) {
                        this.shineLevel = Math.min(100, this.shineLevel + 0.5);

                        // 磨きSE (1秒間隔)
                        if (this.seCooldown <= 0) {
                            AudioSys.playSE('se_polish', 0.4);
                            this.seCooldown = 60; // 60フレーム(1秒)
                        }

                        // キラキラ発生
                        if (Math.random() < 0.1) {
                            this.addSparkle(Input.x, Input.y);
                        }
                    }
                }
            }
        }
        if (this.seCooldown > 0) this.seCooldown--;

        // ★全て磨き終えた合図 (100%になった瞬間)
        if (this.shineLevel >= 100 && !this.kiraPlayed) {
            AudioSys.playSE('se_kira', 0.6);
            this.kiraPlayed = true;
        }

        this.lastX = Input.x;
        this.lastY = Input.y;

        this.updateSparkles();
    },

    updateTutorial: function () {
        this.tutorialTimer++;
        if (Input.isJustPressed) {
            this.showTutorial = false;
            hasSeenFinishTutorial = true;
            if (typeof DataManager !== 'undefined') DataManager.save();
            AudioSys.playTone(600, 'sine', 0.1);
        }
    },

    addSparkle: function (x, y) {
        this.sparkleParticles.push({
            x: x + (Math.random() - 0.5) * 40,
            y: y + (Math.random() - 0.5) * 40,
            scale: 0.5 + Math.random() * 0.5,
            frame: Math.floor(Math.random() * 3),
            timer: 0,
            maxTimer: 20
        });
    },

    updateSparkles: function () {
        this.sparkleAnimTimer++;
        for (let i = this.sparkleParticles.length - 1; i >= 0; i--) {
            const p = this.sparkleParticles[i];
            p.timer++;
            // 8フレームごとに画像切り替え
            if (p.timer % 8 === 0) {
                p.frame = (p.frame + 1) % 3;
            }
            if (p.timer > p.maxTimer) {
                this.sparkleParticles.splice(i, 1);
            }
        }

        // 完了後の自動キラキラ
        if (this.shineLevel >= 90 && this.sparkleAnimTimer % 20 === 0) {
            const rx = 500 + (Math.random() - 0.5) * 200;
            const ry = 280 + (Math.random() - 0.5) * 200;
            this.addSparkle(rx, ry);
        }
    },

    finishPolishing: function () {
        const cm = CraftManager;

        // スコア: 輝き具合で0-5点加算
        const pScore = Math.floor(this.shineLevel * 0.05);
        cm.currentStar.scorePolish = pScore;
        console.log("Polish Score:", pScore);

        const s = cm.currentStar;
        const total = s.scoreMix + s.scoreMold + s.scoreFire + s.scorePolish;

        // ランク判定
        if (total >= 96) { this.rank = "パーフェクト"; this.bonusRate = 1.0; }
        else if (total >= 81) { this.rank = "エクセレント"; this.bonusRate = 0.5; }
        else if (total >= 61) { this.rank = "グッド"; this.bonusRate = 0.1; }
        else { this.rank = "ノーマル"; this.bonusRate = 0.0; }

        this.isResultMode = true;
        this.resultTimer = 0;
        this.starAnimX = 0;
        this.stampScale = 0;

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
        this.updateSparkles(); // リザルト中もキラキラさせる

        const playSound = () => AudioSys.playTone(800, 'sine', 0.1);

        if (this.resultTimer === 30) { this.displayScores.mix = cm.currentStar.scoreMix; playSound(); }
        if (this.resultTimer === 60) { this.displayScores.mold = cm.currentStar.scoreMold; playSound(); }
        if (this.resultTimer === 90) { this.displayScores.fire = cm.currentStar.scoreFire; playSound(); }
        if (this.resultTimer === 120) { this.displayScores.polish = cm.currentStar.scorePolish; playSound(); }
        if (this.resultTimer === 160) {
            const s = cm.currentStar;
            this.displayScores.total = s.scoreMix + s.scoreMold + s.scoreFire + s.scorePolish;
            AudioSys.playTone(1200, 'square', 0.2);
            this.btnResultOK.visible = true;
        }

        // カウントアップ
        if (this.resultTimer >= 160) {
            if (this.countUpValue < this.targetStars) {
                const diff = this.targetStars - this.countUpValue;
                const step = Math.ceil(diff * 0.1);
                this.countUpValue += step;
                if (this.resultTimer % 4 === 0) AudioSys.playTone(1500, 'sine', 0.05);
            } else {
                this.countUpValue = this.targetStars;
                if (this.stampScale === 0) {
                    this.stampScale = 2.0;
                    AudioSys.playTone(600, 'square', 0.2);
                }
            }
        }

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
        const imgs = CraftPolishingImages;
        const ctx = CraftManager.ctx;

        // 1. 背景
        if (imgs.bgPolish.complete) {
            ctx.drawImage(imgs.bgPolish, offsetX, 0, 1000, 600);
        } else {
            ctx.fillStyle = '#f5e6d3'; // fallback
            ctx.fillRect(offsetX, 0, 1000, 600);
        }

        if (this.isResultMode) {
            this.drawResultMode(offsetX);
            return;
        }

        CraftManager.drawTitle(offsetX, "しあげ");
        CraftManager.drawSpeechBubble(offsetX, "みがいて完成させよう！");

        this.drawPolishingStar(offsetX, 0);

        if (this.showTutorial) {
            this.drawTutorial(offsetX);
        }
    },

    drawTutorial: function (offsetX) {
        const ctx = CraftManager.ctx;
        const imgs = CraftPolishingImages;
        const starCx = 500;
        const starCy = 280;

        // 画面を暗くする
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(offsetX, 0, 1000, 600);

        // 手のアイコンをジグザグに動かす
        if (imgs.tutorialHand.complete) {
            const hand = imgs.tutorialHand;
            const hx = starCx + Math.sin(this.tutorialTimer * 0.2) * 120;
            const hy = starCy + Math.cos(this.tutorialTimer * 0.03) * 80;

            ctx.save();
            ctx.translate(offsetX + hx, hy);
            const hw = 180;
            const hh = 180;
            ctx.drawImage(hand, -hw / 2, -hh / 2, hw, hh);
            ctx.restore();
        }
    },

    drawResultMode: function (offsetX) {
        this.drawPolishingStar(offsetX, this.starAnimX);
        this.drawResultWindow(offsetX);
    },

    drawPolishingStar: function (offsetX, slideX) {
        const ctx = CraftManager.ctx;
        const cx = offsetX + 500 + slideX;
        const cy = 280;
        const size = 300;
        const imgs = CraftPolishingImages;

        // 1. 下地 (Shiny)
        // 磨きが始まっていない(shineLevel=0)ときは表示しない（移行中などのチラつき防止）
        if (this.shineLevel > 0) {
            if (imgs.starShiny.complete) {
                ctx.drawImage(imgs.starShiny, cx - size / 2, cy - size / 2, size, size);
            } else {
                ctx.fillStyle = '#ffd700';
                ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 10, 0, Math.PI * 2); ctx.fill();
            }
        }

        // 2. 汚れ (Dirty) - マスクされたCanvasを描画
        if (this.maskCanvas) {
            if (this.shineLevel > 0) {
                // 磨き中の場合はマスクを描画
                ctx.drawImage(this.maskCanvas, cx - size / 2, cy - size / 2, size, size);
            } else if (imgs.starDirty.complete) {
                // 磨き前(0)は、マスクではなく直接汚れ画像を表示（ロード待ち回避）
                ctx.drawImage(imgs.starDirty, cx - size / 2, cy - size / 2, size, size);
            }
        }

        // 3. キラキラエフェクト
        for (const p of this.sparkleParticles) {
            const sImg = imgs.sparkles[p.frame];
            if (sImg && sImg.complete) {
                // offsetX はスクリーン座標系変換のために必要 (particle.xはスクリーン座標)
                // particle.x は 0-1000 なので、カメラ移動分(offsetX)を足す
                // ただし p.x は Input.x (スクリーン) 由来。
                // 描画先コンテキストは translate(-camera.x) されている。
                // つまり p.x + offsetX で描画すれば合うはず (offsetX = camera.x = 3000)

                // ただし resultMode中の slideX 分はずらす必要がある
                const drawX = offsetX + p.x + slideX; // 簡易補正
                const drawY = p.y;

                const w = 64 * p.scale;
                const h = 64 * p.scale;
                ctx.drawImage(sImg, drawX - w / 2, drawY - h / 2, w, h);
            }
        }
    },

    drawResultWindow: function (offsetX) {
        const ctx = CraftManager.ctx;
        const w = 440;
        const h = 420;
        const cx = offsetX + 250;
        const cy = 300;

        ctx.save();
        ctx.translate(cx - w / 2, cy - h / 2);

        // ウィンドウ背景
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeStyle = '#9c27b0';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 20);
        ctx.fill();
        ctx.stroke();

        // タイトル
        ctx.fillStyle = '#7b1fa2';
        ctx.font = "900 26px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText("けっか はっぴょう", w / 2, 40);

        // 各スコア
        const labels = [
            { txt: "きじづくり", val: this.displayScores.mix, max: 30, y: 85 },
            { txt: "かたぬき", val: this.displayScores.mold, max: 30, y: 120 },
            { txt: "ほしやき", val: this.displayScores.fire, max: 30, y: 155 },
            { txt: "しあげ", val: this.displayScores.polish, max: 5, y: 190 },
        ];

        ctx.font = "900 20px 'M PLUS Rounded 1c', sans-serif";
        labels.forEach(item => {
            ctx.fillStyle = '#555';
            ctx.textAlign = 'left';
            ctx.fillText(item.txt, 40, item.y);
            if (item.val >= 0) {
                ctx.textAlign = 'right';
                const ratio = item.val / item.max;
                ctx.fillStyle = ratio === 1 ? '#e91e63' : '#333';
                ctx.fillText(`${item.val}/${item.max}`, w - 40, item.y);
            }
        });

        // 合計とランク
        if (this.displayScores.total >= 0) {
            ctx.strokeStyle = '#ce93d8';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(30, 210); ctx.lineTo(w - 30, 210); ctx.stroke();

            ctx.textAlign = 'left';
            ctx.font = "900 32px 'M PLUS Rounded 1c', sans-serif";
            const r = this.rank;
            let rColor = '#333';
            if (r === 'パーフェクト') rColor = '#ffd700';
            else if (r === 'エクセレント') rColor = '#ff4500';
            else if (r === 'グッド') rColor = '#1e90ff';

            ctx.fillStyle = rColor;
            ctx.fillText(`${this.displayScores.total}てん`, 40, 260);
            ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText(r, 40, 310);

            // ボーナス表記
            if (this.rank !== 'ノーマル') {
                const bonusCount = this.targetStars - CraftManager.craftAmount;
                if (bonusCount > 0) {
                    ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
                    ctx.fillStyle = '#e91e63';
                    ctx.fillText(`ついかボーナス ほし+${bonusCount}こ`, 40, 350);
                }
            }

            // スタンプ (星画像使用)
            if (this.countUpValue > 0) {
                const badgeX = w - 80;
                const badgeY = h - 80;
                const scale = this.stampScale > 0 ? this.stampScale : 1.0;

                ctx.save();
                ctx.translate(badgeX, badgeY);
                ctx.scale(scale, scale);
                ctx.rotate(0.2);

                const stampImg = CraftPolishingImages.stampStar;
                if (stampImg.complete) {
                    // 画像 (150x150想定) を中心に
                    ctx.drawImage(stampImg, -75, -75, 150, 150);
                } else {
                    // 代替
                    ctx.fillStyle = '#ffeb3b';
                    ctx.beginPath(); CraftManager.drawStarShape(ctx, 0, 0, 60, 30); ctx.fill();
                }

                // 数字
                ctx.fillStyle = '#d84315';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'white'; ctx.shadowBlur = 5;

                ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
                ctx.fillText("ごうけい", 0, -30);
                ctx.font = "900 56px 'M PLUS Rounded 1c', sans-serif";
                ctx.fillText(`${this.countUpValue}`, 0, 10);
                ctx.font = "900 24px 'M PLUS Rounded 1c', sans-serif";
                ctx.fillText("こ", 60, 40);

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