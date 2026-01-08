/**
 * --- 音響システム ---
 */
const AudioSys = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.startBGM();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    playTone: function(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    playNoise: function(duration, vol = 0.2) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    },
    startBGM: function() {
        const loop = () => {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            if(Math.floor(t*4)%8==0) this.playTone(200, 'triangle', 0.1, 0.05);
            setTimeout(loop, 250);
        };
        loop();
    },
    seJump: function() { this.playTone(300, 'square', 0.1, 0.1); },
    seShoot: function() { this.playNoise(0.1, 0.1); },
    seExplosion: function() { this.playNoise(0.3, 0.2); },
    seClear: function() { 
        this.playTone(523, 'sine', 0.2); 
        setTimeout(()=>this.playTone(659, 'sine', 0.2), 200);
        setTimeout(()=>this.playTone(783, 'sine', 0.4), 400);
    },
    seGameOver: function() { this.playTone(100, 'sawtooth', 0.5, 0.2); }
};