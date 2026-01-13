/**
 * --- Craft 2: かた抜き (リニューアル版) ---
 */
const CraftMolding = {
    // 設定
    laneSettings: {
        red: { y: 150, color: '#ffcdd2', borderColor: '#ef5350', key: 'ArrowLeft' },
        blue: { y: 250, color: '#bbdefb', borderColor: '#42a5f5', key: 'ArrowRight' }
    },
    judgeX: 800, 
    spawnX: -150,
    noteSpeed: 6, // 1フレームあたりの移動距離
    
    // BGM設定
    bgmName: 'craft2',
    bgmSrc: 'sounds/craft2_BGM1.mp3',
    bgmDuration: 0, // 曲の長さ(秒)
    
    // 状態変数
    notes: [],
    // スコア管理
    score: 0, 
    totalNotes: 0, // 譜面の総ノーツ数
    stats: { perfect: 0, good: 0 }, 
    
    machineAnim: { red: 0, blue: 0 },
    feedback: { text: "", color: "#fff", timer: 0 },
    
    prevKeys: { ArrowLeft: false, ArrowRight: false },
    
    // 進行管理
    isStarted: false,
    startAnimTimer: 0,
    startTime: 0,      // ゲーム開始時刻
    chartData: [],     // 譜面データ
    nextNoteIndex: 0,  // 次に生成するノーツのインデックス
    isFinished: false,

    init: function () {
        this.notes = [];
        this.score = 0;
        this.stats = { perfect: 0, good: 0 };
        this.totalNotes = 0;
        
        this.machineAnim.red = 0;
        this.machineAnim.blue = 0;
        this.feedback.timer = 0;
        
        this.prevKeys = { ArrowLeft: false, ArrowRight: false };
        
        this.isStarted = false;
        this.isFinished = false;
        this.startAnimTimer = 0;
        this.chartData = [];
        this.nextNoteIndex = 0;
        
        // BGMロードと譜面生成
        AudioSys.loadBGM(this.bgmName, this.bgmSrc).then(buffer => {
            if (buffer) {
                this.bgmDuration = buffer.duration;
                this.generateChart(buffer.duration);
            }
        });
    },

    // 簡易譜面生成（BGM解析はできないため、BPMに合わせて規則的に配置）
    generateChart: function(duration) {
        this.chartData = [];
        const bpm = 110; // 曲のテンポに合わせる(仮)
        const beatInterval = 60 / bpm;
        
        // ノーツがspawnしてからjudgeラインに到達するまでの時間(秒)
        // 距離: 800 - (-150) = 950px
        // 速度: 6px/frame * 60fps = 360px/sec
        // 時間: 950 / 360 ≈ 2.638秒
        const travelTime = (this.judgeX - this.spawnX) / (this.noteSpeed * 60);

        // 曲の開始2秒後から終了3秒前までノーツを配置
        let currentTime = 2.0;
        let laneToggle = true;

        while (currentTime < duration - 3.0) {
            // 生成タイミング（曲のタイミング - 到達時間）
            const spawnTime = currentTime - travelTime;

            const isLong = Math.random() < 0.15;
            const lane = Math.random() < 0.6 ? (laneToggle ? 'red' : 'blue') : (Math.random() < 0.5 ? 'red' : 'blue');
            
            if (spawnTime > 0) {
                this.chartData.push({
                    spawnTime: spawnTime,
                    lane: lane,
                    type: isLong ? 'long' : 'normal'
                });
            }

            // 次のノーツまでの間隔（リズム）
            const r = Math.random();
            if (r < 0.6) currentTime += beatInterval;      // 4分音符
            else if (r < 0.9) currentTime += beatInterval * 2; // 2分音符
            else currentTime += beatInterval / 2;          // 8分音符
            
            laneToggle = !laneToggle;
        }
        
        // 譜面データを時間の昇順にソート
        this.chartData.sort((a, b) => a.spawnTime - b.spawnTime);
        this.totalNotes = this.chartData.length;
    },

    update: function () {
        // 終了済みなら何もしない（Nextボタン待ち）
        if (this.isFinished) return;

        // スタート演出待機
        if (!this.isStarted) {
            this.startAnimTimer++;
            if (this.startAnimTimer > 90) { // 1.5秒待機後にスタート
                this.isStarted = true;
                this.startTime = Date.now();
                AudioSys.stopBGM(); // 前の曲を止めて
                AudioSys.playBGM(this.bgmName); // 再生開始
            }
            return;
        }

        // 現在の経過時間（秒）
        const elapsedTime = (Date.now() - this.startTime) / 1000;

        // ノーツ生成（譜面データに基づく）
        while (this.nextNoteIndex < this.chartData.length) {
            const nextNote = this.chartData[this.nextNoteIndex];
            if (nextNote.spawnTime <= elapsedTime) {
                this.spawnNote(nextNote);
                this.nextNoteIndex++;
            } else {
                break;
            }
        }

        // 終了判定（曲が終わったら）
        if (elapsedTime > this.bgmDuration && this.bgmDuration > 0) {
            this.finishGame();
        }

        // ノーツ移動と削除
        for (let i = this.notes.length - 1; i >= 0; i--) {
            const n = this.notes[i];
            n.x += this.noteSpeed; 

            if (n.x > 1100) {
                this.notes.splice(i, 1);
                if (n.active && n.type === 'normal') {
                    this.showFeedback("ミス", "#888");
                }
            }
        }

        this.handleInput();

        if (this.machineAnim.red > 0) this.machineAnim.red--;
        if (this.machineAnim.blue > 0) this.machineAnim.blue--;
        if (this.feedback.timer > 0) this.feedback.timer--;
    },

    spawnNote: function(chartInfo) {
        const note = {
            lane: chartInfo.lane,
            type: chartInfo.type,
            x: this.spawnX,
            y: this.laneSettings[chartInfo.lane].y,
            length: chartInfo.type === 'long' ? 250 : 0, 
            width: chartInfo.type === 'long' ? 250 : 60,
            active: true
        };
        this.notes.push(note);
    },

    finishGame: function() {
        this.isFinished = true;
        AudioSys.stopBGM();
        // 効果音
        AudioSys.playTone(1000, 'sine', 0.5);
        // 次へボタン表示
        CraftManager.ui.btnNext.visible = true;
    },

    handleInput: function() {
        const cm = CraftManager;
        
        let touchRed = false;
        let touchBlue = false;

        if (Input.isJustPressed) {
            const mx = Input.x; 
            const my = Input.y;
            
            // ボタンエリア判定
            if (my > 320 && my < 500) {
                // 左側 (赤レーン)
                if (mx >= 50 && mx <= 480) {
                    touchRed = true;
                }
                // 右側 (青レーン)
                else if (mx >= 520 && mx <= 950) {
                    touchBlue = true;
                }
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

    checkHit: function(lane) {
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
                    hit = true;
                    break;
                }
            } 
            else if (note.type === 'long') {
                if (this.judgeX >= note.x && this.judgeX <= note.x + note.length) {
                    this.processHit(note, 0);
                    hit = true;
                    CraftManager.addParticle(this.judgeX, note.y, '#fff', 5);
                    break;
                }
            }
        }
    },

    processHit: function(note, dist) {
        let quality = "グッド";
        let scoreAdd = 1;
        
        if (dist < 20) {
            quality = "パーフェクト";
            scoreAdd = 1;
            CraftManager.addParticle(this.judgeX, note.y, '#ffea00', 8);
            AudioSys.playTone(880, 'sine', 0.1);
            this.stats.perfect++;
        } else if (dist < 60) {
            quality = "グッド";
            CraftManager.addParticle(this.judgeX, note.y, '#ffffff', 5);
            AudioSys.playTone(660, 'sine', 0.1);
            this.stats.good++;
        } else {
            quality = "ミス";
            scoreAdd = 0;
        }

        if (note.type === 'long') {
            quality = Math.random() < 0.4 ? "パーフェクト" : "グッド";
            AudioSys.playNoise(0.05, 0.1); 
            if(quality === "パーフェクト") this.stats.perfect++;
            else this.stats.good++;
        }

        this.score += scoreAdd;
        
        const color = quality === "パーフェクト" ? "#ffea00" : (quality === "グッド" ? "#ffffff" : "#888888");
        this.showFeedback(quality, color);
    },
    
    showFeedback: function(text, color) {
        this.feedback.text = text;
        this.feedback.color = color;
        this.feedback.timer = 20;
    },

    draw: function (offsetX) {
        const ctx = CraftManager.ctx;

        // --- 背景エリア描画 ---
        const laneH = 80;
        this.drawLaneBackground(ctx, offsetX, this.laneSettings.red.y, laneH, this.laneSettings.red.color, this.laneSettings.red.borderColor);
        this.drawLaneBackground(ctx, offsetX, this.laneSettings.blue.y, laneH, this.laneSettings.blue.color, this.laneSettings.blue.borderColor);

        // --- 操作ボタンエリア ---
        const btnY = 360;
        const btnH = 80;

        // 赤ボタン
        this.draw3DButton(ctx, offsetX + 50, btnY, 430, btnH, 
            '#e53935', 
            '#b71c1c', 
            this.machineAnim.red > 0, 
            "赤レーン"
        );
        
        // 青ボタン
        this.draw3DButton(ctx, offsetX + 520, btnY, 430, btnH, 
            '#1e88e5', 
            '#0d47a1', 
            this.machineAnim.blue > 0, 
            "青レーン"
        );


        // --- ゲーム要素描画 ---
        const jx = offsetX + this.judgeX;
        
        // ノーツ描画
        const noteColor = '#fdd835'; 
        const noteBorder = '#fff';

        for (const n of this.notes) {
            const nx = offsetX + n.x;
            const ny = n.y;
            
            ctx.fillStyle = noteColor;
            
            if (n.type === 'normal') {
                ctx.beginPath();
                ctx.arc(nx + 30, ny + laneH/2, 30, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = noteBorder;
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (n.type === 'long') {
                ctx.beginPath();
                ctx.roundRect(nx, ny + laneH/2 - 30, n.length, 60, 10);
                ctx.fill();
                ctx.strokeStyle = noteBorder;
                ctx.lineWidth = 3;
                ctx.stroke();
                
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                for(let k=10; k<n.length; k+=40) {
                     ctx.fillRect(nx + k, ny + laneH/2 - 30, 5, 60);
                }
            }
        }
        
        // 型抜き機
        this.drawMachineArm(ctx, jx, this.laneSettings.red.y + laneH/2, '#ef5350', this.machineAnim.red);
        this.drawMachineArm(ctx, jx, this.laneSettings.blue.y + laneH/2, '#42a5f5', this.machineAnim.blue);

        // UI表示
        CraftManager.drawTitle(offsetX, "かたぬき");
        CraftManager.drawSpeechBubble(offsetX, "タイミングよく かたぬき！");
        
        // スコア表示
        this.drawScoreWindow(ctx, offsetX + 220, 100);

        // 判定フィードバック
        if (this.feedback.timer > 0) {
            ctx.save();
            ctx.fillStyle = this.feedback.color;
            ctx.font = "900 60px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.strokeText(this.feedback.text, jx, 120);
            ctx.fillText(this.feedback.text, jx, 120);
            ctx.restore();
        }

        // スタート演出
        if (!this.isStarted) {
            ctx.save();
            ctx.fillStyle = '#ff4500';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 8;
            ctx.font = "bold 80px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const scale = 1 + Math.sin(this.startAnimTimer * 0.2) * 0.1;
            ctx.translate(offsetX + 500, 300);
            ctx.scale(scale, scale);
            ctx.strokeText("スタート！", 0, 0);
            ctx.fillText("スタート！", 0, 0);
            ctx.restore();
        }
    },
    
    drawLaneBackground: function(ctx, offsetX, y, h, bgColor, borderColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(offsetX, y, 1000, h);
        
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + 1000, y);
        ctx.moveTo(offsetX, y + h);
        ctx.lineTo(offsetX + 1000, y + h);
        ctx.stroke();
    },

    drawMachineArm: function(ctx, x, y, color, animTimer) {
        const offsetY = animTimer > 0 ? 15 : -35; 
        
        ctx.fillStyle = '#37474f';
        ctx.fillRect(x - 8, y + offsetY - 50, 16, 50);
        
        ctx.fillStyle = color;
        ctx.beginPath();
        CraftManager.drawStarShape(ctx, x, y + offsetY, 35, 18);
        ctx.fill();
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
    },

    draw3DButton: function(ctx, x, y, w, h, mainColor, shadowColor, isPressed, text) {
        const offset = isPressed ? 4 : 0;
        const shadowHeight = 8;
        
        if (!isPressed) {
            ctx.fillStyle = shadowColor;
            ctx.beginPath();
            ctx.roundRect(x, y + shadowHeight, w, h, 15);
            ctx.fill();
        }
        
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.roundRect(x, y + offset, w, h, 15);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w/2, y + h/2 + offset);
    },

    drawScoreWindow: function(ctx, x, y) {
        const w = 200;
        const h = 70;
        
        // 影
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.roundRect(x - w/2 + 6, y - h/2 + 6, w, h, 15);
        ctx.fill();

        // 本体
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.roundRect(x - w/2, y - h/2, w, h, 15);
        ctx.fill();

        // 枠
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#ffaa00";
        ctx.stroke();
        
        // テキスト
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.font = "bold 20px sans-serif";
        ctx.fillStyle = "#ffaa00"; 
        ctx.fillText(`パーフェクト: ${this.stats.perfect}`, x, y - 12);
        
        ctx.fillStyle = "#555"; 
        ctx.fillText(`グッド: ${this.stats.good}`, x, y + 15);
    }
};