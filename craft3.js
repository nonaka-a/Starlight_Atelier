/**
 * --- Craft 3: ほし焼き ---
 */
const CraftFiring = {
    targetTempMin: 60,
    targetTempMax: 80,
    timerInZone: 0,
    requiredTime: 180,
    isComplete: false,

    init: function () {
        CraftManager.currentStar.bakeTemp = 20;
        this.timerInZone = 0;
        this.isComplete = false;
    },

    update: function () {
        if (this.isComplete) {
            CraftManager.ui.btnNext.visible = true;
            return;
        }
        CraftManager.currentStar.bakeTemp -= 0.5;
        if (CraftManager.currentStar.bakeTemp < 20) CraftManager.currentStar.bakeTemp = 20;

        if (Input.isJustPressed || keys.Space) {
            CraftManager.currentStar.bakeTemp += 8;
            CraftManager.addParticle(2000 + 500, 400, '#ff4500', 3);
            if (keys.Space) keys.Space = false;
        }
        if (CraftManager.currentStar.bakeTemp > 120) CraftManager.currentStar.bakeTemp = 120;

        const temp = CraftManager.currentStar.bakeTemp;
        if (temp >= this.targetTempMin && temp <= this.targetTempMax) {
            this.timerInZone++;
        }
        if (this.timerInZone >= this.requiredTime) {
            this.isComplete = true;
            CraftManager.currentStar.bakeState = 'good';
            AudioSys.seClear();
        }
    },

    draw: function (offsetX) {
        const ctx = CraftManager.ctx;

        // タイトルと吹き出し
        CraftManager.drawTitle(offsetX, "ほし焼き");
        CraftManager.drawSpeechBubble(offsetX, "温度に気をつけて 焼こう！");

        // 進行度を黄色ウィンドウで表示
        const progress = Math.min(100, Math.floor(this.timerInZone / this.requiredTime * 100));
        CraftManager.drawYellowWindow(offsetX, 700, 480, 150, 100, "やき加減", progress + "%");

        ctx.fillStyle = '#444';
        ctx.fillRect(offsetX + 300, 200, 400, 300);
        ctx.fillStyle = `rgba(255, 100, 0, ${CraftManager.currentStar.bakeTemp / 150})`;
        ctx.fillRect(offsetX + 350, 250, 300, 200);

        ctx.save();
        ctx.translate(offsetX + 500, 350);

        let starColor = '#FFA500';
        if (CraftManager.currentStar.bakeTemp > 90) starColor = '#8b4513';
        else if (this.timerInZone > 60) starColor = '#f0e68c';

        ctx.fillStyle = starColor;
        ctx.beginPath();
        CraftManager.drawStarShape(ctx, 0, 0, 60, 30);
        ctx.fill();
        ctx.restore();

        const barX = offsetX + 750;
        const barY = 200;
        const barH = 300;
        ctx.fillStyle = '#ddd';
        ctx.fillRect(barX, barY, 30, barH);
        const zoneY = barY + barH - (this.targetTempMax / 120 * barH);
        const zoneH = (this.targetTempMax - this.targetTempMin) / 120 * barH;
        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.fillRect(barX, zoneY, 30, zoneH);
        const curH = (CraftManager.currentStar.bakeTemp / 120) * barH;
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(barX, barY + barH - curH, 30, curH);
    }
};