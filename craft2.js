/**
 * --- Craft 2: かた抜き ---
 */
const CraftMolding = {
    lanes: [],
    timer: 0,
    spawnInterval: 120,
    successCount: 0,
    maxCount: 3,
    noteSpeed: 5,

    init: function () {
        this.lanes = [];
        this.successCount = 0;
        this.maxCount = CraftManager.craftAmount * 3;
        this.spawnInterval = Math.max(60, 120 - CraftManager.craftAmount * 5);
        this.timer = 0;
    },

    update: function () {
        if (this.successCount >= this.maxCount) {
            CraftManager.ui.btnNext.visible = true;
            this.lanes = [];
            return;
        }

        this.timer++;
        if (this.timer > this.spawnInterval) {
            this.timer = 0;
            this.lanes.push({
                x: 1000 + 1000,
                y: 350,
                w: 80, h: 80,
                active: true
            });
        }

        for (const note of this.lanes) {
            note.x -= this.noteSpeed;
        }
        this.lanes = this.lanes.filter(n => n.x > 900);

        const judgeLine = 1000 + 500;
        if (Input.isJustPressed || keys.Space) {
            const target = this.lanes.find(n => n.active && Math.abs((n.x + n.w / 2) - judgeLine) < 80);
            if (target) {
                target.active = false;
                const diff = Math.abs((target.x + target.w / 2) - judgeLine);
                if (diff < 40) {
                    this.successCount++;
                    CraftManager.addParticle(target.x, target.y, '#FFA500', 8);
                    AudioSys.playTone(880, 'sine', 0.1);
                } else {
                    AudioSys.playNoise(0.1);
                }
            }
        }
    },

    draw: function (offsetX) {
        const ctx = CraftManager.ctx;

        // タイトルと吹き出し
        CraftManager.drawTitle(offsetX, "かたぬき");
        CraftManager.drawSpeechBubble(offsetX, "タイミングよく かたをぬこう！");

        // のこり回数を黄色ウィンドウで表示
        CraftManager.drawYellowWindow(offsetX, 700, 480, 150, 100, "あと", this.maxCount - this.successCount);

        ctx.fillStyle = '#555';
        ctx.fillRect(offsetX, 300, 1000, 100);

        const judgeX = offsetX + 500;
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 5;
        ctx.beginPath();
        CraftManager.drawStarShape(ctx, judgeX, 350, 50, 25);
        ctx.stroke();

        ctx.fillStyle = '#FFA500';
        for (const note of this.lanes) {
            if (!note.active) continue;
            ctx.fillRect(note.x, note.y - 40, 80, 80);
        }
    }
};