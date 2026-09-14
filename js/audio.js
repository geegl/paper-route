// ============ 音频：Web Audio 全合成（无音频文件） ============

export class AudioMgr {
  constructor(save) {
    this.save = save;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.rainGain = null;
    this.musicTimer = null;
    this._bar = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.save.data.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      return true;
    } catch (e) { return false; }
  }

  get muted() { return this.save.data.muted; }
  toggleMute() {
    this.save.data.muted = !this.save.data.muted;
    this.save.persist();
    if (this.master) this.master.gain.value = this.save.data.muted ? 0 : 1;
    return this.save.data.muted;
  }

  tone(freq, dur, { type = 'triangle', vol = 0.2, slideTo = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(dur, { filter = 1200, type = 'lowpass', vol = 0.25, delay = 0 } = {}) {
    if (!this.ctx) return;
    if (!this._noiseBuf) {
      const len = this.ctx.sampleRate; // 1 秒白噪声，所有音效共用
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = this.ctx.currentTime + delay;
    const len = Math.min(this._noiseBuf.length, Math.max(1, Math.floor(this.ctx.sampleRate * dur)));
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filter;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0, Math.random() * (this._noiseBuf.length - len), len);
  }

  // ---- 具体音效 ----
  click() { this.tone(880, 0.06, { type: 'square', vol: 0.08 }); }
  throwSfx() { this.noise(0.16, { filter: 2400, type: 'highpass', vol: 0.12 }); }
  ding(mult = 1) {
    this.tone(1240, 0.3, { vol: 0.16 });
    this.tone(1860, 0.4, { vol: 0.1, delay: 0.03 });
    if (mult > 1) {
      for (let i = 0; i < Math.min(mult, 5) - 1; i++) {
        this.tone(830 * Math.pow(1.19, i + 1), 0.14, { type: 'square', vol: 0.07, delay: 0.09 + i * 0.07 });
      }
    }
  }
  wasted() { this.tone(300, 0.16, { type: 'sawtooth', vol: 0.08 }); this.tone(230, 0.2, { type: 'sawtooth', vol: 0.08, delay: 0.12 }); }
  cancel() { this.tone(392, 0.2, { vol: 0.12 }); this.tone(311, 0.28, { vol: 0.12, delay: 0.16 }); this.tone(233, 0.36, { vol: 0.12, delay: 0.34 }); }
  bark(soft = false) {
    this.tone(170 + Math.random() * 40, 0.09, { type: 'square', vol: soft ? 0.05 : 0.12, slideTo: 120 });
    this.tone(160 + Math.random() * 40, 0.08, { type: 'square', vol: soft ? 0.04 : 0.09, delay: 0.14, slideTo: 110 });
  }
  crash() {
    this.noise(0.4, { filter: 500, vol: 0.4 });
    this.tone(90, 0.35, { type: 'sine', vol: 0.4, slideTo: 40 });
  }
  glass() {
    this.noise(0.22, { filter: 3200, type: 'highpass', vol: 0.25 });
    this.tone(2600, 0.18, { vol: 0.1, delay: 0.02, slideTo: 1900 });
    this.tone(3400, 0.12, { vol: 0.07, delay: 0.07 });
  }
  horn() { this.tone(220, 0.35, { type: 'square', vol: 0.1 }); this.tone(277, 0.35, { type: 'square', vol: 0.1 }); }
  jump() { this.tone(280, 0.24, { type: 'square', vol: 0.12, slideTo: 640 }); }
  land() { this.noise(0.12, { filter: 400, vol: 0.2 }); }
  star() { this.tone(1318, 0.18, { vol: 0.12 }); this.tone(1760, 0.24, { vol: 0.1, delay: 0.06 }); }
  perfect() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, { vol: 0.14, delay: i * 0.11 }));
  }

  // ---- 环境雨声 ----
  setRain(on) {
    if (!this.ctx) return;
    if (on && !this.rainGain) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.045;
      src.connect(f); f.connect(this.rainGain); this.rainGain.connect(this.master);
      src.start();
      this._rainSrc = src;
    } else if (!on && this.rainGain) {
      try { this._rainSrc.stop(); } catch (e) { /* 已停止 */ }
      this.rainGain.disconnect();
      this.rainGain = null;
    }
  }

  // ---- 背景音乐：明快五声音阶循环 ----
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
    const melody = [0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 3, 6, 5, 4, 2];
    const bass = [0, 0, 3, 3, 4, 4, 1, 1];
    const stepDur = 0.24;
    let step = 0;
    const schedule = () => {
      if (!this.ctx) return;
      const ahead = this.ctx.currentTime + 0.6;
      while (this._nextT < ahead) {
        const t = Math.max(this._nextT, this.ctx.currentTime + 0.01);
        const mi = melody[step % melody.length];
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = scale[mi];
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.95);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + stepDur);
        if (step % 4 === 0) {
          const bo = this.ctx.createOscillator();
          const bg = this.ctx.createGain();
          bo.type = 'square';
          bo.frequency.value = scale[bass[(step / 4) % bass.length]] / 2;
          bg.gain.setValueAtTime(0.09, t);
          bg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
          bo.connect(bg); bg.connect(this.musicGain);
          bo.start(t); bo.stop(t + stepDur * 2);
        }
        step++;
        this._nextT = t + stepDur;
      }
    };
    this._nextT = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(schedule, 300);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
