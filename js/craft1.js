/**
 * --- Craft 1: きじづくり ---
 */

// 画像リソース管理
const CraftImages = {
    loaded: false,
    bgBack: new Image(),
    bowlFront: new Image(),
    stars: [],
    kiji: {
        A: [], B: [], C: [], D: [], E: []
    },
    tutorialHand: new Image(),

    loadAssets: async function () {
        if (this.loaded) return;

        const path = 'image/craft_image/';
        const promises = [];

        // 背景・ボウル
        promises.push(CraftManager.loadImage(path + 'bg_bowl_back.png').then(img => this.bgBack = img));
        promises.push(CraftManager.loadImage(path + 'bowl_front.png').then(img => this.bowlFront = img));

        // ほしのもと (3種)
        this.stars = new Array(3);
        for (let i = 0; i < 3; i++) {
            promises.push(CraftManager.loadImage(path + `star_${i + 1}.png`).then(img => this.stars[i] = img));
        }

        // きじアニメーション (A~E, 各8枚)
        const types = ['A', 'B', 'C', 'D', 'E'];
        types.forEach(type => {
            this.kiji[type] = new Array(8);
            for (let i = 0; i < 8; i++) {
                promises.push(CraftManager.loadImage(path + `kiji_${type}_${i + 1}.png`).then(img => this.kiji[type][i] = img));
            }
        });

        promises.push(CraftManager.loadImage('image/tutorial/hand.png').then(img => this.tutorialHand = img));

        // SEの先行読み込み
        promises.push(CraftManager.loadSound('se_mix', 'sounds/Mix_candies.mp3'));
        promises.push(CraftManager.loadSound('se_knead', 'sounds/Knead.mp3'));

        await Promise.all(promises);
        this.loaded = true;
    },

    // 後方互換性のため残すが、ロード完了を待てないので非推奨
    load: function () { this.loadAssets(); }
};

