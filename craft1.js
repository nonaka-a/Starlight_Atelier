/**
 * --- Craft 1: きじづくり ---
 */
const CraftMixing = {
    // UI
    ui: {
        digitSlots: [
            { id: 0, x: 380, y: 260, w: 70, h: 100 }, // 百の位
            { id: 1, x: 465, y: 260, w: 70, h: 100 }, // 十の位
            { id: 2, x: 550, y: 260, w: 70, h: 100 }  // 一の位
        ],
        btnStartPour: { x: 380, y: 390, w: 240, h: 60, text: "つくる！" }
    },

    // Data
    digitValues: [0, 0, 0], // 百, 十, 一
    digitOffsets: [0, 0, 0], // スクロール演出用
    dragDigit: -1,
    dragStartY: 0,
    itemHeight: 100,

    // Data
    baseX: 500,
    baseY: 300,
    bowlRadius: 150,
    dragDistance: 0,
    blobPoints: [],
    pourWaitTimer: 0,
    elapsedTime: 0, // ★追加: 落下開始からの経過時間
    lastMx: 0, // マウス速度計算用
    lastMy: 0,

    // ゲーム進行管理用
    timeLeft: 10.0,
    isMixingStarted: false, // 「スタート！」演出が終わって操作可能になったか
    startAnimTimer: 0,      // 「スタート！」演出用タイマー
    isTimeUp: false,

    // --- State: Select ---
    updateSelect: function () {
        const cm = CraftManager;
        const mx = Input.x - cm.camera.x;
        const my = Input.y;

        // 初期化: 初回のみ craftAmount から桁を同期
        if (this.dragDigit === -1 && !Input.isDown) {
            const val = cm.craftAmount;
            this.digitValues[0] = Math.floor(val / 100) % 10;
            this.digitValues[1] = Math.floor(val / 10) % 10;
            this.digitValues[2] = val % 10;
        }

        if (Input.isJustPressed) {
            // digitSlots の当たり判定
            for (let i = 0; i < this.ui.digitSlots.length; i++) {
                const s = this.ui.digitSlots[i];
                if (mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h) {
                    this.dragDigit = i;
                    this.dragStartY = my;
                    break;
                }
            }

            if (cm.hitTest(this.ui.btnStartPour)) {
                if (cm.craftAmount > 0) {
                    if (typeof consumeCraftMaterials === 'function') {
                        consumeCraftMaterials(cm.craftAmount);
                    }
                    this.initPouring();
                    cm.state = 'pouring';
                    AudioSys.playTone(800, 'square', 0.1);
                } else {
                    AudioSys.playTone(200, 'sawtooth', 0.2);
                }
            }
        }

        if (Input.isDown && this.dragDigit !== -1) {
            const dy = my - this.dragStartY;
            this.digitOffsets[this.dragDigit] = dy;

            // 一定距離移動したら数値を変更
            if (Math.abs(dy) > this.itemHeight * 0.5) {
                const dir = dy > 0 ? -1 : 1;
                this.digitValues[this.dragDigit] = (this.digitValues[this.dragDigit] + dir + 10) % 10;
                this.dragStartY = my;
                this.digitOffsets[this.dragDigit] = 0;
                AudioSys.playTone(400 + (2 - this.dragDigit) * 100, 'sine', 0.05);

                // 全体の数値を更新
                cm.craftAmount = this.digitValues[0] * 100 + this.digitValues[1] * 10 + this.digitValues[2];
                // 最大数制限
                if (cm.craftAmount > cm.maxCraftAmount) {
                    cm.craftAmount = cm.maxCraftAmount;
                    this.digitValues[0] = Math.floor(cm.craftAmount / 100) % 10;
                    this.digitValues[1] = Math.floor(cm.craftAmount / 10) % 10;
                    this.digitValues[2] = cm.craftAmount % 10;
                }
                // 最小数制限 (0にしておくが、開始時に弾く)
            }
        } else {
            // ドラッグ終了、オフセットを戻す
            if (this.dragDigit !== -1) {
                this.digitOffsets[this.dragDigit] *= 0.5;
                if (Math.abs(this.digitOffsets[this.dragDigit]) < 1) {
                    this.digitOffsets[this.dragDigit] = 0;
                    this.dragDigit = -1;
                }
            }
        }
    },

    drawSelect: function (offsetX) {
        const cm = CraftManager;
        const ctx = cm.ctx;
        const cx = offsetX + 500;
        const cy = 300;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 15;

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        const w = 600, h = 380;
        ctx.roundRect(cx - w / 2, cy - h / 2 - 20, w, h, 20);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = '#ff6b6b';
        ctx.font = "bold 32px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText("ほし づくり", cx, cy - 110);

        ctx.fillStyle = '#555';
        ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("ほしをいくつつくる？", cx, cy - 75);

        // 3桁のスロット
        for (let i = 0; i < 3; i++) {
            const slot = this.ui.digitSlots[i];
            const sx = offsetX + slot.x;
            const sy = slot.y;

            // スロット背景
            ctx.fillStyle = '#f0f0f0';
            ctx.beginPath();
            ctx.roundRect(sx, sy, slot.w, slot.h, 10);
            ctx.fill();
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 数字のクリッピング表示
            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, sy, slot.w, slot.h);
            ctx.clip();

            const val = this.digitValues[i];
            const offY = this.digitOffsets[i];

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // 現在, 上, 下 の数字を描画
            const spacing = 52;
            for (let d = -2; d <= 2; d++) {
                const drawVal = (val + d + 10) % 10;
                const dist = Math.abs(d + offY / spacing);
                ctx.globalAlpha = Math.max(0, 1.0 - dist * 0.85);
                const fontSize = Math.max(20, 64 - dist * 25);
                ctx.fillStyle = '#333';
                ctx.font = `bold ${fontSize}px 'M PLUS Rounded 1c', sans-serif`;
                ctx.fillText(drawVal, sx + slot.w / 2, sy + slot.h / 2 + (d * spacing) + offY);
            }
            ctx.restore();
        }

        ctx.restore();

        // つくる！ボタン
        const btn = { ...this.ui.btnStartPour, x: offsetX + this.ui.btnStartPour.x };
        cm.drawBtn(btn);
    },

    // --- State: Pouring ---
    initPouring: function () {
        const cm = CraftManager;
        cm.currentStar.particles = [];
        const totalParticles = cm.craftAmount * 5;

        for (let i = 0; i < totalParticles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * (this.bowlRadius - 20);

            const groundX = this.baseX + Math.cos(angle) * r;
            const groundY = this.baseY + Math.sin(angle) * r;

            const dropHeight = 300 + Math.random() * 200;

            cm.currentStar.particles.push({
                x: groundX,
                y: groundY - dropHeight,
                groundX: groundX, // 目標X
                groundY: groundY, // 目標Y
                vx: 0,
                vy: 0,
                r: 8 + Math.random() * 4,
                color: '#FFD700',
                isIngredient: true,
                settled: false,
                landed: false // ★追加: 着地フラグ
            });
        }

        this.blobPoints = [];
        for (let i = 0; i < 8; i++) {
            this.blobPoints.push({
                angle: (i / 8) * Math.PI * 2,
                r: 60,
                targetR: 145
            });
        }
        this.pourWaitTimer = 0;
        this.elapsedTime = 0; // ★経過時間リセット
        this.dragDistance = 0;

        this.lastMx = Input.x - CraftManager.camera.x;
        this.lastMy = Input.y;

        // 混ぜフェーズの初期化
        this.timeLeft = 10.0;
        this.isMixingStarted = false;
        this.isTimeUp = false;
        this.startAnimTimer = 0;
    },

    updatePouring: function () {
        const cm = CraftManager;
        const particles = cm.currentStar.particles;
        const gravity = 0.5; // 落下速度
        const slopeGravity = 0.1; // ボウルの傾斜による重力（中央へ転がる力）

        // ★時間経過による強制遷移 (2秒 = 120フレーム)
        this.elapsedTime++;
        if (this.elapsedTime > 120) {
            cm.state = 'mixing';
            return;
        }

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.isIngredient) continue;

            // まだ着地していない場合（落下中）
            if (!p.landed) {
                p.vy += gravity;
                p.y += p.vy;

                // 地面に到達
                if (p.y >= p.groundY) {
                    p.y = p.groundY;
                    p.x = p.groundX;

                    if (Math.abs(p.vy) > 2) {
                        p.vy *= -0.3; // バウンド
                        AudioSys.playNoise(0.05, 0.05);
                    } else {
                        p.vy = 0;
                        p.landed = true; // 着地完了
                    }
                }
            }
            
            // 着地後の挙動（ボウル中央へ転がる + 衝突）
            if (p.landed) {
                // 中央へのベクトル
                const dx = this.baseX - p.x;
                const dy = this.baseY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 中央に向かう力を加える
                if (dist > 5) {
                    const angle = Math.atan2(dy, dx);
                    // 外側ほど傾斜がきついイメージで力を強くする
                    const force = slopeGravity * (dist / this.bowlRadius);
                    p.vx += Math.cos(angle) * force;
                    p.vy += Math.sin(angle) * force;
                }

                // 摩擦
                p.vx *= 0.95;
                p.vy *= 0.95;

                p.x += p.vx;
                p.y += p.vy;
                
                // ★衝突判定 (自分より後ろのインデックスのみチェック)
                for (let j = i + 1; j < particles.length; j++) {
                    const other = particles[j];
                    if (!other.isIngredient || !other.landed) continue;
                    
                    const pdx = p.x - other.x;
                    const pdy = p.y - other.y;
                    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
                    const minDist = p.r + other.r;
                    
                    if (pdist < minDist && pdist > 0) {
                        // 重なっているので反発させる
                        const overlap = (minDist - pdist) / 2;
                        const angle = Math.atan2(pdy, pdx);
                        
                        const pushX = Math.cos(angle) * overlap;
                        const pushY = Math.sin(angle) * overlap;
                        
                        p.x += pushX;
                        p.y += pushY;
                        other.x -= pushX;
                        other.y -= pushY;
                        
                        // 速度も少し交換・減衰
                        p.vx += pushX * 0.1;
                        p.vy += pushY * 0.1;
                        other.vx -= pushX * 0.1;
                        other.vy -= pushY * 0.1;
                    }
                }

                // ほぼ停止したら定着とみなす
                if (Math.abs(p.vx) < 0.05 && Math.abs(p.vy) < 0.05) {
                    p.settled = true;
                } else {
                    p.settled = false;
                }
            }
        }
    },

    // --- State: Mixing ---
    updateMix: function () {
        const cm = CraftManager;
        const particles = cm.currentStar.particles;

        // スタート演出管理
        if (!this.isMixingStarted) {
            this.startAnimTimer++;
            if (this.startAnimTimer > 60) {
                this.isMixingStarted = true;
            }
            this.lastMx = Input.x - cm.camera.x;
            this.lastMy = Input.y;
            return;
        }

        // 終了判定（時間切れのみ）
        if (this.isTimeUp) {
            cm.ui.btnNext.visible = true;
            return;
        }

        // カウントダウン
        this.timeLeft -= 1 / 60;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.isTimeUp = true;
            AudioSys.playTone(600, 'sawtooth', 0.5); // 終了音
        }

        const mx = Input.x - cm.camera.x;
        const my = Input.y;

        const mvx = mx - this.lastMx;
        const mvy = my - this.lastMy;
        this.lastMx = mx;
        this.lastMy = my;

        if (Input.isDown) {
            const dx = mx - this.baseX;
            const dy = my - this.baseY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.bowlRadius + 50) {
                const moveDist = Math.sqrt(mvx * mvx + mvy * mvy);
                this.dragDistance += moveDist;
                
                if (cm.currentStar.mixProgress < 100) {
                    cm.currentStar.mixProgress = Math.min(100, this.dragDistance / 150);
                }

                for (const p of particles) {
                    if (!p.isIngredient) continue;
                    const pdx = mx - p.x;
                    const pdy = my - p.y;
                    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

                    if (pdist < 80) {
                        const power = 1.0 - (pdist / 80);
                        p.vx += mvx * power * 0.5 + (Math.random() - 0.5) * 2;
                        p.vy += mvy * power * 0.5 + (Math.random() - 0.5) * 2;
                    }
                }
            }
        }

        // 物理演算
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.isIngredient) continue;

            p.vx *= 0.9;
            p.vy *= 0.9;
            p.x += p.vx;
            p.y += p.vy;

            // ボウル中央への重力（傾斜）
            const dx = this.baseX - p.x;
            const dy = this.baseY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                const angle = Math.atan2(dy, dx);
                const force = 0.15 * (dist / this.bowlRadius);
                p.vx += Math.cos(angle) * force;
                p.vy += Math.sin(angle) * force;
            }
            
            // ★衝突判定
            for (let j = i + 1; j < particles.length; j++) {
                const other = particles[j];
                if (!other.isIngredient) continue;
                
                const pdx = p.x - other.x;
                const pdy = p.y - other.y;
                const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
                const minDist = p.r + other.r;
                
                if (pdist < minDist && pdist > 0) {
                    const overlap = (minDist - pdist) / 2;
                    const angle = Math.atan2(pdy, pdx);
                    
                    const pushX = Math.cos(angle) * overlap;
                    const pushY = Math.sin(angle) * overlap;
                    
                    p.x += pushX;
                    p.y += pushY;
                    other.x -= pushX;
                    other.y -= pushY;
                    
                    p.vx += pushX * 0.1;
                    p.vy += pushY * 0.1;
                    other.vx -= pushX * 0.1;
                    other.vy -= pushY * 0.1;
                }
            }

            // ボウル壁判定
            const limitR = this.bowlRadius - 15;
            if (dist > limitR) {
                const angle = Math.atan2(dy, dx);
                p.x = this.baseX + Math.cos(angle) * limitR;
                p.y = this.baseY + Math.sin(angle) * limitR;
                p.vx *= -0.5;
                p.vy *= -0.5;
            }
        }

        const progress = cm.currentStar.mixProgress / 100;
        if (progress > 0) {
            for (const pt of this.blobPoints) {
                const wave = Math.sin(Date.now() / 150 + pt.angle * 3) * 5;
                pt.currentR = pt.r + (pt.targetR - pt.r) * progress + wave;
            }
        }
    },

    drawMixArea: function (offsetX) {
        const ctx = CraftManager.ctx;
        const cx = offsetX + this.baseX;
        const cy = this.baseY;

        // --- 画面上部 タイトル (デザイン強化) ---
        if (CraftManager.state === 'mixing') {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = "900 48px 'M PLUS Rounded 1c', sans-serif";

            // 影
            ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 4;

            // 白枠
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 8;
            ctx.strokeText("きじづくり", cx, 60);

            // 赤文字
            ctx.shadowColor = "transparent";
            ctx.fillStyle = '#ff6b6b';
            ctx.fillText("きじづくり", cx, 60);

            ctx.restore();
        }

        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.arc(cx, cy, this.bowlRadius, 0, Math.PI * 2);
        ctx.fill();

        const progress = CraftManager.currentStar.mixProgress / 100;

        // Blob
        if (progress > 0.1) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, progress);
            ctx.fillStyle = '#FFA500';
            ctx.beginPath();
            const pts = this.blobPoints;
            for (let i = 0; i < pts.length; i++) {
                const pt = pts[i];
                const r = pt.currentR || 10;
                const x = cx + Math.cos(pt.angle) * r;
                const y = cy + Math.sin(pt.angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Particles
        for (const p of CraftManager.currentStar.particles) {
            if (!p.isIngredient) continue;
            // 50%から徐々に消えていく
            ctx.globalAlpha = progress > 0.5 ? Math.max(0, 1.0 - (progress - 0.5) * 2) : 1.0;

            if (ctx.globalAlpha > 0) {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1.0;

        // Bowl Front
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, this.bowlRadius, 0, Math.PI * 2);
        ctx.stroke();


        if (CraftManager.state === 'mixing') {
            // --- 吹き出し (元の位置 +50 へ) ---
            this.drawCuteSpeechBubble(offsetX + 50, 480, 320, 70, "きじをしっかりまぜよう！");

            // --- 残り時間ウィンドウ (枠線太く) ---
            this.drawAtelierStyleTimer(offsetX + 850, 300, Math.ceil(this.timeLeft));

            // --- スタート演出 (中央) ---
            if (!this.isMixingStarted) {
                ctx.save();
                ctx.fillStyle = '#ff4500';
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 8;
                ctx.font = "bold 80px 'M PLUS Rounded 1c', sans-serif";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const scale = 1 + Math.sin(this.startAnimTimer * 0.2) * 0.1;
                ctx.translate(cx, cy);
                ctx.scale(scale, scale);

                ctx.strokeText("スタート！", 0, 0);
                ctx.fillText("スタート！", 0, 0);
                ctx.restore();
            }
        }
    },

    // ヘルパー: かわいい吹き出し
    drawCuteSpeechBubble: function (x, y, w, h, text) {
        const ctx = CraftManager.ctx;

        ctx.save();
        ctx.translate(x, y);

        // 影
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;

        // 吹き出し本体
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 5; // 太く

        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 30);
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.stroke();

        // しっぽ (枠線を太くして描画)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        const tailX = w * 0.7;
        ctx.moveTo(tailX, h - 3);
        ctx.quadraticCurveTo(tailX + 10, h + 20, tailX + 20, h - 3);
        ctx.fill();

        ctx.lineWidth = 5;
        ctx.lineCap = 'round'; // 角を丸く
        ctx.beginPath();
        // しっぽのV字ライン
        ctx.moveTo(tailX - 2, h - 1);
        ctx.quadraticCurveTo(tailX + 10, h + 24, tailX + 22, h - 1);
        ctx.stroke();

        // テキスト
        ctx.fillStyle = '#555';
        ctx.font = "bold 22px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 2);

        ctx.restore();
    },

    // ヘルパー: 工房スタイルタイマーウィンドウ
    drawAtelierStyleTimer: function (cx, cy, time) {
        const ctx = CraftManager.ctx;
        const w = 120;
        const h = 100;
        const r = 15;

        ctx.save();
        ctx.translate(cx - w / 2, cy - h / 2);

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

        // 枠線 (太く)
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#ffaa00";
        ctx.stroke();

        // ラベル
        ctx.fillStyle = "#e67e22";
        ctx.font = "bold 16px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText("のこり", w / 2, 25);

        // 時間
        const timeColor = time <= 3 ? '#ff4500' : '#333';
        ctx.fillStyle = timeColor;
        ctx.font = "bold 48px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText(time, w / 2, 65);

        ctx.restore();
    }
};