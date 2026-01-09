/**
 * --- 音響システム ---
 */
const AudioSys = {
    ctx: null,
    bgmBuffer: null, // BGMデータを保持するバッファ
    bgmSource: null, // 再生中のソースノード
    
    init: function() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // 外部ファイルを読み込む関数
    loadBGM: function(url) {
        if (!this.ctx) this.init();
        return fetch(url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => this.ctx.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                this.bgmBuffer = audioBuffer;
                return audioBuffer;
            })
            .catch(e => console.error("BGM Load Error:", e));
    },

    // BGM再生
    playBGM: function(vol = 0.5) {
        if (!this.ctx || !this.bgmBuffer) return;
        
        // 既に再生中なら止める（二重再生防止）
        this.stopBGM();

        const source = this.ctx.createBufferSource();
        source.buffer = this.bgmBuffer;
        source.loop = true; // ループ再生

        const gain = this.ctx.createGain();
        gain.gain.value = vol;

        source.connect(gain);
        gain.connect(this.ctx.destination);
        
        source.start(0);
        this.bgmSource = source;
    },

    stopBGM: function() {
        if (this.bgmSource) {
            try {
                this.bgmSource.stop();
            } catch(e) {} // 既に停止している場合のエラー無視
            this.bgmSource = null;
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
    
    // 効果音系はそのまま
    seJump: function() { this.playTone(300, 'square', 0.1, 0.1); },
    seShoot: function() { this.playNoise(0.1, 0.1); },
    seExplosion: function() { this.playNoise(0.3, 0.2); },
    seClear: function() { 
        this.stopBGM(); // クリア時にBGMを止める
        this.playTone(523, 'sine', 0.2); 
        setTimeout(()=>this.playTone(659, 'sine', 0.2), 200);
        setTimeout(()=>this.playTone(783, 'sine', 0.4), 400);
    },
    seGameOver: function() { 
        this.stopBGM(); // ゲームオーバー時にBGMを止める
        this.playTone(100, 'sawtooth', 0.5, 0.2); 
    }
};