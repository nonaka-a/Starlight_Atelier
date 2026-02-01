/**
 * --- 音響システム ---
 */
const AudioSys = {
    ctx: null,
    buffers: {}, // ★BGMデータを名前付きで保持
    bgmSource: null,
    currentBgmName: null, // ★現在再生中のBGM名
    isMuted: false,

    init: function () {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } else if (this.ctx.state === 'suspended' && !this.isMuted) {
            this.ctx.resume();
        }
    },

    // 外部ファイルを読み込む関数
    loadBGM: function (name, url) {
        if (!this.ctx) this.init();
        return fetch(url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => this.ctx.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                this.buffers[name] = audioBuffer;
                return audioBuffer;
            })
            .catch(e => console.error(`BGM Load Error (${name}):`, e));
    },

    // BGM再生 (名前を指定)
    playBGM: function (name, vol = 0.5) {
        if (!this.ctx || !this.buffers[name]) return;

        // 同じ曲が既に流れていれば何もしない
        if (this.currentBgmName === name && this.bgmSource) return;

        this.stopBGM();

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.value = vol;

        source.connect(gain);
        gain.connect(this.ctx.destination);

        source.start(0);
        this.bgmSource = source;
        this.bgmGain = gain; // GainNodeを保持
        this.currentBgmName = name;
    },

    stopBGM: function () {
        if (this.bgmSource) {
            try {
                this.bgmSource.stop();
            } catch (e) { }
            this.bgmSource = null;
            this.bgmGain = null;
            this.currentBgmName = null;
        }
    },

    // BGMをフェードアウトして停止
    fadeOutBGM: function (duration = 2.0) {
        if (!this.bgmSource || !this.bgmGain || !this.ctx) return;

        const currentTime = this.ctx.currentTime;
        const currentVolume = this.bgmGain.gain.value;

        // 現在のボリュームから0まで減衰
        this.bgmGain.gain.setValueAtTime(currentVolume, currentTime);
        this.bgmGain.gain.linearRampToValueAtTime(0.001, currentTime + duration);

        // フェードアウト完了後に停止
        setTimeout(() => {
            this.stopBGM();
        }, duration * 1000);
    },

    playTone: function (freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;

        // 'noise' タイプは Oscillator に存在しないため専用関数へ委譲
        if (type === 'noise') {
            this.playNoise(duration, vol);
            return;
        }

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
    playNoise: function (duration, vol = 0.2) {
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

    seJump: function () { this.playSE('se_jump', 0.4); },
    seHighJump: function () { this.playSE('se_jump2', 0.4); },
    seShoot: function () { this.playNoise(0.1, 0.1); },
    seExplosion: function () { this.playNoise(0.3, 0.2); },
    seClear: function () {
        this.stopBGM();
        this.playTone(523, 'sine', 0.2);
        setTimeout(() => this.playTone(659, 'sine', 0.2), 200);
        setTimeout(() => this.playTone(783, 'sine', 0.4), 400);
    },
    seGameOver: function () {
        this.stopBGM();
        this.playTone(100, 'sawtooth', 0.5, 0.2);
    },
    playSE: function (name, vol = 0.5) {
        if (!this.ctx || !this.buffers[name]) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        const gain = this.ctx.createGain();
        gain.gain.value = vol;
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);
        return source;
    },
    startLoop: function (name, vol = 0.5) {
        if (!this.ctx || !this.buffers[name]) return null;
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = vol;
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);
        return source;
    },
    stopSE: function (source) {
        if (source) {
            try { source.stop(); } catch (e) { }
        }
    }
};