/**
 * --- Craft 3: ほし焼き (画像差し替え版・5個焼き対応) ---
 */

// 画像リソース管理
const CraftFiringImages = {
    loaded: false,
    path: 'image/craft_image3/',

    bgKiln: new Image(),

    // 扉 (閉, 半, 開)
    door: [],

    // 星 (生, 焼, 焦1, 焦2, 焦3)
    star: {
        raw: new Image(),
        baked: new Image(),
        burnt1: new Image(),
        burnt2: new Image(),
        burnt3: new Image()
    },

    // 火 (Low[3], Mid[3], High[3])
    fire: {
        low: [],
        mid: [],
        high: []
    },

    // 薪 (待機, 投げ, 燃焼[3])
    wood: {
        idle: new Image(),
        thrown: new Image(),
        burn: []
    },

    loadAssets: async function () {
        if (this.loaded) return;

        const promises = [];
        const path = this.path;
        const setSrc = (name) => CraftManager.loadImage(path + name);

        promises.push(setSrc('bg_kiln.png').then(img => this.bgKiln = img));

        // 扉
        this.door = new Array(3);
        promises.push(setSrc('door_closed.png').then(img => this.door[0] = img));
        promises.push(setSrc('door_half.png').then(img => this.door[1] = img));
        promises.push(setSrc('door_open.png').then(img => this.door[2] = img));

        // 星
        promises.push(setSrc('star_raw.png').then(img => this.star.raw = img));
        promises.push(setSrc('star_baked.png').then(img => this.star.baked = img));
        promises.push(setSrc('star_burnt_1.png').then(img => this.star.burnt1 = img));
        promises.push(setSrc('star_burnt_2.png').then(img => this.star.burnt2 = img));
        promises.push(setSrc('star_burnt_3.png').then(img => this.star.burnt3 = img));

        // 火 (ループアニメは連番)
        this.fire.low = new Array(3);
        this.fire.mid = new Array(3);
        this.fire.high = new Array(3);
        this.wood.burn = new Array(3);

        for (let i = 0; i < 3; i++) {
            promises.push(setSrc(`fire_low_${i + 1}.png`).then(img => this.fire.low[i] = img));
            promises.push(setSrc(`fire_mid_${i + 1}.png`).then(img => this.fire.mid[i] = img));
            promises.push(setSrc(`fire_high_${i + 1}.png`).then(img => this.fire.high[i] = img));
            promises.push(setSrc(`wood_burn_${i + 1}.png`).then(img => this.wood.burn[i] = img));
        }

        // 薪
        promises.push(setSrc('wood_idle.png').then(img => this.wood.idle = img));
        promises.push(setSrc('wood_thrown.png').then(img => this.wood.thrown = img));

        await Promise.all(promises);
        this.loaded = true;
    },

    // 互換性
    load: function () { this.loadAssets(); }
};

