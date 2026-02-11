/**
 * --- Craft 2: かた抜き (リニューアル版・画像対応) ---
 */

// 画像リソース管理
const CraftMoldingImages = {
    loaded: false,
    path: 'image/craft_image2/',

    bgBase: new Image(),
    lanes: [],     // 3枚

    noteNormal: new Image(),
    noteDone: new Image(),
    noteLongBody: new Image(),
    noteLongEnd: new Image(),

    machineUp: new Image(),
    machineDown: new Image(),

    btnRedUp: new Image(),
    btnRedDown: new Image(),
    btnBlueUp: new Image(),
    btnBlueDown: new Image(),

    judgePerfect: new Image(),
    judgeGood: new Image(),
    judgeMiss: new Image(),

    effects: [],   // 3枚
    tutorialHand: new Image(),

    loadAssets: async function () {
        if (this.loaded) return;

        const promises = [];
        const path = this.path;

        promises.push(CraftManager.loadImage('image/tutorial/hand.png').then(img => this.tutorialHand = img));
        promises.push(CraftManager.loadImage(path + 'bg_base.png').then(img => this.bgBase = img));

        // レーンアニメ (1-3)
        this.lanes = new Array(3);
        for (let i = 0; i < 3; i++) {
            promises.push(CraftManager.loadImage(path + `lane_${i + 1}.png`).then(img => this.lanes[i] = img));
        }

        // ノーツ
        promises.push(CraftManager.loadImage(path + 'note_normal.png').then(img => this.noteNormal = img));
        promises.push(CraftManager.loadImage(path + 'note_done.png').then(img => this.noteDone = img));
        promises.push(CraftManager.loadImage(path + 'note_long_body.png').then(img => this.noteLongBody = img));
        promises.push(CraftManager.loadImage(path + 'note_long_end.png').then(img => this.noteLongEnd = img));

        // マシン
        promises.push(CraftManager.loadImage(path + 'machine_up.png').then(img => this.machineUp = img));
        promises.push(CraftManager.loadImage(path + 'machine_down.png').then(img => this.machineDown = img));

        // ボタン
        promises.push(CraftManager.loadImage(path + 'btn_red_up.png').then(img => this.btnRedUp = img));
        promises.push(CraftManager.loadImage(path + 'btn_red_down.png').then(img => this.btnRedDown = img));
        promises.push(CraftManager.loadImage(path + 'btn_blue_up.png').then(img => this.btnBlueUp = img));
        promises.push(CraftManager.loadImage(path + 'btn_blue_down.png').then(img => this.btnBlueDown = img));

        // 判定文字
        promises.push(CraftManager.loadImage(path + 'judge_perfect.png').then(img => this.judgePerfect = img));
        promises.push(CraftManager.loadImage(path + 'judge_good.png').then(img => this.judgeGood = img));
        promises.push(CraftManager.loadImage(path + 'judge_miss.png').then(img => this.judgeMiss = img));

        // エフェクト (1-3)
        this.effects = new Array(3);
        for (let i = 0; i < 3; i++) {
            promises.push(CraftManager.loadImage(path + `effect_hit_${i + 1}.png`).then(img => this.effects[i] = img));
        }

        await Promise.all(promises);
        this.loaded = true;
    },

    // 互換性
    load: function () { this.loadAssets(); }
};

