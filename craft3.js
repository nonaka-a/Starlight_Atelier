/**
 * --- Craft 3: ほし焼き (Refined) ---
 */
const CraftFiring = {
    // --- 定数 ---
    TARGET_TEMP_MIN: 52,
    TARGET_TEMP_MAX: 88,
    TEMP_MAX_GAUGE: 120,

    // 進行速度関連 (60FPS基準)
    BAKE_SPEED_OPTIMAL: 100 / (60 * 20), // 20秒で100%
    BAKE_SPEED_LOW: 100 / (60 * 30),     // 低温時は少し遅い

    // 遅延キューのサイズ (タイムラグの長さ)
    DELAY_QUEUE_SIZE: 60, // 約1秒遅れで火力が伝わるイメージ

    // --- 状態変数 ---
    ovenTemp: 20,       // 現在の窯の温度
    firePower: 0,       // 現在の熱源の強さ (ターゲット温度)
    fireFuel: 0,        // 薪の残量 (燃えると減る)

    isDoorOpen: false,  // 扉が開いているか
    starState: 'none',  // none, raw, baking, baked, burnt
    starSize: 1.0,      // 星の大きさ (1.0 = 100%)

    bakeProgress: 0,    // 焼き上がりゲージ (0-100)

    timeOverheat: 0,    // 適正温度を超えている時間 (フレーム)
    smokeLevel: 0,      // 0:なし, 1:煙, 2:焦げ小, 3:焦げ大

    fuelQueue: [],      // 火力上昇遅延用のキュー
    woodAnims: [],      // 薪のアニメーション用

    // UI定義
    ui: {
        btnFuel: { x: 770, y: 350, w: 120, h: 120, text: "まき" }, // 右側
        btnInsert: { x: 50, y: 300, w: 160, h: 80, text: "入れる", visible: false }, // 左側
        doorArea: { x: 350, y: 130, w: 300, h: 220 } // 窯の扉エリア
    },

    // 演出用
    fireAnimTimer: 0,
    doorAnimState: 0, // 0:閉, 1:開 (アニメーション用係数)
    fireSoundSource: null, // 火のループ音ソース保持用

    init: function () {
        this.resetParams();
        CraftManager.currentStar.bakeTemp = this.ovenTemp;
        CraftManager.ui.btnNext.visible = false;

        // BGMとSEのロード
        AudioSys.loadBGM('bgm_craft3', 'sounds/atelier_bgm1.mp3').then(() => {
            if (CraftManager.state === 'firing') {
                AudioSys.playBGM('bgm_craft3', 0.3);
            }
        });
        AudioSys.loadBGM('se_fire', 'sounds/fire.mp3');
        AudioSys.loadBGM('se_open', 'sounds/open.mp3');
    },

    end: function () {
        AudioSys.stopBGM();
        if (this.fireSoundSource) {
            try { this.fireSoundSource.stop(); } catch (e) { }
            this.fireSoundSource = null;
        }

        // スコア計算 (Max 30)
        let s = 0;
        if (this.starState === 'burnt') {
            s = 5; // 焦げたら一律5点
        } else {
            // 焼き加減 (0-100) -> 30点
            const progress = Math.min(100, Math.max(0, this.bakeProgress));
            s = Math.floor(progress * 0.3);
        }
        CraftManager.currentStar.scoreFire = s;
        console.log("Fire Score:", CraftManager.currentStar.scoreFire);
    },

    resetParams: function () {
        this.ovenTemp = 0;
        this.firePower = 0;
        this.fireFuel = 0;
        this.isDoorOpen = false;

        // 星の状態
        this.starState = 'none'; // 最初は入っていない
        this.starSize = 1.0;
        this.bakeProgress = 0;

        this.timeOverheat = 0;
        this.smokeLevel = 0;

        this.fuelQueue = new Array(this.DELAY_QUEUE_SIZE).fill(0);
        this.woodAnims = [];

        this.fireAnimTimer = 0;
        this.doorAnimState = 0;

        this.ui.btnInsert.visible = true;
    },

    update: function () {
        if (CraftManager.ui.btnNext.visible) return; // 完了したら更新停止

        const cm = CraftManager;
        // ローカル座標 (Offset 2000 からの相対位置) に変換。
        // ScreenX = LocalX + Offset - CameraX
        // LocalX = Input.x + CameraX - Offset
        const inputX = Input.x + cm.camera.x - 2000;
        const inputY = Input.y;

        // --- 入力処理 ---
        if (Input.isJustPressed) {
            // 薪投入 (いつでも可能)
            if (inputX >= this.ui.btnFuel.x && inputX <= this.ui.btnFuel.x + this.ui.btnFuel.w &&
                inputY >= this.ui.btnFuel.y && inputY <= this.ui.btnFuel.y + this.ui.btnFuel.h) {
                this.addFuel();
                AudioSys.playTone(200, 'square', 0.15);
            }

            // 扉の開閉 (トグル)
            const da = this.ui.doorArea;
            if (inputX >= da.x && inputX <= da.x + da.w && inputY >= da.y && inputY <= da.y + da.h) {
                this.isDoorOpen = !this.isDoorOpen;
                AudioSys.playSE('se_open', 0.5);
                AudioSys.playTone(500, 'square', 0.1);
            }

            // 星を入れる (窓が開いてなくても入れられる)
            if (this.starState === 'none' && this.ui.btnInsert.visible) {
                if (inputX >= this.ui.btnInsert.x && inputX <= this.ui.btnInsert.x + this.ui.btnInsert.w &&
                    inputY >= this.ui.btnInsert.y && inputY <= this.ui.btnInsert.y + this.ui.btnInsert.h) {
                    this.insertStar();
                }
            }
        }

        // --- ロジック更新 ---

        // 1. 薪と火力 (タイムラグ処理)
        // 薪のエネルギーをキューに追加
        let fuelInput = 0;
        if (this.fireFuel > 0) {
            fuelInput = 0.22; // 薪が燃えて火力を生む強さ
            this.fireFuel -= 0.1; // 薪の消費速度
        }
        this.fuelQueue.push(fuelInput);
        const delayedInput = this.fuelQueue.shift();

        // 火力ターゲット値の更新 (自然減衰あり) - 減衰を0.1から0.05に半減
        this.firePower = Math.max(0, this.firePower + delayedInput - 0.05);

        // 2. 温度計算
        // 温度は火力を目指して動く (追従)
        const diff = (this.firePower * 3) - this.ovenTemp; // ベースを20から0に変更
        // 少し早く上昇するように係数をアップ (0.02 -> 0.05)
        this.ovenTemp += diff * 0.05;

        // 扉開放による急速冷却
        if (this.isDoorOpen) {
            this.ovenTemp -= 0.4; // 今の半分ぐらい (0.8 -> 0.4)
        }

        // 温度の下限と上限
        this.ovenTemp = Math.max(0, Math.min(this.TEMP_MAX_GAUGE + 10, this.ovenTemp));

        // CraftManagerの変数にも反映(必要なら)
        cm.currentStar.bakeTemp = this.ovenTemp;

        // 3. 星の状態変化
        if (this.starState !== 'none' && this.starState !== 'burnt') {

            // 温度判定
            const temp = this.ovenTemp;
            const isOptimal = temp >= this.TARGET_TEMP_MIN && temp <= this.TARGET_TEMP_MAX;
            const isHigh = temp > this.TARGET_TEMP_MAX;
            const isLow = temp < this.TARGET_TEMP_MIN;

            // 進行度上昇
            if (isOptimal || isHigh) {
                this.bakeProgress += this.BAKE_SPEED_OPTIMAL;
            } else {
                this.bakeProgress += this.BAKE_SPEED_LOW;
            }

            // 低温時のペナルティ (縮む)
            if (isLow && this.bakeProgress < 100) {
                this.starSize = Math.max(0.6, this.starSize - 0.0003); // ゆっくり小さくなる
            }

            // 高温時の警告とペナルティ (焦げ)
            if (isHigh) {
                this.timeOverheat++;

                // 3秒 (180F) で煙
                if (this.timeOverheat > 180) {
                    this.smokeLevel = 1;
                    // 煙エフェクト
                    if (this.timeOverheat % 10 === 0) {
                        CraftManager.addParticle(500, 250, 'rgba(100,100,100,0.5)', 5);
                    }
                }

                // 6秒 (360F) で焦げ1段階
                if (this.timeOverheat > 360) {
                    this.smokeLevel = 2;
                    CraftManager.currentStar.color = '#8b4513'; // 茶色
                }

                // 9秒 (540F) で黒焦げアウト
                if (this.timeOverheat > 540) {
                    this.smokeLevel = 3;
                    this.starState = 'burnt';
                    CraftManager.currentStar.color = '#333'; // 黒
                    // ここでゲームオーバーにするか、焦げたまま出すか。
                    // 一旦そのまま完了扱いにする
                    this.bakeProgress = 100;
                }
            } else {
                // 適正に戻ったらカウントリセットしない方が厳しいが、今回はリセットせず維持(蓄積ダメージ)にする？
                // ユーザー仕様: "適正以上に3秒いると...さらにそこから" とあるので連続滞在と解釈
                this.timeOverheat = Math.max(0, this.timeOverheat - 1);
                if (this.timeOverheat < 180) this.smokeLevel = 0;
            }
        }

        // 完了判定
        if (this.bakeProgress >= 100 && !cm.ui.btnNext.visible) {
            this.finishBaking();
        }

        // 演出変数の更新
        this.fireAnimTimer++;
        if (this.isDoorOpen) {
            this.doorAnimState = Math.min(1, this.doorAnimState + 0.1);
        } else {
            this.doorAnimState = Math.max(0, this.doorAnimState - 0.1);
        }

        // 薪アニメ更新
        for (let i = this.woodAnims.length - 1; i >= 0; i--) {
            const w = this.woodAnims[i];
            w.t += 0.08; // アニメ速度
            if (w.t >= 1) {
                this.woodAnims.splice(i, 1);
            }
        }

        // 火の音ループ管理
        if (this.firePower > 0.1) {
            if (!this.fireSoundSource) {
                this.fireSoundSource = AudioSys.startLoop('se_fire', 0.4);
            }
        } else {
            if (this.fireSoundSource) {
                try { this.fireSoundSource.stop(); } catch (e) { }
                this.fireSoundSource = null;
            }
        }
    },

    addFuel: function () {
        // 薪を追加
        this.fireFuel += 12;
        // 最大燃料制限
        if (this.fireFuel > 100) this.fireFuel = 100;

        // 薪アニメ追加
        // ボタン(830, 410) -> 窯下部(500, 480)
        this.woodAnims.push({
            sx: 830, sy: 410,
            tx: 500, ty: 480,
            h: 120, // 高さ
            t: 0
        });

        // 薪投入パーティクル
        for (let i = 0; i < 5; i++) {
            CraftManager.addParticle(800 + Math.random() * 50, 450, '#deb887', 3);
        }
    },

    insertStar: function () {
        this.starState = 'raw';
        this.ui.btnInsert.visible = false;
        AudioSys.playTone(600, 'sine', 0.1);
    },

    finishBaking: function () {
        const cm = CraftManager;
        // 焼き上がり演出: 火を止め、温度を0にし、窓を開ける
        this.fireFuel = 0;
        this.firePower = 0;
        this.ovenTemp = 0;
        cm.currentStar.bakeTemp = 0;
        this.isDoorOpen = true;

        // 最終評価を保存
        if (this.starState === 'burnt') {
            cm.currentStar.bakeState = 'burnt';
            cm.currentStar.color = '#333';
            AudioSys.playTone(200, 'sawtooth', 0.5); // 失敗音
        } else {
            cm.currentStar.bakeState = 'good';
            if (this.bakeProgress >= 100) {
                cm.currentStar.color = '#ffd700'; // 黄金色
            }
            AudioSys.playTone(1000, 'sine', 0.1); // 成功音
        }

        // 焼き上がり時は次へボタンを表示
        cm.ui.btnNext.visible = true;
    },

    // --- 描画処理 ---
    draw: function (offsetX) {
        const cm = CraftManager;
        const ctx = cm.ctx;

        // 背景 (適当な壁色)
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(offsetX, 0, 1000, 600);

        // 1. 窯の描画
        this.drawKiln(offsetX);

        // 薪が飛ぶアニメ
        this.drawWoodAnims(offsetX);

        // 2. UI描画 (ゲージ、ボタン)
        this.drawUI(offsetX);

        // 3. 完成した星の拡大表示 (焼き上がり時)
        if (this.bakeProgress >= 100) {
            this.drawFinishedStar(offsetX);
        }

        // タイトル
        CraftManager.drawTitle(offsetX, "ほしやき");

        // 吹き出し (状態によるメッセージ)
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

    drawWoodAnims: function (offsetX) {
        const ctx = CraftManager.ctx;
        if (this.woodAnims.length === 0) return;

        ctx.save();
        ctx.fillStyle = '#5d4037';
        for (const w of this.woodAnims) {
            // 放物線
            const x = (1 - w.t) * w.sx + w.t * w.tx;
            const y = (1 - w.t) * w.sy + w.t * w.ty - Math.sin(w.t * Math.PI) * w.h;

            ctx.translate(offsetX + x, y);
            ctx.rotate(w.t * Math.PI * 4);
            ctx.fillRect(-20, -10, 40, 20); // 簡易薪
            ctx.translate(-(offsetX + x), -y); // 戻す (save/restoreコスト削減のため手動戻しもありだが、ここではresetTransformせずtranslateで戻す方が安全)
        }
        ctx.restore();
    },

    drawKiln: function (offsetX) {
        const ctx = CraftManager.ctx;
        const kx = offsetX + 500; // 窯の中心X
        const ky = 250;           // 窯の中心Y

        ctx.save();

        // -- 窯の本体 (ドーム型) --
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath();
        // 上部ドーム
        ctx.arc(kx, ky - 50, 250, Math.PI, 0);
        // 下部四角
        ctx.lineTo(kx + 250, ky + 250);
        ctx.lineTo(kx - 250, ky + 250);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 10;
        ctx.stroke();

        // -- 下部：火の部屋 --
        const fireY = ky + 150;
        ctx.fillStyle = '#212121';
        ctx.fillRect(kx - 200, fireY, 400, 80);

        // 炎の描画 (firePowerに応じて強くなる)
        if (this.firePower > 0 || this.fireFuel > 0) {
            const fireH = Math.min(60, this.firePower * 1.5) + Math.random() * 10;
            ctx.fillStyle = '#ff5722';
            ctx.beginPath();
            ctx.moveTo(kx - 100, fireY + 80);
            // 簡易的な炎のゆらぎ
            for (let i = 0; i < 5; i++) {
                const px = kx - 100 + i * 50;
                const ph = fireH * (0.8 + Math.random() * 0.4);
                ctx.lineTo(px, fireY + 80 - ph);
            }
            ctx.lineTo(kx + 100, fireY + 80);
            ctx.fill();

            // 薪の絵
            ctx.fillStyle = '#5d4037';
            ctx.fillRect(kx - 60, fireY + 60, 40, 15);
            ctx.fillRect(kx + 10, fireY + 65, 40, 15);
            ctx.save();
            ctx.translate(kx, fireY + 60);
            ctx.rotate(0.2);
            ctx.fillRect(-20, -10, 50, 15);
            ctx.restore();
        }

        // -- 上部：焼きの部屋 (中身) --
        const bakeY = ky - 80;
        const bakeW = 340;
        const bakeH = 180;
        const bakeX = kx - bakeW / 2;

        // 内部 (暗がり)
        ctx.fillStyle = '#3e2723';
        ctx.fillRect(bakeX, bakeY, bakeW, bakeH);

        // 中の星を描画 (星が入っている場合 且つ まだ焼き上がっていない)
        if (this.starState !== 'none' && this.bakeProgress < 100) {
            let starCol = CraftManager.currentStar.color;
            if (this.starState === 'raw') starCol = '#f5deb3'; // 小麦色
            if (this.bakeProgress > 50 && this.starState !== 'burnt') starCol = '#ffd700'; // 焼けてきた
            if (this.starState === 'burnt') starCol = '#333';

            ctx.fillStyle = starCol;

            // センターに配置
            const sx = kx;
            const sy = bakeY + bakeH / 2 + 20;

            // サイズ変化
            const size = 60 * this.starSize;

            // 描画
            ctx.save();
            ctx.translate(sx, sy);
            ctx.beginPath();
            CraftManager.drawStarShape(ctx, 0, 0, size, size * 0.5);
            ctx.fill();
            // 焦げ煙
            if (this.smokeLevel > 0) {
                ctx.fillStyle = `rgba(50, 50, 50, ${this.timeOverheat % 20 / 40 + 0.2})`;
                ctx.beginPath();
                ctx.arc(0, -40 - (this.timeOverheat % 50), 20 + (this.timeOverheat % 30), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // -- 扉 (窓) --
        // アニメーション用に座標変換
        ctx.save();

        // 扉の枠
        const doorW = bakeW + 20;
        const doorH = bakeH + 20;
        const doorX = bakeX - 10;
        const doorY = bakeY - 10;

        const openRate = this.doorAnimState; // 0=閉, 1=開

        // シンプルに: 
        // 閉: 全体を覆う
        // 開: 右側にシフトして縮小 (パース風)

        // 1. 完全に閉じた状態の座標
        let dX = doorX;
        let dW = doorW;
        let skewY = 0; // パースによる上下の縮み

        if (openRate > 0) {
            // 右に開くアニメ
            dX = doorX + (doorW * 0.8) * openRate; // 右へ移動
            dW = doorW * (1 - openRate * 0.8);     // 幅が縮む (パース)
            skewY = 40 * openRate;                 // 上下がすぼまる
        }

        if (openRate < 0.99) {
            ctx.fillStyle = '#8d6e63';
            ctx.strokeStyle = '#3e2723';
            ctx.lineWidth = 2;

            const pad = 25; // フレームの太さ

            // 扉の外枠頂点
            const p1 = { x: dX, y: doorY + skewY }; // 左上
            const p2 = { x: doorX + doorW, y: doorY }; // 右上
            const p3 = { x: doorX + doorW, y: doorY + doorH }; // 右下
            const p4 = { x: dX, y: doorY + doorH - skewY }; // 左下

            // 扉の内枠(窓部分)頂点 - 簡易計算
            const ip1 = { x: dX + pad * (1 - openRate), y: doorY + skewY + pad };
            const ip2 = { x: doorX + doorW - pad, y: doorY + pad };
            const ip3 = { x: doorX + doorW - pad, y: doorY + doorH - pad };
            const ip4 = { x: dX + pad * (1 - openRate), y: doorY + doorH - skewY - pad };

            // フレームを描画 (外側を描いてから内側を逆順に回して穴を開ける)
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();

            ctx.moveTo(ip1.x, ip1.y);
            ctx.lineTo(ip4.x, ip4.y);
            ctx.lineTo(ip3.x, ip3.y);
            ctx.lineTo(ip2.x, ip2.y);
            ctx.closePath();

            ctx.fill("evenodd");
            ctx.stroke();

            // 窓ガラス (非常に薄い青)
            ctx.fillStyle = 'rgba(230, 247, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(ip1.x, ip1.y);
            ctx.lineTo(ip2.x, ip2.y);
            ctx.lineTo(ip3.x, ip3.y);
            ctx.lineTo(ip4.x, ip4.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // ノブ
            ctx.fillStyle = '#ffb74d';
            ctx.beginPath();
            ctx.arc(dX + 20, doorY + doorH / 2, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore(); // 扉のrestore
        ctx.restore(); // drawKiln冒頭の共通saveに対するrestore
    },

    drawUI: function (offsetX) {
        const cm = CraftManager;
        const ctx = cm.ctx;

        // -- 薪ボタン (右) --
        const btnF = this.ui.btnFuel;
        const drawBtnF = { ...btnF, x: offsetX + btnF.x };

        // 独自描画: 木の切り株っぽいボタン
        ctx.save();
        ctx.fillStyle = '#795548';
        ctx.beginPath();
        ctx.arc(drawBtnF.x + drawBtnF.w / 2, drawBtnF.y + drawBtnF.h / 2, drawBtnF.w / 2, 0, Math.PI * 2);
        ctx.fill();
        // 年輪
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(drawBtnF.x + drawBtnF.w / 2, drawBtnF.y + drawBtnF.h / 2, drawBtnF.w / 2 - 10, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("まき", drawBtnF.x + drawBtnF.w / 2, drawBtnF.y + drawBtnF.h / 2);
        ctx.restore();


        // -- 入れるボタン (左) --
        if (this.ui.btnInsert.visible) {
            const btnI = this.ui.btnInsert;
            const drawBtnI = { ...btnI, x: offsetX + btnI.x };

            // 窓が開いてないときはグレーアウト => 廃止 (いつでも入れられる)
            // if (!this.isDoorOpen) {
            //     ctx.globalAlpha = 0.5;
            // }

            cm.drawBtn(drawBtnI, '#ffca28'); // 黄色いボタン
            ctx.globalAlpha = 1.0;

            // 星アイコン
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            cm.drawStarShape(ctx, drawBtnI.x + 30, drawBtnI.y + drawBtnI.h / 2, 15, 8);
            ctx.fill();
        }

        // -- 温度ゲージ (右端近く) --
        const gx = offsetX + 910;
        const gy = 150;
        const gw = 40;
        const gh = 300;

        // 背景
        ctx.fillStyle = '#444';
        ctx.fillRect(gx, gy, gw, gh);

        // 目盛り線
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        for (let i = 0; i <= 10; i++) {
            const ly = gy + gh * (i / 10);
            ctx.beginPath();
            ctx.moveTo(gx, ly);
            ctx.lineTo(gx + gw, ly);
            ctx.stroke();
        }

        // 適正ゾーン (緑)
        const range = this.TEMP_MAX_GAUGE; // 120度
        const safeY1 = gy + gh * (1 - this.TARGET_TEMP_MAX / range); // 上限Y
        const safeY2 = gy + gh * (1 - this.TARGET_TEMP_MIN / range); // 下限Y
        const safeH = safeY2 - safeY1;

        ctx.fillStyle = 'rgba(76, 175, 80, 0.6)';
        ctx.fillRect(gx, safeY1, gw, safeH);

        // 現在温度バー
        // ゲージからはみ出さないようにClamp
        const curH = Math.min(gh, Math.max(0, (this.ovenTemp / range) * gh));
        const barY = gy + gh - curH;

        // 色変化
        let barCol = '#2196f3'; // 青 (低温)
        if (this.ovenTemp >= this.TARGET_TEMP_MIN) barCol = '#4caf50'; // 緑 (適正)
        if (this.ovenTemp > this.TARGET_TEMP_MAX) barCol = '#f44336'; // 赤 (高温)

        ctx.fillStyle = barCol;
        ctx.fillRect(gx + 5, barY, gw - 10, curH);

        // アイコン
        ctx.fillStyle = '#fff';
        ctx.font = "bold 16px 'M PLUS Rounded 1c', sans-serif"; // 少し小さく調整
        ctx.fillText("おんど", gx + gw / 2, gy - 20);


        // -- 焼き上がりゲージ (中央上) --
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
        ctx.beginPath();
        ctx.roundRect(pgX, pgY, pgW, pgH, 15);
        ctx.fill();

        // バー描画
        const pVal = Math.min(100, Math.max(0, this.bakeProgress));
        if (pVal > 0) {
            ctx.fillStyle = '#ffc107'; // アンバー
            ctx.beginPath();
            ctx.roundRect(pgX, pgY, pgW * (pVal / 100), pgH, 15);
            ctx.fill();
        }

        // 枠
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(pgX, pgY, pgW, pgH, 15);
        ctx.stroke();

    },

    // 焼き上がり後の星を大きく表示
    drawFinishedStar: function (offsetX) {
        const cm = CraftManager;
        const ctx = cm.ctx;
        const cx = offsetX + 500;
        const cy = 250; // 窯の窓付近から前面に出す印象

        ctx.save();
        ctx.translate(cx, cy);

        // ふわふわとした浮遊アニメーション
        const floatY = Math.sin(Date.now() / 300) * 10;
        ctx.translate(0, floatY);

        // 拡大 (元の1.5倍〜2倍程度)
        const scale = 2.0 * this.starSize;
        ctx.scale(scale, scale);

        // 星の描画
        ctx.fillStyle = cm.currentStar.color;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
        ctx.shadowBlur = 30;

        ctx.beginPath();
        cm.drawStarShape(ctx, 0, 0, 60, 30);
        ctx.fill();

        // 縁取り
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
};