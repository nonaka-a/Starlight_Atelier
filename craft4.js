/**
 * --- Craft 4: しあげ (Polishing) ---
 */
const CraftPolishing = {
    shineLevel: 0,
    lastX: 0,
    colors: [
        { code: '#ffff00', name: 'きいろ' },
        { code: '#ff69b4', name: 'ピンク' },
        { code: '#00bfff', name: 'みずいろ' },
        { code: '#ffffff', name: 'しろ' }
    ],
    selectedColorIdx: 0,

    init: function () {
        this.shineLevel = 0;
        this.selectedColorIdx = 3;
        CraftManager.currentStar.color = this.colors[3].code;
    },

    update: function () {
        CraftManager.ui.btnNext.visible = true;
        CraftManager.ui.btnNext.text = "かんせい！";

        const mx = Input.x - CraftManager.camera.x;
        const my = Input.y;
        const offsetX = 3000;

        if (Input.isJustPressed) {
            for (let i = 0; i < this.colors.length; i++) {
                const px = offsetX + 200 + i * 80;
                const py = 500;
                const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
                if (dist < 30) {
                    this.selectedColorIdx = i;
                    CraftManager.currentStar.color = this.colors[i].code;
                    AudioSys.playTone(600, 'sine', 0.1);
                    return;
                }
            }
        }

        const sx = offsetX + 500;
        const sy = 350;
        const distToStar = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (Input.isDown && distToStar < 80) {
            const move = Math.abs(mx - this.lastX);
            if (move > 2) {
                this.shineLevel += 1;
                CraftManager.addParticle(mx + CraftManager.camera.x, my, '#ffffff', 2);
            }
        }
        this.lastX = mx;
    },

    draw: function (offsetX) {
        const ctx = CraftManager.ctx;

        // タイトルと吹き出し
        CraftManager.drawTitle(offsetX, "しあげ");
        CraftManager.drawSpeechBubble(offsetX, "きれいにみがいて 完成させよう！");

        ctx.save();
        ctx.translate(offsetX + 500, 350);
        if (this.shineLevel > 50) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = 'white';
        }
        ctx.fillStyle = CraftManager.currentStar.color;
        ctx.beginPath();
        CraftManager.drawStarShape(ctx, 0, 0, 80, 40);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        for (let i = 0; i < this.colors.length; i++) {
            const c = this.colors[i];
            const px = offsetX + 200 + i * 80;
            const py = 500;
            ctx.fillStyle = c.code;
            ctx.beginPath();
            ctx.arc(px, py, 30, 0, Math.PI * 2);
            ctx.fill();
            if (i === this.selectedColorIdx) {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }
    }
};