const CraftMolding = {
    // 設定
    laneSettings: {
        red: { y: 150, key: 'ArrowLeft' },
        blue: { y: 245, key: 'ArrowRight' }
    },
    judgeX: 730,
    spawnX: -150,
    noteSpeed: 6,

    // BGM設定
    bgmName: 'craft2',
    bgmSrc: 'sounds/craft2_BGM1.mp3',
    bgmDuration: 0,

    // 状態変数
    notes: [],
    effects: [], // ヒットエフェクト用 {x, y, frame, timer}
    score: 0,
    totalNotes: 0,
    stats: { perfect: 0, good: 0 },

    machineAnim: { red: 0, blue: 0 },
    feedback: { type: null, timer: 0 }, // type: 'perfect', 'good', 'miss'

    prevKeys: { ArrowLeft: false, ArrowRight: false },

    // アニメーション用
    laneAnimFrame: 0,
    laneAnimTimer: 0,

    // 進行管理
    isFinished: false,

    // チュートリアル用
    showTutorial: false,
    tutorialTimer: 0,
    tutorialNotes: [],

    setChart: function (data) {
        this.externalChart = data;
    },

    reset: function () {
        this.notes = [];
        this.stats = { perfect: 0, good: 0 };
        this.feedback = { type: null, timer: 0 };
        this.isStarted = false;
        this.isFinished = false;
        this.nextNoteIndex = 0;
    },

    end: function () {
        AudioSys.stopBGM();
        this.isStarted = false;
        this.isFinished = true;

        // スコア計算 (Max 30)
        // パーフェクト=1, グッド=0.5 として、全ノーツ数に対する割合で計算
        let rawScore = 0;
        if (this.totalNotes > 0) {
            const p = this.stats.perfect;
            const g = this.stats.good;
            // 満点スコア比率
            const ratio = (p * 1.0 + g * 0.5) / this.totalNotes;
            rawScore = Math.floor(ratio * 30);
        }
        CraftManager.currentStar.scoreMold = Math.min(30, rawScore);
        console.log("Mold Score:", CraftManager.currentStar.scoreMold);
    },

    loadAssets: async function () {
        await CraftMoldingImages.loadAssets();
        // BGMロード
        await CraftManager.loadSound(this.bgmName, this.bgmSrc);
    },

    init: function () {
        // CraftMoldingImages.load(); // 事前ロード済み

        this.notes = [];
        this.effects = [];
        this.score = 0;
        this.stats = { perfect: 0, good: 0 };
        this.totalNotes = 0;

        this.machineAnim.red = 0;
        this.machineAnim.blue = 0;
        this.feedback.type = null;
        this.feedback.timer = 0;

        this.laneAnimFrame = 0;
        this.laneAnimTimer = 0;

        this.prevKeys = { ArrowLeft: false, ArrowRight: false };

        this.isStarted = false;
        this.isFinished = false;
        this.startAnimTimer = 0;
        this.chartData = [];
        this.nextNoteIndex = 0;

        // BGM準備と譜面生成
        const onBgmReady = (buffer) => {
            if (buffer) {
                this.bgmDuration = buffer.duration;
                if (this.externalChart && this.externalChart.length > 0) {
                    this.parseExternalChart(this.externalChart);
                } else {
                    this.generateChart(buffer.duration);
                }
            }
        };

        if (AudioSys.buffers[this.bgmName]) {
            onBgmReady(AudioSys.buffers[this.bgmName]);
        } else {
            AudioSys.loadBGM(this.bgmName, this.bgmSrc).then(onBgmReady);
        }

        this.showTutorial = !hasSeenMoldTutorial;
        this.tutorialTimer = 0;
        this.tutorialNotes = [
            { lane: 'red', time: 100, processed: false, handAnim: 0, currentX: -100 },
            { lane: 'blue', time: 220, processed: false, handAnim: 0, currentX: -100 }
        ];
    },

    parseExternalChart: function (data) {
        this.chartData = [];
        const speedPxPerSec = this.noteSpeed * 60;
        const travelDistance = this.judgeX - this.spawnX;
        const travelTime = travelDistance / speedPxPerSec;

        data.forEach(note => {
            const spawnTime = note.time - travelTime;
            let lengthPx = 0;
            if (note.type === 'long') {
                lengthPx = note.duration ? note.duration * speedPxPerSec : 250;
            }

            this.chartData.push({
                spawnTime: spawnTime,
                lane: note.lane,
                type: note.type,
                length: lengthPx
            });
        });
        this.chartData.sort((a, b) => a.spawnTime - b.spawnTime);
        this.totalNotes = this.chartData.length;
    },

    generateChart: function (duration) {
        this.chartData = [];
        const bpm = 110;
        const beatInterval = 60 / bpm;
        const travelTime = (this.judgeX - this.spawnX) / (this.noteSpeed * 60);

        let currentTime = 2.0;
        let laneToggle = true;

        while (currentTime < duration - 3.0) {
            const spawnTime = currentTime - travelTime;
            const isLong = Math.random() < 0.15;
            const lane = Math.random() < 0.6 ? (laneToggle ? 'red' : 'blue') : (Math.random() < 0.5 ? 'red' : 'blue');
            const noteDuration = isLong ? (beatInterval * (1 + Math.random())) : 0;
            const lengthPx = isLong ? noteDuration * this.noteSpeed * 60 : 0;

            if (spawnTime > 0) {
                this.chartData.push({
                    spawnTime: spawnTime,
                    lane: lane,
                    type: isLong ? 'long' : 'normal',
                    length: lengthPx
                });
            }
            const r = Math.random();
            if (r < 0.6) currentTime += beatInterval;
            else if (r < 0.9) currentTime += beatInterval * 2;
            else currentTime += beatInterval / 2;

            laneToggle = !laneToggle;
        }
        this.chartData.sort((a, b) => a.spawnTime - b.spawnTime);
        this.totalNotes = this.chartData.length;
    },

    update: function () {
        if (this.isFinished) return;

        if (this.showTutorial) {
            this.updateTutorial();
            return;
        }

        if (!this.isStarted) {
            this.startAnimTimer++;
            if (this.startAnimTimer > 90) {
                this.isStarted = true;
                this.startTime = Date.now();
                AudioSys.stopBGM();
                AudioSys.playBGM(this.bgmName);
            }
            return;
        }

        this.laneAnimTimer++;
        if (this.laneAnimTimer >= 5) {
            this.laneAnimTimer = 0;
            this.laneAnimFrame = (this.laneAnimFrame + 1) % 3;

            for (let i = this.effects.length - 1; i >= 0; i--) {
                const eff = this.effects[i];
                eff.frame++;
                if (eff.frame >= 3) {
                    this.effects.splice(i, 1);
                }
            }
        }

        const elapsedTime = (Date.now() - this.startTime) / 1000;

        while (this.nextNoteIndex < this.chartData.length) {
            const nextNote = this.chartData[this.nextNoteIndex];
            if (nextNote.spawnTime <= elapsedTime) {
                this.spawnNote(nextNote);
                this.nextNoteIndex++;
            } else {
                break;
            }
        }

        if (elapsedTime > this.bgmDuration && this.bgmDuration > 0) {
            this.finishGame();
        }

        for (let i = this.notes.length - 1; i >= 0; i--) {
            const n = this.notes[i];
            n.x += this.noteSpeed;

            const tailX = n.x + (n.type === 'long' ? n.length : 0);
            if (tailX > 1100) {
                if (n.active && n.type === 'normal') {
                    this.showFeedback('miss');
                }
                this.notes.splice(i, 1);
            }
        }

        this.handleInput();

        if (this.machineAnim.red > 0) this.machineAnim.red--;
        if (this.machineAnim.blue > 0) this.machineAnim.blue--;
        if (this.feedback.timer > 0) this.feedback.timer--;
    },

    updateTutorial: function () {
        this.tutorialTimer++;
        const speed = this.noteSpeed;
        const startX = -100;

        // タップで終了
        if (Input.isJustPressed) {
            this.showTutorial = false;
            hasSeenMoldTutorial = true;
            if (typeof DataManager !== 'undefined') DataManager.save();
            this.startAnimTimer = 0;
            AudioSys.playTone(800, 'square', 0.1);
            return;
        }

        for (const tn of this.tutorialNotes) {
            const x = startX + (this.tutorialTimer - tn.time) * speed;
            tn.currentX = x;

            // 叩くタイミングを少し早める (judgeX - 10)
            if (x >= this.judgeX - 10 && !tn.processed) {
                tn.handAnim = 10;
                tn.processed = true;
                this.machineAnim[tn.lane] = 10;
                AudioSys.playTone(tn.lane === 'red' ? 440 : 660, 'sine', 0.1);
                this.effects.push({ x: this.judgeX, y: this.laneSettings[tn.lane].y + 40, frame: 0 });
            }
            if (tn.handAnim > 0) tn.handAnim--;
        }

        // ループ処理 (一定時間でリセット)
        if (this.tutorialTimer > 450) {
            this.tutorialTimer = 0;
            for (const tn of this.tutorialNotes) {
                tn.processed = false;
                tn.handAnim = 0;
                tn.currentX = -100;
            }
            this.machineAnim.red = 0;
            this.machineAnim.blue = 0;
        }

        // レーンアニメ等は動かす
        this.laneAnimTimer++;
        if (this.laneAnimTimer >= 5) {
            this.laneAnimTimer = 0;
            this.laneAnimFrame = (this.laneAnimFrame + 1) % 3;
            for (let i = this.effects.length - 1; i >= 0; i--) {
                const eff = this.effects[i];
                eff.frame++;
                if (eff.frame >= 3) this.effects.splice(i, 1);
            }
        }
    },

    spawnNote: function (chartInfo) {
        const length = chartInfo.length || (chartInfo.type === 'long' ? 250 : 0);

        const note = {
            lane: chartInfo.lane,
            type: chartInfo.type,
            x: this.spawnX,
            y: this.laneSettings[chartInfo.lane].y,
            length: length,
            active: true,
            processed: false
        };
        this.notes.push(note);
    },

    finishGame: function () {
        this.isFinished = true;
        AudioSys.stopBGM();
        AudioSys.playTone(1000, 'sine', 0.5);
        CraftManager.ui.btnNext.visible = true;
    },

    handleInput: function () {
        let touchRed = false;
        let touchBlue = false;

        // 1. マルチタッチ判定
        if (Input.touches && Input.touches.length > 0) {
            for (const t of Input.touches) {
                if (t.isJustPressed) {
                    const mx = t.x;
                    const my = t.y;
                    if (my > 360 && my < 600) {
                        if (mx >= 0 && mx <= 490) touchRed = true;
                        else if (mx >= 510 && mx <= 1000) touchBlue = true;
                    }
                }
            }
        }

        // 2. マウス/シングルタッチ判定
        if (Input.isJustPressed) {
            const mx = Input.x;
            const my = Input.y;
            if (my > 360 && my < 600) {
                if (mx >= 0 && mx <= 490) touchRed = true;
                else if (mx >= 510 && mx <= 1000) touchBlue = true;
            }
        }

        const keyRed = keys.ArrowLeft;
        const keyBlue = keys.ArrowRight;

        const triggerRed = (keyRed && !this.prevKeys.ArrowLeft) || touchRed;
        const triggerBlue = (keyBlue && !this.prevKeys.ArrowRight) || touchBlue;

        this.prevKeys.ArrowLeft = keyRed;
        this.prevKeys.ArrowRight = keyBlue;

        if (triggerRed) this.checkHit('red');
        if (triggerBlue) this.checkHit('blue');
    },

    checkHit: function (lane) {
        this.machineAnim[lane] = 8;

        let hit = false;
        const sortedNotes = this.notes.filter(n => n.lane === lane && n.active).sort((a, b) => b.x - a.x);

        for (const note of sortedNotes) {
            if (note.type === 'normal') {
                const center = note.x + 30;
                const dist = Math.abs(center - this.judgeX);

                if (dist < 60) {
                    this.processHit(note, dist);
                    note.active = false;
                    note.processed = true;
                    hit = true;
                    this.effects.push({ x: this.judgeX, y: note.y + 40, frame: 0 });
                    break;
                }
            }
            else if (note.type === 'long') {
                if (this.judgeX >= note.x && this.judgeX <= note.x + note.length) {
                    this.processHit(note, 0);
                    hit = true;
                    note.active = false;
                    this.effects.push({ x: this.judgeX, y: note.y + 40, frame: 0 });
                    break;
                }
            }
        }
    },

    processHit: function (note, dist) {
        let type = 'good';
        let scoreAdd = 1;

        if (dist < 20) {
            type = 'perfect';
            scoreAdd = 1;
            AudioSys.playTone(880, 'sine', 0.1);
            this.stats.perfect++;
        } else {
            type = 'good';
            AudioSys.playTone(660, 'sine', 0.1);
            this.stats.good++;
        }

        if (note.type === 'long') {
            type = Math.random() < 0.4 ? 'perfect' : 'good';
            AudioSys.playNoise(0.05, 0.1);
            if (type === 'perfect') this.stats.perfect++;
            else this.stats.good++;
        }

        this.score += scoreAdd;
        this.showFeedback(type);
    },

    showFeedback: function (type) {
        this.feedback.type = type;
        this.feedback.timer = 20;
    },

    draw: function (offsetX) {
        const ctx = CraftManager.ctx;
        const imgs = CraftMoldingImages;

        if (!imgs.loaded) {
            ctx.fillStyle = '#fff';
            ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillText("Loading Assets...", offsetX + 500, 300);
            return;
        }

        if (imgs.bgBase.complete) {
            ctx.drawImage(imgs.bgBase, offsetX, 0, 1000, 600);
        }

        const laneImg = imgs.lanes[this.laneAnimFrame];
        if (laneImg && laneImg.complete) {
            if (this.showTutorial) ctx.globalAlpha = 0.3; // チュートリアル中はレーンを薄く
            ctx.drawImage(laneImg, offsetX, 0, 1000, 600);
            ctx.globalAlpha = 1.0;
        }

        const btnY = 380;
        const redImg = (keys.ArrowLeft || this.machineAnim.red > 0) ? imgs.btnRedDown : imgs.btnRedUp;
        if (redImg.complete) ctx.drawImage(redImg, offsetX + 50, btnY, 430, 80);

        const blueImg = (keys.ArrowRight || this.machineAnim.blue > 0) ? imgs.btnBlueDown : imgs.btnBlueUp;
        if (blueImg.complete) ctx.drawImage(blueImg, offsetX + 520, btnY, 430, 80);

        for (const n of this.notes) {
            const nx = offsetX + n.x;
            const ny = n.y + 10;

            if (n.type === 'normal') {
                if (n.processed) {
                    if (imgs.noteDone.complete) ctx.drawImage(imgs.noteDone, nx, ny, 60, 60);
                } else {
                    if (imgs.noteNormal.complete) ctx.drawImage(imgs.noteNormal, nx, ny, 60, 60);
                }
            } else if (n.type === 'long') {
                const bodyW = n.length;
                const endW = 20;

                if (imgs.noteLongEnd.complete) {
                    ctx.save();
                    ctx.translate(nx + endW, ny);
                    ctx.scale(-1, 1);
                    ctx.drawImage(imgs.noteLongEnd, 0, 0, endW, 60);
                    ctx.restore();
                }

                if (imgs.noteLongBody.complete) {
                    ctx.drawImage(imgs.noteLongBody, nx + endW, ny, bodyW - endW * 2, 60);
                }

                if (imgs.noteLongEnd.complete) {
                    ctx.drawImage(imgs.noteLongEnd, nx + bodyW - endW, ny, endW, 60);
                }
            }
        }

        let mW = 120; // 80 * 1.5
        let mH = 150; // 100 * 1.5
        if (imgs.machineUp.complete && imgs.machineUp.naturalWidth > 0) {
            const ratio = imgs.machineUp.naturalHeight / imgs.machineUp.naturalWidth;
            mH = mW * ratio;
        }

        const jx = offsetX + this.judgeX - (mW / 2);
        const mOffsetY = -45;

        const redMach = (this.machineAnim.red > 0) ? imgs.machineDown : imgs.machineUp;
        if (redMach.complete) ctx.drawImage(redMach, jx, this.laneSettings.red.y + mOffsetY, mW, mH);

        const blueMach = (this.machineAnim.blue > 0) ? imgs.machineDown : imgs.machineUp;
        if (blueMach.complete) ctx.drawImage(blueMach, jx, this.laneSettings.blue.y + mOffsetY, mW, mH);

        // チュートリアル用のノーツ描画（ここでは描画せず暗転ブロック内で描画）

        for (const eff of this.effects) {
            const effImg = imgs.effects[eff.frame];
            if (effImg && effImg.complete) {
                ctx.drawImage(effImg, offsetX + eff.x - 60, eff.y - 60, 120, 120);
            }
        }

        CraftManager.drawTitle(offsetX, "かたぬき");
        CraftManager.drawSpeechBubble(offsetX, "タイミングよくボタンをおそう！");

        ctx.fillStyle = '#fff';
        ctx.font = "900 24px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'right';
        ctx.fillText(`パーフェクト: ${this.stats.perfect}`, offsetX + 950, 80);
        ctx.fillText(`グッド: ${this.stats.good}`, offsetX + 950, 110);

        if (this.feedback.timer > 0 && this.feedback.type) {
            let fbImg = null;
            if (this.feedback.type === 'perfect') fbImg = imgs.judgePerfect;
            else if (this.feedback.type === 'good') fbImg = imgs.judgeGood;
            else if (this.feedback.type === 'miss') fbImg = imgs.judgeMiss;

            if (fbImg && fbImg.complete) {
                const fbX = offsetX + this.judgeX - fbImg.width / 2;
                const fbY = 100;
                ctx.drawImage(fbImg, fbX, fbY);
            }
        }

        // チュートリアル中の暗転
        if (this.showTutorial) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(offsetX, 0, 1000, 600);

            // 特定のパーツだけを再度カラーで描画
            ctx.globalAlpha = 1.0;
            if (imgs.btnRedUp.complete) ctx.drawImage(imgs.btnRedUp, offsetX + 50, btnY, 430, 80);
            if (imgs.btnBlueUp.complete) ctx.drawImage(imgs.btnBlueUp, offsetX + 520, btnY, 430, 80);

            const redMachT = (this.machineAnim.red > 0) ? imgs.machineDown : imgs.machineUp;
            if (redMachT.complete) ctx.drawImage(redMachT, jx, this.laneSettings.red.y + mOffsetY, mW, mH);
            const blueMachT = (this.machineAnim.blue > 0) ? imgs.machineDown : imgs.machineUp;
            if (blueMachT.complete) ctx.drawImage(blueMachT, jx, this.laneSettings.blue.y + mOffsetY, mW, mH);

            for (const tn of this.tutorialNotes) {
                // ノーツの描画 (暗転の後ろに描画するように変更)
                if (tn.currentX > -100 && tn.currentX < 1100 && !tn.processed) {
                    if (imgs.noteNormal.complete) {
                        ctx.drawImage(imgs.noteNormal, offsetX + tn.currentX, this.laneSettings[tn.lane].y + 10, 60, 60);
                    }
                }

                // 手の描画判定 (2秒前から表示)
                const startX = -100;
                const speed = this.noteSpeed;
                const hitTimer = tn.time + (this.judgeX - startX) / speed;

                if (this.tutorialTimer > hitTimer - 120 && this.tutorialTimer < hitTimer + 20) {
                    if (imgs.tutorialHand.complete) {
                        const hwT = 180, hhT = 180;
                        const bxT = (tn.lane === 'red' ? 260 : 730);
                        // 位置調整 (380 + 50)
                        let byT = 380 + 50;
                        if (this.tutorialTimer >= hitTimer) byT += 20;

                        ctx.drawImage(imgs.tutorialHand, offsetX + bxT - hwT / 2, byT - hhT / 2, hwT, hhT);
                    }
                }
            }

            // 操作説明テキストの追加
            ctx.save();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = "center";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 10;
            ctx.fillText("キーボードの「←」「→」キーでもボタンをおせるよ", offsetX + 500, 350);
            ctx.restore();
        }

        if (!this.isStarted && !this.showTutorial) {
            ctx.save();
            ctx.fillStyle = '#ff4500';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 8;
            ctx.font = "900 80px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const scale = 1 + Math.sin(this.startAnimTimer * 0.2) * 0.1;
            ctx.translate(offsetX + 500, 300);
            ctx.scale(scale, scale);
            ctx.strokeText("スタート！", 0, 0);
            ctx.fillText("スタート！", 0, 0);
            ctx.restore();
        }
    }
};