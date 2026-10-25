const BASE = import.meta.env.BASE_URL;

const MUSIC_VOL = 0.38;
const MUSIC_DUCKED = 0.12;
const SFX_VOL = 0.55;

export class Sound {
  musicOn = true;
  sfxOn = true;

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private el: HTMLAudioElement | null = null;
  private noise: AudioBuffer | null = null;

  /** Must be called from a user gesture (iOS/Chrome autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      // Match the original's sound.set_honors_silent_switch(False).
      if (nav.audioSession) nav.audioSession.type = 'playback';

      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? MUSIC_VOL : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? SFX_VOL : 0;
      this.sfxGain.connect(this.master);

      const el = document.createElement('audio');
      const webmOnly = !el.canPlayType('audio/mp4; codecs="mp4a.40.2"') && el.canPlayType('audio/webm; codecs="opus"');
      el.src = `${BASE}audio/ode_to_joy.${webmOnly ? 'webm' : 'm4a'}`;
      el.loop = true;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      this.ctx.createMediaElementSource(el).connect(this.musicGain);
      this.el = el;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    this.ramp(this.musicGain, on ? MUSIC_VOL : 0, 0.15);
    if (on && this.el && this.el.paused && this.wantMusic) void this.el.play().catch(() => {});
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    this.ramp(this.sfxGain, on ? SFX_VOL : 0, 0.05);
  }

  private wantMusic = false;

  startMusic(fromTop: boolean) {
    if (!this.el) return;
    this.wantMusic = true;
    if (fromTop) this.el.currentTime = 0;
    this.ramp(this.musicGain, this.musicOn ? MUSIC_VOL : 0, 0.2);
    if (this.musicOn) void this.el.play().catch(() => {});
  }

  stopMusic() {
    this.wantMusic = false;
    this.el?.pause();
  }

  duck(on: boolean) {
    if (!this.musicOn) return;
    this.ramp(this.musicGain, on ? MUSIC_DUCKED : MUSIC_VOL, 0.25);
  }

  /** Suspend everything while the tab is hidden; saves battery on phones. */
  suspend(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) {
      this.el?.pause();
      void this.ctx.suspend();
    } else {
      void this.ctx.resume();
      if (this.wantMusic && this.musicOn) void this.el?.play().catch(() => {});
    }
  }

  private ramp(g: GainNode | undefined, v: number, time: number) {
    if (!this.ctx || !g) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(v, now + time);
  }

  // ── Synthesized SFX ───────────────────────────────────────────────────────

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, glideTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(start: number, dur: number, vol: number, cutoff: number) {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur);
  }

  private ready() {
    return !!this.ctx && this.sfxOn && this.ctx.state === 'running';
  }

  levelUp() {
    if (!this.ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.07, 0.22, 'triangle', 0.22));
  }

  wave() {
    if (!this.ready()) return;
    this.tone(880, 0, 0.18, 'sine', 0.12);
    this.tone(1318.5, 0.06, 0.2, 'sine', 0.08);
  }

  nearMiss() {
    if (!this.ready()) return;
    this.tone(1600, 0, 0.09, 'triangle', 0.08, 2400);
  }

  crack() {
    if (!this.ready()) return;
    this.burst(0, 0.12, 0.35, 5200);
    this.tone(420, 0, 0.1, 'square', 0.05, 180);
  }

  formation() {
    if (!this.ready()) return;
    [392, 392, 587.33].forEach((f, i) => this.tone(f, i * 0.09, 0.12, 'square', 0.06));
  }

  death() {
    if (!this.ready()) return;
    this.burst(0, 0.55, 0.9, 3200);
    this.tone(160, 0, 0.5, 'sawtooth', 0.25, 40);
    this.tone(90, 0.02, 0.6, 'sine', 0.5, 30);
  }

  click() {
    if (!this.ready()) return;
    this.tone(660, 0, 0.06, 'square', 0.05);
  }
}