const CraftFiring = {
    // --- 定数 ---
    TARGET_TEMP_MIN: 52,
    TARGET_TEMP_MAX: 88,
    TEMP_MAX_GAUGE: 120,

    BAKE_SPEED_OPTIMAL: 100 / (60 * 20),
    BAKE_SPEED_LOW: 100 / (60 * 30),
    DELAY_QUEUE_SIZE: 60,

    // --- 状態変数 ---
    ovenTemp: 20,
    firePower: 0,
    fireFuel: 0,
    isDoorOpen: false,
    starState: 'none', // none, raw, baking, baked, burnt
    starSize: 1.0,
    bakeProgress: 0,
    timeOverheat: 0,
    timeLowTemp: 0,
    smokeLevel: 0,
    penaltyScore: 0,

    fuelQueue: [],

    // アニメーション管理
    thrownWoods: [],   // 投げられた薪 {sx, sy, tx, ty, h, t}
    burningWoods: [],  // 燃えている薪 {x, y, life, maxLife, animOffset}

    animFrameTimer: 0, // 全体のアニメーションフレームカウンタ
    doorAnimFrame: 0,  // 0(閉)～10(開)の11段階
    doorStateIndex: 0, // 0:閉, 1:半, 2:開 (画像切り替え用)

    // ★追加: 5個の星の個別パラメータ {ox, oy, rot, flip, baseScale}
    starPieces: [],

    // 星の表示切り替え（フェード用）
    starTransition: {
        currentImg: null,
        prevImg: null,
        fade: 1.0
    },

    fireSoundSource: null,

    // UI定義
    ui: {
        btnFuel: { x: 770, y: 350, w: 120, h: 120, text: "" }, // まきボタン
        // 「入れる」ボタンの座標 (座布団なし、画像クリック)
        // star_raw.png を左側に配置 (1.5倍サイズ 225x225)
        btnInsert: { x: 20, y: 160, w: 225, h: 225, text: "入れる", visible: false },

        doorArea: { x: 330, y: 160, w: 340, h: 180 } // 窯の扉クリックエリア(目安)
    },

    showTutorial: false,

    loadAssets: async function () {
        await CraftFiringImages.loadAssets();
        // BGM/SE ロード
        await Promise.all([
            CraftManager.loadSound('bgm_craft3', 'sounds/atelier_bgm1.mp3'),
            CraftManager.loadSound('se_fire', 'sounds/fire.mp3'),
            CraftManager.loadSound('se_open', 'sounds/open.mp3'),
            CraftManager.loadSound('se_firewood', 'sounds/firewood.mp3')
        ]);
    },

    init: function () {
        // CraftFiringImages.load(); // 事前ロード済み
        this.resetParams();
        CraftManager.currentStar.bakeTemp = this.ovenTemp;
        CraftManager.ui.btnNext.visible = false;

        // BGM再生
        if (CraftManager.state === 'firing') {
            AudioSys.playBGM('bgm_craft3', 0.3);
        }

        this.showTutorial = !hasSeenFireTutorial;
    },

    end: function () {
        // AudioSys.stopBGM(); // クラフト4まで継続させるためコメントアウト
        this.firePower = 0; // 強制的に火力を0にして音のループを止める
        if (this.fireSoundSource) {
            try { this.fireSoundSource.stop(); } catch (e) { }
            this.fireSoundSource = null;
        }

        let s = 0;
        if (this.starState === 'burnt') {
            s = 5;
        } else {
            const progress = Math.min(100, Math.max(0, this.bakeProgress));
            s = Math.floor(progress * 0.3);
            s = Math.max(0, s - this.penaltyScore);
        }
        CraftManager.currentStar.scoreFire = s;
        console.log("Fire Score:", CraftManager.currentStar.scoreFire);
    },

    resetParams: function () {
        this.ovenTemp = 0;
        this.firePower = 0;
        this.fireFuel = 0;
        this.isDoorOpen = false;
        this.starState = 'none';
        this.starSize = 1.0;
        this.bakeProgress = 0;
        this.timeOverheat = 0;
        this.timeLowTemp = 0;
        this.smokeLevel = 0;
        this.penaltyScore = 0;
        this.fuelQueue = new Array(this.DELAY_QUEUE_SIZE).fill(0);

        this.thrownWoods = [];
        this.burningWoods = [];
        this.animFrameTimer = 0;
        this.doorAnimFrame = 0;
        this.doorStateIndex = 0;
        this.starPieces = []; // リセット
        this.starTransition = { currentImg: null, prevImg: null, fade: 1.0 };

        this.ui.btnInsert.visible = true;
    },

    update: function () {
        if (CraftManager.ui.btnNext.visible) return;

        if (this.showTutorial) {
            this.updateTutorial();
            return;
        }

        const cm = CraftManager;
        const inputX = Input.x + cm.camera.x - 2000; // Offset 2000
        const inputY = Input.y;

        // --- 入力処理 ---
        if (Input.isJustPressed) {
            // 薪投入
            // 判定エリアはボタン画像サイズに合わせる
            if (this.hitTestCircle(inputX, inputY, this.ui.btnFuel.x + 60, this.ui.btnFuel.y + 60, 60)) {
                this.addFuel();
                AudioSys.playSE('se_firewood', 0.5);
            }

            // 扉の開閉
            const da = this.ui.doorArea;
            if (inputX >= da.x && inputX <= da.x + da.w && inputY >= da.y && inputY <= da.y + da.h) {
                this.isDoorOpen = !this.isDoorOpen;
                AudioSys.playSE('se_open', 0.5);
                AudioSys.playTone(500, 'square', 0.1);
            }

            // 星を入れる (生星画像をクリック)
            if (this.starState === 'none' && this.ui.btnInsert.visible) {
                const bi = this.ui.btnInsert;
                // 画像の中心からの距離などで判定してもよいが、矩形で簡易判定
                if (inputX >= bi.x && inputX <= bi.x + bi.w && inputY >= bi.y && inputY <= bi.y + bi.h) {
                    this.insertStar();
                }
            }
        }

        // --- ロジック更新 ---
        this.animFrameTimer++;

        // 1. 火力計算
        let fuelInput = 0;
        if (this.fireFuel > 0) {
            fuelInput = 0.22;
            this.fireFuel -= 0.1;
        }
        this.fuelQueue.push(fuelInput);
        const delayedInput = this.fuelQueue.shift();
        this.firePower = Math.max(0, this.firePower + delayedInput - 0.05);

        // 2. 温度計算
        const diff = (this.firePower * 3) - this.ovenTemp;
        this.ovenTemp += diff * 0.05;

        if (this.isDoorOpen) {
            this.ovenTemp -= 0.4;
        }
        this.ovenTemp = Math.max(0, Math.min(this.TEMP_MAX_GAUGE + 10, this.ovenTemp));
        cm.currentStar.bakeTemp = this.ovenTemp;

        // 3. 星の状態変化
        if (this.starState !== 'none' && this.starState !== 'burnt') {
            const temp = this.ovenTemp;
            const isOptimal = temp >= this.TARGET_TEMP_MIN && temp <= this.TARGET_TEMP_MAX;
            const isHigh = temp > this.TARGET_TEMP_MAX;
            const isLow = temp < this.TARGET_TEMP_MIN;

            if (isOptimal || isHigh) {
                this.bakeProgress += this.BAKE_SPEED_OPTIMAL;
            } else {
                this.bakeProgress += this.BAKE_SPEED_LOW;
            }

            if (isLow && this.bakeProgress < 100) {
                this.starSize = Math.max(0.6, this.starSize - 0.0003);
            }

            // --- 高温時の処理 ---
            if (isHigh) {
                this.timeOverheat++;

                // ★追加: 高温ペナルティ (3秒ごとに1点減点)
                // 180フレーム(3秒)経過するたびに減点
                if (this.timeOverheat > 0 && this.timeOverheat % 180 === 0) {
                    this.penaltyScore++;
                    console.log("Overheat Penalty! Total deduction:", this.penaltyScore);
                }

                // 煙・焦げの演出処理
                if (this.timeOverheat > 180) {
                    this.smokeLevel = 1;
                    if (this.timeOverheat % 10 === 0) {
                        CraftManager.addParticle(500, 250, 'rgba(100,100,100,0.5)', 5);
                    }
                }
                if (this.timeOverheat > 360) {
                    this.smokeLevel = 2;
                }
                if (this.timeOverheat > 540) {
                    this.smokeLevel = 3;
                    this.starState = 'burnt';
                    this.bakeProgress = 100;
                }
            } else {
                // 適正温度に戻ったらカウントを徐々に減らす（冷却猶予）
                this.timeOverheat = Math.max(0, this.timeOverheat - 1);
                if (this.timeOverheat < 180) this.smokeLevel = 0;
            }

            // --- 低温ペナルティ ---
            if (isLow) {
                this.timeLowTemp++;
                if (this.timeLowTemp >= 180) { // 3秒(180フレーム)
                    this.penaltyScore++;
                    this.timeLowTemp = 0;
                    console.log("Low Temp Penalty! Total deduction:", this.penaltyScore);
                }
            } else {
                // 低温は累積させないならここでリセット、させるなら何もしない
                // 現状はリセットせず（適正に戻ってもカウント維持するならこのelseは空でOK）
                // 指示通りなら「3秒経過ごとに」なので、一旦リセットしない方が厳しい判定になるが、
                // 通常のゲームバランス的には「適正に戻ったらリセット」が自然かもしれません。
                // ここでは既存のコードに合わせて何もしない（累積継続）か、リセットするか選べますが、
                // 高温側が「徐々に減らす」仕様なので、低温側も合わせるなら以下のようにしても良いです。
                // this.timeLowTemp = Math.max(0, this.timeLowTemp - 1);
            }
        }

        if (this.bakeProgress >= 100 && !cm.ui.btnNext.visible) {
            this.finishBaking();
        }

        // 演出: 扉の状態 (0=閉, 1=半, 2=開)
        const targetAnimFrame = this.isDoorOpen ? 10 : 0;
        if (this.doorAnimFrame < targetAnimFrame) this.doorAnimFrame++;
        if (this.doorAnimFrame > targetAnimFrame) this.doorAnimFrame--;

        // 状態遷移: 0-4(閉), 5-9(半), 10(開)
        if (this.doorAnimFrame === 0) this.doorStateIndex = 0;
        else if (this.doorAnimFrame === 10) this.doorStateIndex = 2;
        else this.doorStateIndex = 1;

        // 薪アニメ更新 (投げ込み)
        for (let i = this.thrownWoods.length - 1; i >= 0; i--) {
            const w = this.thrownWoods[i];
            w.t += 0.08;
            if (w.t >= 1) {
                // 着地したら燃焼リストへ移動
                this.addBurningWood();
                this.thrownWoods.splice(i, 1);
            }
        }

        // 薪アニメ更新 (燃焼)
        for (let i = this.burningWoods.length - 1; i >= 0; i--) {
            const bw = this.burningWoods[i];
            bw.life--;
            if (bw.life <= 0) {
                this.burningWoods.splice(i, 1);
            }
        }

        // 音
        if (this.firePower > 0.1) {
            if (!this.fireSoundSource) this.fireSoundSource = AudioSys.startLoop('se_fire', 0.4);
        } else {
            if (this.fireSoundSource) {
                try { this.fireSoundSource.stop(); } catch (e) { }
                this.fireSoundSource = null;
            }
        }

        // --- 星の表示イメージ決定とフェード更新 ---
        const targetImg = this.getEffectiveStarImage();
        if (this.starTransition.currentImg !== targetImg) {
            // 既にフェード中だった場合は、今の状態を prev に移す
            this.starTransition.prevImg = this.starTransition.currentImg;
            this.starTransition.currentImg = targetImg;
            this.starTransition.fade = 0;
        }
        if (this.starTransition.fade < 1.0) {
            this.starTransition.fade = Math.min(1.0, this.starTransition.fade + 1 / 60);
        }
    },

    updateTutorial: function () {
        if (Input.isJustPressed) {
            this.showTutorial = false;
            hasSeenFireTutorial = true;
            if (typeof DataManager !== 'undefined') DataManager.save();
            AudioSys.playTone(800, 'square', 0.1);
        }
    },

    getEffectiveStarImage: function () {
        const imgs = CraftFiringImages;
        if (this.starState === 'none') return null;
        if (this.starState === 'burnt') return imgs.star.burnt3;

        if (this.smokeLevel === 1) return imgs.star.burnt1;
        if (this.smokeLevel === 2) return imgs.star.burnt2;
        if (this.smokeLevel === 3) return imgs.star.burnt3;

        if (this.bakeProgress > 50) return imgs.star.baked;
        return imgs.star.raw;
    },

    hitTestCircle: function (mx, my, cx, cy, r) {
        const dx = mx - cx;
        const dy = my - cy;
        return (dx * dx + dy * dy) <= r * r;
    },

    addFuel: function () {
        this.fireFuel += 12;
        if (this.fireFuel > 100) this.fireFuel = 100;

        // 投げ込みアニメ追加
        this.thrownWoods.push({
            sx: this.ui.btnFuel.x + 60, sy: this.ui.btnFuel.y + 60,
            tx: 500, ty: 435, // 少し下へ調整
            h: 120,
            t: 0
        });
    },

    addBurningWood: function () {
        // 火の中に薪を追加（位置はランダムに少しずらす）
        this.burningWoods.push({
            x: 500 + (Math.random() - 0.5) * 100,
            y: 435 + (Math.random() - 0.5) * 20, // 少し下へ調整
            life: 120, // 2秒 (60fps * 2)
            maxLife: 120,
            animOffset: Math.floor(Math.random() * 3)
        });
    },

    insertStar: function () {
        this.starState = 'raw';
        this.ui.btnInsert.visible = false;
        AudioSys.playTone(600, 'sine', 0.1);

        // ★修正: 固定配置パターン（見栄え重視）
        // 奥から手前の順序で描画されるようにY座標を調整済み
        this.starPieces = [
            // 1. 左奥
            { ox: -100, oy: 20, rot: -0.2, flip: 1, baseScale: 0.55 },
            // 2. 右奥
            { ox: 100, oy: 20, rot: 0.2, flip: -1, baseScale: 0.6 },
            // 3. 中央（少し奥）
            { ox: 0, oy: 15, rot: 0.05, flip: 1, baseScale: 0.65 },
            // 4. 左手前
            { ox: -60, oy: 40, rot: 0.15, flip: -1, baseScale: 0.75 },
            // 5. 右手前
            { ox: 60, oy: 45, rot: -0.1, flip: 1, baseScale: 0.78 }
        ];

        // 念のため描画順（Y座標昇順）でソート
        this.starPieces.sort((a, b) => a.oy - b.oy);
    },

    finishBaking: function () {
        const cm = CraftManager;
        this.fireFuel = 0;
        this.firePower = 0;
        this.ovenTemp = 0;
        cm.currentStar.bakeTemp = 0;
        this.isDoorOpen = true;

        if (this.starState === 'burnt') {
            cm.currentStar.bakeState = 'burnt';
            cm.currentStar.color = '#333';
            AudioSys.playTone(200, 'sawtooth', 0.5);
        } else {
            cm.currentStar.bakeState = 'good';
            cm.currentStar.color = '#ffd700';
            AudioSys.playTone(1000, 'sine', 0.1);
        }
        cm.ui.btnNext.visible = true;
    },

    // --- 描画処理 ---
    draw: function (offsetX) {
        const cm = CraftManager;
        const ctx = cm.ctx;
        const imgs = CraftFiringImages;

        // 1. 背景描画
        if (imgs.bgKiln.complete) {
            ctx.drawImage(imgs.bgKiln, offsetX, 0, 1000, 600);
        } else {
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(offsetX, 0, 1000, 600);
        }

        // 2. 薪と火の描画
        // 火の部屋: 400x120, 中心(500, 435)付近
        const fireCx = offsetX + 500;
        const fireCy = 435;

        // 火の描画イメージ決定
        let fireImg = null;
        const frame = Math.floor(this.animFrameTimer / 7.5) % 3; // 8fps

        if (this.fireFuel <= 0 && this.firePower <= 0.1) {
            fireImg = null;
        } else {
            if (this.ovenTemp > this.TARGET_TEMP_MAX) {
                fireImg = imgs.fire.high[frame];
            } else if (this.ovenTemp >= this.TARGET_TEMP_MIN) {
                fireImg = imgs.fire.mid[frame];
            } else {
                fireImg = imgs.fire.low[frame];
            }
        }

        if (fireImg && fireImg.complete) {
            // fireImg size: 400x120
            ctx.drawImage(fireImg, fireCx - 200, fireCy - 60, 400, 120);
        }

        // 燃えている薪を描画 (火の上に重ねる)
        for (const bw of this.burningWoods) {
            // 3枚ループ (8fps = 7.5フレームごとに切り替え)
            const frame = Math.floor((this.animFrameTimer + bw.animOffset) / 7.5) % 3;
            const wImg = imgs.wood.burn[frame];
            if (wImg && wImg.complete) {
                // そのままのサイズで中心基準で描画 (残り30フレームでフェードアウト)
                ctx.save();
                if (bw.life < 30) {
                    ctx.globalAlpha = bw.life / 30;
                }
                ctx.drawImage(wImg, offsetX + bw.x - wImg.width / 2, bw.y - wImg.height / 2);
                ctx.restore();
            }
        }


        // 3. 窯の中身 (星)
        const bakeCx = offsetX + 500;
        const bakeCy = 250;

        // --- 星のオーバーラップ描画 ---
        if (this.starState !== 'none' && this.bakeProgress < 100) {
            // フェード状態取得
            const currentImg = this.starTransition.currentImg;
            const prevImg = this.starTransition.prevImg;
            const fade = this.starTransition.fade;

            // 5個の星を順番に描画
            if (this.starPieces.length > 0) {
                for (const piece of this.starPieces) {
                    const px = bakeCx + piece.ox;
                    const py = bakeCy + piece.oy;

                    // starSize (低温縮小ペナルティ) も適用
                    const size = 150 * piece.baseScale * this.starSize;

                    ctx.save();
                    ctx.translate(px, py);
                    ctx.rotate(piece.rot);
                    ctx.scale(piece.flip, 1); // 左右反転

                    // 前の画像（フェードアウト）
                    if (prevImg && prevImg.complete) {
                        ctx.save();
                        ctx.globalAlpha = 1.0 - fade;
                        ctx.drawImage(prevImg, -size / 2, -size / 2, size, size);
                        ctx.restore();
                    }
                    // 今の画像（フェードイン）
                    if (currentImg && currentImg.complete) {
                        ctx.save();
                        ctx.globalAlpha = fade;
                        ctx.drawImage(currentImg, -size / 2, -size / 2, size, size);
                        ctx.restore();
                    }

                    ctx.restore();
                }
            } else {
                // 万が一 starPieces がない場合（リセット直後など）のフォールバック
                // 通常は insertStar で入る
            }

            // 煙エフェクト (ぼかし・歪み版)
            if (this.smokeLevel > 0) {
                ctx.save();
                if (ctx.filter) ctx.filter = 'blur(10px)'; // ぼかしフィルタ

                const puffCount = 1 + this.smokeLevel;
                for (let i = 0; i < puffCount; i++) {
                    const t = (this.timeOverheat * 0.8 + i * 30) % 80;
                    const life = 1.0 - t / 80;
                    const shiftX = Math.sin((this.timeOverheat + i * 45) / 15) * 15;

                    ctx.fillStyle = `rgba(60, 60, 60, ${life * 0.5})`;
                    ctx.beginPath();
                    // ellipse で形を歪ませる
                    const rx = (15 + t * 0.5) * (1.2 + Math.sin(i + this.timeOverheat * 0.05) * 0.2);
                    const ry = (10 + t * 0.3) * (0.8 + Math.cos(i + this.timeOverheat * 0.05) * 0.2);
                    ctx.ellipse(bakeCx + shiftX, bakeCy - 40 - t, rx, ry, t * 0.02, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // 4. 扉の描画
        let doorImg = imgs.door[this.doorStateIndex];

        if (doorImg && doorImg.complete) {
            // そのままのサイズで描画 (少し下へ +10px)
            let dx = bakeCx - doorImg.width / 2;
            let dy = bakeCy - doorImg.height / 2 + 10;
            if (this.doorStateIndex === 2) dx += 260; // 開いている時は260px右へ
            ctx.drawImage(doorImg, dx, dy);
        } else {
            // 画像がない場合の代替
            if (!this.isDoorOpen) {
                ctx.fillStyle = 'rgba(100, 50, 0, 0.5)';
                ctx.fillRect(bakeCx - 170, bakeCy - 90, 340, 180);
            }
        }

        // 投げ込まれる薪
        for (const w of this.thrownWoods) {
            const x = (1 - w.t) * w.sx + w.t * w.tx;
            const y = (1 - w.t) * w.sy + w.t * w.ty - Math.sin(w.t * Math.PI) * w.h;

            ctx.save();
            ctx.translate(offsetX + x, y);
            ctx.rotate(w.t * Math.PI); // 回転量を1/4へ (元は 4 * PI)
            if (imgs.wood.thrown.complete) {
                // そのままのサイズ
                ctx.drawImage(imgs.wood.thrown, -imgs.wood.thrown.width / 2, -imgs.wood.thrown.height / 2);
            } else {
                ctx.fillStyle = '#5d4037';
                ctx.fillRect(-20, -10, 40, 20);
            }
            ctx.restore();
        }

        // 5. UI (ボタン等)
        this.drawUI(offsetX);

        // 6. 焼き上がり拡大表示 (ここだけ星1つに戻す)
        if (this.bakeProgress >= 100) {
            this.drawFinishedStar(offsetX);
        }

        // 7. テキスト情報
        CraftManager.drawTitle(offsetX, "ほしやき");
        this.drawGuideMessage(offsetX);

        // --- チュートリアル表示 ---
        if (this.showTutorial) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(offsetX, 0, 1000, 600);

            ctx.globalAlpha = 1.0;

            // 1. 扉（閉）
            const doorImg = imgs.door[0]; // door_closed.png
            if (doorImg && doorImg.complete) {
                const dx = offsetX + 500 - doorImg.width / 2;
                const dy = 250 - doorImg.height / 2 + 10;
                ctx.drawImage(doorImg, dx, dy);
            }

            // 2. 薪ボタン
            this.drawFuelButton(offsetX);

            // 3. 温度ゲージ
            this.drawTempGauge(offsetX);

            // 4. 説明テキスト
            ctx.save();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = "center";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 10;
            ctx.fillText("まきをいれる - ゆっくりおんどを上げる", offsetX + 500, 420);
            ctx.fillText("まどをあける - すばやくおんどを下げる", offsetX + 500, 460);
            ctx.restore();
        }
    },

    drawUI: function (offsetX) {
        // -- 薪ボタン --
        this.drawFuelButton(offsetX);

        // -- 入れるボタン (生星画像1個 + テキスト) --
        if (this.ui.btnInsert.visible) {
            const btnI = this.ui.btnInsert;
            const imgs = CraftFiringImages;
            const ctx = CraftManager.ctx;
            if (imgs.star.raw.complete) {
                ctx.drawImage(imgs.star.raw, offsetX + btnI.x, btnI.y, btnI.w, btnI.h);
            }
            // テキストのみオーバーレイ (黒枠なし)
            ctx.fillStyle = '#fff';
            ctx.font = "800 40px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("入れる", offsetX + btnI.x + btnI.w / 2, btnI.y + btnI.h / 2);
        }

        // -- 温度ゲージ --
        this.drawTempGauge(offsetX);

        // -- 焼き上がりゲージ --
        const pgW = 400;
        const pgH = 30;
        const pgX = offsetX + 500 - pgW / 2;
        const pgY = 130;
        ctx.fillStyle = '#fff';
        ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText("できあがり", pgX + pgW, pgY);
        ctx.fillStyle = '#eee';
        ctx.beginPath(); ctx.roundRect(pgX, pgY, pgW, pgH, 15); ctx.fill();
        const pVal = Math.min(100, Math.max(0, this.bakeProgress));
        if (pVal > 0) {
            ctx.fillStyle = '#ffc107';
            ctx.beginPath(); ctx.roundRect(pgX, pgY, pgW * (pVal / 100), pgH, 15); ctx.fill();
        }
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(pgX, pgY, pgW, pgH, 15); ctx.stroke();
    },

    drawFinishedStar: function (offsetX) {
        const cm = CraftManager;
        const ctx = cm.ctx;
        const cx = offsetX + 500;
        const cy = 250;
        const imgs = CraftFiringImages;

        ctx.save();
        ctx.translate(cx, cy);
        const floatY = Math.sin(Date.now() / 300) * 10;
        ctx.translate(0, floatY);

        const scale = 2.0 * this.starSize;
        ctx.scale(scale, scale);

        let sImg = null;
        if (this.starState === 'burnt') sImg = imgs.star.burnt3;
        else sImg = imgs.star.baked;

        if (sImg && sImg.complete) {
            ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
            ctx.shadowBlur = 30;
            ctx.drawImage(sImg, -75, -75, 150, 150);
        }
        ctx.restore();
    },

    drawGuideMessage: function (offsetX) {
        let msg = "まきを入れて 温度を上げよう";
        if (this.starState === 'none') {
            if (this.ovenTemp >= this.TARGET_TEMP_MIN) msg = "いい温度だ！ ほしを入れよう";
            else if (this.isDoorOpen) msg = "入れるなら 今のうち！";
        } else if (this.starState === 'burnt') {
            msg = "ああっ！ こげてしまった...";
        } else if (this.bakeProgress >= 100) {
            msg = "やきあがり！";
        } else {
            if (this.ovenTemp > this.TARGET_TEMP_MAX) msg = "あつい！ まどを開けて冷ませ！";
            else if (this.ovenTemp < this.TARGET_TEMP_MIN) msg = "温度が低いぞ まきを足そう";
            else msg = "いい調子！ そのままキープ！";
        }
        CraftManager.drawSpeechBubble(offsetX, msg);
    },

    drawFuelButton: function (offsetX) {
        const ctx = CraftManager.ctx;
        const imgs = CraftFiringImages;
        const btnF = this.ui.btnFuel;
        if (imgs.wood.idle.complete) {
            ctx.drawImage(imgs.wood.idle, offsetX + btnF.x + btnF.w / 2 - imgs.wood.idle.width / 2, btnF.y + btnF.h / 2 - imgs.wood.idle.height / 2);
        } else {
            ctx.fillStyle = '#795548';
            ctx.beginPath(); ctx.arc(offsetX + btnF.x + 60, btnF.y + 60, 60, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#fff';
        ctx.font = "800 40px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("まき", offsetX + btnF.x + btnF.w / 2 - 10, btnF.y + btnF.h / 2 - 10);
    },

    drawTempGauge: function (offsetX) {
        const ctx = CraftManager.ctx;
        const gx = offsetX + 910;
        const gy = 150;
        const gw = 40;
        const gh = 300;

        ctx.fillStyle = '#444';
        ctx.fillRect(gx, gy, gw, gh);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        for (let i = 0; i <= 10; i++) {
            const ly = gy + gh * (i / 10);
            ctx.beginPath(); ctx.moveTo(gx, ly); ctx.lineTo(gx + gw, ly); ctx.stroke();
        }

        const range = this.TEMP_MAX_GAUGE;
        const safeY1 = gy + gh * (1 - this.TARGET_TEMP_MAX / range);
        const safeY2 = gy + gh * (1 - this.TARGET_TEMP_MIN / range);
        ctx.fillStyle = 'rgba(76, 175, 80, 0.6)';
        ctx.fillRect(gx, safeY1, gw, safeY2 - safeY1);

        const curH = Math.min(gh, Math.max(0, (this.ovenTemp / range) * gh));
        const barY = gy + gh - curH;
        let barCol = '#2196f3';
        if (this.ovenTemp >= this.TARGET_TEMP_MIN) barCol = '#4caf50';
        if (this.ovenTemp > this.TARGET_TEMP_MAX) barCol = '#f44336';
        ctx.fillStyle = barCol;
        ctx.fillRect(gx + 5, barY, gw - 10, curH);

        ctx.fillStyle = '#fff';
        ctx.font = "bold 16px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("おんど", gx + gw / 2, gy - 20);
    }
};