const CraftMixing = {
    // UI
    ui: {
        digitSlots: [
            { id: 0, x: 380, y: 260, w: 70, h: 100 },
            { id: 1, x: 465, y: 260, w: 70, h: 100 },
            { id: 2, x: 550, y: 260, w: 70, h: 100 }
        ],
        btnStartPour: { x: 380, y: 390, w: 240, h: 60, text: "つくる！" }
    },

    // Data
    digitValues: [0, 0, 0],
    digitOffsets: [0, 0, 0],
    dragDigit: -1,
    dragStartY: 0,
    itemHeight: 100,

    // Data
    baseX: 500,
    baseY: 300,
    bowlRadius: 150,
    dragDistance: 0,
    pourWaitTimer: 0,
    elapsedTime: 0,
    lastMx: 0,
    lastMy: 0,

    // ゲーム進行管理用
    timeLeft: 10.0,
    isMixingStarted: false,
    startAnimTimer: 0,
    isTimeUp: false,

    // アニメーション用
    animFrameTimer: 0,
    mixSoundCooldown: 0,
    kneadSoundCooldown: 0,
    activeSounds: [], // ★再生中の音源を追跡するリスト
    showTutorial: false, // ★チュートリアル表示フラグ
    tutorialTimer: 0,

    // --- State: Select ---
    loadAssets: async function () {
        await CraftImages.loadAssets();
    },

    updateSelect: function () {
        // CraftImages.load(); // loading画面で完了しているので不要だが、念のため残すならこう書く
        // しかしここでは削除推奨。CraftManagerが一括管理するため。

        const cm = CraftManager;
        const mx = Input.x - cm.camera.x;
        const my = Input.y;

        if (this.dragDigit === -1 && !Input.isDown) {
            const val = cm.craftAmount;
            this.digitValues[0] = Math.floor(val / 100) % 10;
            this.digitValues[1] = Math.floor(val / 10) % 10;
            this.digitValues[2] = val % 10;
        }

        if (Input.isJustPressed) {
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

            if (Math.abs(dy) > this.itemHeight * 0.5) {
                const dir = dy > 0 ? -1 : 1;
                this.digitValues[this.dragDigit] = (this.digitValues[this.dragDigit] + dir + 10) % 10;
                this.dragStartY = my;
                this.digitOffsets[this.dragDigit] = 0;
                AudioSys.playTone(400 + (2 - this.dragDigit) * 100, 'sine', 0.05);

                cm.craftAmount = this.digitValues[0] * 100 + this.digitValues[1] * 10 + this.digitValues[2];
                if (cm.craftAmount > cm.maxCraftAmount) {
                    cm.craftAmount = cm.maxCraftAmount;
                    this.digitValues[0] = Math.floor(cm.craftAmount / 100) % 10;
                    this.digitValues[1] = Math.floor(cm.craftAmount / 10) % 10;
                    this.digitValues[2] = cm.craftAmount % 10;
                }
            }
        } else {
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
        ctx.font = "900 32px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText("ほし づくり", cx, cy - 110);

        ctx.fillStyle = '#555';
        ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
        ctx.fillText("ほしをいくつつくる？", cx, cy - 75);

        for (let i = 0; i < 3; i++) {
            const slot = this.ui.digitSlots[i];
            const sx = offsetX + slot.x;
            const sy = slot.y;

            ctx.fillStyle = '#f0f0f0';
            ctx.beginPath();
            ctx.roundRect(sx, sy, slot.w, slot.h, 10);
            ctx.fill();
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, sy, slot.w, slot.h);
            ctx.clip();

            const val = this.digitValues[i];
            const offY = this.digitOffsets[i];

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const spacing = 52;
            for (let d = -2; d <= 2; d++) {
                const drawVal = (val + d + 10) % 10;
                const dist = Math.abs(d + offY / spacing);
                ctx.globalAlpha = Math.max(0, 1.0 - dist * 0.85);
                const fontSize = Math.max(20, 64 - dist * 25);
                ctx.fillStyle = '#333';
                ctx.font = `900 ${fontSize}px 'M PLUS Rounded 1c', sans-serif`;
                ctx.fillText(drawVal, sx + slot.w / 2, sy + slot.h / 2 + (d * spacing) + offY);
            }
            ctx.restore();
        }

        ctx.restore();

        const btn = { ...this.ui.btnStartPour, x: offsetX + this.ui.btnStartPour.x };
        cm.drawBtn(btn);
    },

    // --- State: Pouring ---
    initPouring: function () {
        const cm = CraftManager;
        cm.currentStar.particles = [];

        // 視覚的な上限を30に設定
        const visualAmount = Math.min(cm.craftAmount, 30);
        const totalParticles = visualAmount * 5;

        for (let i = 0; i < totalParticles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * (this.bowlRadius - 20);

            const groundX = this.baseX + Math.cos(angle) * r;
            const groundY = this.baseY + Math.sin(angle) * r;

            const dropHeight = 300 + Math.random() * 200;

            const vanishThreshold = 50 + Math.random() * 40;

            cm.currentStar.particles.push({
                x: groundX,
                y: groundY - dropHeight,
                groundX: groundX,
                groundY: groundY,
                vx: 0,
                vy: 0,
                r: 8 + Math.random() * 4,
                color: '#FFD700',
                isIngredient: true,
                settled: false,
                landed: false,
                imgIndex: Math.floor(Math.random() * 3),
                vanishThreshold: vanishThreshold
            });
        }

        this.pourWaitTimer = 0;
        this.elapsedTime = 0;
        this.dragDistance = 0;

        this.lastMx = Input.x - CraftManager.camera.x;
        this.lastMy = Input.y;

        // 混ぜフェーズの初期化
        this.timeLeft = 10.0;
        this.isMixingStarted = false;
        this.isTimeUp = false;
        this.startAnimTimer = 0;
        this.animFrameTimer = 0;
        this.currentAnimFrame = 0;

        // 初回のみチュートリアルを表示
        this.showTutorial = !hasSeenKneadTutorial;
        this.tutorialTimer = 0;
    },

    updatePouring: function () {
        const cm = CraftManager;
        const particles = cm.currentStar.particles;
        const gravity = 0.5;
        const slopeGravity = 0.1;

        this.elapsedTime++;
        if (this.elapsedTime > 120) {
            cm.state = 'mixing';
            return;
        }

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.isIngredient) continue;

            if (!p.landed) {
                p.vy += gravity;
                p.y += p.vy;

                if (p.y >= p.groundY) {
                    p.y = p.groundY;
                    p.x = p.groundX;

                    if (Math.abs(p.vy) > 2) {
                        p.vy *= -0.3;
                        AudioSys.playNoise(0.05, 0.05);
                    } else {
                        p.vy = 0;
                        p.landed = true;
                    }
                }
            }

            if (p.landed) {
                const dx = this.baseX - p.x;
                const dy = this.baseY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 5) {
                    const angle = Math.atan2(dy, dx);
                    const force = slopeGravity * (dist / this.bowlRadius);
                    p.vx += Math.cos(angle) * force;
                    p.vy += Math.sin(angle) * force;
                }

                p.vx *= 0.95;
                p.vy *= 0.95;

                p.x += p.vx;
                p.y += p.vy;

                // 衝突判定
                for (let j = i + 1; j < particles.length; j++) {
                    const other = particles[j];
                    if (!other.isIngredient || !other.landed) continue;

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

        if (this.showTutorial) {
            this.tutorialTimer++;
            if (Input.isJustPressed) {
                this.showTutorial = false;
                hasSeenKneadTutorial = true;
                if (typeof DataManager !== 'undefined') DataManager.save();
                AudioSys.playTone(600, 'sine', 0.1);
            }
            return; // チュートリアル中はタイマーを進めない
        }

        if (!this.isMixingStarted) {
            this.startAnimTimer++;
            if (this.startAnimTimer > 60) {
                this.isMixingStarted = true;
            }
            this.lastMx = Input.x - cm.camera.x;
            this.lastMy = Input.y;
            return;
        }

        if (this.isTimeUp) {
            cm.ui.btnNext.visible = true;
            return;
        }

        this.timeLeft -= 1 / 60;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.isTimeUp = true;
            AudioSys.playTone(600, 'sawtooth', 0.5);
            // ★タイムアップ時に全てのSE（混ぜる音）を停止
            this.activeSounds.forEach(s => AudioSys.stopSE(s));
            this.activeSounds = [];
        }

        const mx = Input.x - cm.camera.x;
        const my = Input.y;

        const mvx = mx - this.lastMx;
        const mvy = my - this.lastMy;
        this.lastMx = mx;
        this.lastMy = my;

        if (this.mixSoundCooldown > 0) this.mixSoundCooldown--;
        if (this.kneadSoundCooldown > 0) this.kneadSoundCooldown--;

        if (Input.isDown) {
            // ★ドラッグ中のみアニメーション進行
            this.animFrameTimer++;
            if (this.animFrameTimer > 7.5) {
                this.animFrameTimer = 0;
                this.currentAnimFrame = (this.currentAnimFrame + 1) % 8;
            }

            const dx = mx - this.baseX;
            const dy = my - this.baseY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.bowlRadius + 50) {
                const moveDist = Math.sqrt(mvx * mvx + mvy * mvy);
                this.dragDistance += moveDist;

                if (cm.currentStar.mixProgress < 100) {
                    cm.currentStar.mixProgress = Math.min(100, this.dragDistance / 200);
                }

                // ★音の再生 (進捗0~50%未満 & 3秒間隔 & 実際に動いている時)
                if (cm.currentStar.mixProgress > 0 && cm.currentStar.mixProgress < 50) {
                    if (this.mixSoundCooldown <= 0 && moveDist > 1.0) {
                        const s = AudioSys.playSE('se_mix', 0.6);
                        if (s) this.activeSounds.push(s);
                        this.mixSoundCooldown = 180; // 3秒 (60fps * 3)
                    }
                }
                // ★音の再生 (進捗50%~ & 2秒間隔 & 実際に動いている時)
                if (cm.currentStar.mixProgress >= 50) {
                    if (this.kneadSoundCooldown <= 0 && moveDist > 1.0) {
                        const s = AudioSys.playSE('se_knead', 0.6);
                        if (s) this.activeSounds.push(s);
                        this.kneadSoundCooldown = 120; // 2秒 (60fps * 2)
                    }
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

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.isIngredient) continue;

            p.vx *= 0.9;
            p.vy *= 0.9;
            p.x += p.vx;
            p.y += p.vy;

            const dx = this.baseX - p.x;
            const dy = this.baseY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                const angle = Math.atan2(dy, dx);
                const force = 0.15 * (dist / this.bowlRadius);
                p.vx += Math.cos(angle) * force;
                p.vy += Math.sin(angle) * force;
            }

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

            const limitR = this.bowlRadius - 15;
            if (dist > limitR) {
                const angle = Math.atan2(dy, dx);
                p.x = this.baseX + Math.cos(angle) * limitR;
                p.y = this.baseY + Math.sin(angle) * limitR;
                p.vx *= -0.5;
                p.vy *= -0.5;
            }
        }
    },

    end: function () {
        // スコア計算 (Max 30)
        // mixProgress (0-100) を使用
        const progress = Math.min(100, Math.max(0, CraftManager.currentStar.mixProgress));
        // 30点満点
        CraftManager.currentStar.scoreMix = Math.floor(progress * 0.3);
        console.log("Mix Score:", CraftManager.currentStar.scoreMix);
    },

    drawMixArea: function (offsetX) {
        const ctx = CraftManager.ctx;
        const cx = offsetX + this.baseX;
        const cy = this.baseY;

        // --- 背景・ボウル底面 (画像) ---
        if (CraftImages.bgBack.complete) {
            ctx.drawImage(CraftImages.bgBack, offsetX, 0, 1000, 600);
        } else {
            ctx.fillStyle = '#f5e6d3';
            ctx.fillRect(offsetX, 0, 1000, 600);
            ctx.fillStyle = '#5d4037';
            ctx.beginPath();
            ctx.arc(cx, cy, this.bowlRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- 画面上部 タイトル ---
        if (CraftManager.state === 'mixing') {
            CraftManager.drawTitle(offsetX, "きじづくり");
        }

        const progress = CraftManager.currentStar.mixProgress; // 0-100

        // --- きじのアニメーション ---
        if (progress > 20) {
            let animType = '';
            if (progress <= 40) animType = 'A';
            else if (progress <= 60) animType = 'B';
            else if (progress <= 80) animType = 'C';
            else if (progress <= 99) animType = 'D';
            else animType = 'E'; // 100%

            const frameIndex = this.currentAnimFrame;
            if (CraftImages.kiji[animType] && CraftImages.kiji[animType][frameIndex]) {
                const img = CraftImages.kiji[animType][frameIndex];
                if (img.complete) {
                    const w = img.width;
                    const h = img.height;
                    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
                }
            }
        }

        // --- ほしのもと (パーティクル) ---
        for (const p of CraftManager.currentStar.particles) {
            if (!p.isIngredient) continue;

            let alpha = 1.0;
            if (progress > p.vanishThreshold) {
                alpha = Math.max(0, 1.0 - (progress - p.vanishThreshold) / 10);
            }
            ctx.globalAlpha = alpha;

            if (ctx.globalAlpha > 0) {
                const starImg = CraftImages.stars[p.imgIndex];
                if (starImg && starImg.complete) {
                    const size = p.r * 3;
                    ctx.drawImage(starImg, p.x - size / 2, p.y - size / 2, size, size);
                } else {
                    ctx.fillStyle = '#FFD700';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.globalAlpha = 1.0;

        // --- ボウル手前 (画像) ---
        if (CraftImages.bowlFront.complete) {
            ctx.drawImage(CraftImages.bowlFront, offsetX, 0, 1000, 600);
        } else {
            ctx.strokeStyle = '#3e2723';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(cx, cy, this.bowlRadius, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (CraftManager.state === 'mixing') {
            let message = "きじをしっかりまぜよう！";
            if (progress >= 100) message = "できた！";
            else if (progress > 50) message = "そのちょうし！";
            else if (progress >= 20) message = "もっと！もっと！";

            CraftManager.drawSpeechBubble(offsetX, message);

            const timeColor = this.timeLeft <= 3 ? '#ff4500' : '#333';
            CraftManager.drawYellowWindow(offsetX, 850, 300, 150, 100, "のこり", Math.ceil(this.timeLeft), timeColor, "びょう");

            if (!this.isMixingStarted) {
                ctx.save();
                ctx.fillStyle = '#ff4500';
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 8;
                ctx.font = "900 80px 'M PLUS Rounded 1c', sans-serif";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const scale = 1 + Math.sin(this.startAnimTimer * 0.2) * 0.1;
                ctx.translate(cx, cy);
                ctx.scale(scale, scale);
                ctx.strokeText("スタート！", 0, 0);
                ctx.fillText("スタート！", 0, 0);
                ctx.restore();
            }

            // --- チュートリアルオーバーレイ ---
            if (this.showTutorial) {
                // 画面を暗くする
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(offsetX, 0, 1000, 600);

                // 手のアイコンをぐるぐる回す
                if (CraftImages.tutorialHand.complete) {
                    const hand = CraftImages.tutorialHand;
                    const angle = this.tutorialTimer * 0.1;
                    const radius = 120; // 少し広めに回す
                    const hx = cx + Math.cos(angle) * radius;
                    const hy = cy + Math.sin(angle) * radius;

                    ctx.save();
                    ctx.translate(hx, hy);
                    // 回転はさせず位置だけ動かす
                    const hw = 180;
                    const hh = 180;
                    ctx.drawImage(hand, -hw / 2, -hh / 2, hw, hh);
                    ctx.restore();
                }
            }
        }
    }
};