// All sound, synthesized with the Web Audio API — no samples, no downloads.
// Dice impacts and rolling (driven by the recorded trajectory), a chip click,
// and a win chime that scales with the payout. Nothing else, per spec.

import type { ImpactKind } from './impacts';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private rollSrc: AudioBufferSourceNode | null = null;
  private rollGain: GainNode | null = null;
  private _enabled = true;

  get enabled() {
    return this._enabled;
  }

  setEnabled(on: boolean) {
    this._enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
    }
  }

  /** Create/resume the context — must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._enabled ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private noiseBurst(
    freq: number,
    q: number,
    duration: number,
    gain: number,
    when = 0,
  ) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.02);
  }

  private thump(freq: number, duration: number, gain: number, when = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** A die collision; intensity 0..1 from the physics delta-v. */
  impact(kind: ImpactKind, intensity: number) {
    if (!this.ctx) return;
    const i = Math.max(0.08, Math.min(1, intensity));
    switch (kind) {
      case 'felt':
        this.noiseBurst(230 + 260 * i, 0.7, 0.08, 0.16 + 0.35 * i);
        this.thump(95, 0.07, 0.22 * i);
        break;
      case 'wall':
        this.noiseBurst(640, 1.1, 0.06, 0.2 + 0.4 * i);
        this.thump(150, 0.06, 0.28 * i);
        break;
      case 'dice':
        this.noiseBurst(2500, 2.2, 0.035, 0.18 + 0.38 * i);
        break;
    }
  }

  /** Continuous tumble noise while the dice roll across the felt. */
  setRolling(level: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    if (!this.rollSrc) {
      this.rollSrc = this.ctx.createBufferSource();
      this.rollSrc.buffer = this.noiseBuf;
      this.rollSrc.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      this.rollGain = this.ctx.createGain();
      this.rollGain.gain.value = 0;
      this.rollSrc.connect(lp).connect(this.rollGain).connect(this.master);
      this.rollSrc.start();
    }
    this.rollGain!.gain.setTargetAtTime(0.14 * level, this.ctx.currentTime, 0.05);
  }

  stopRolling() {
    if (this.rollGain && this.ctx) {
      this.rollGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  /** Chip placed or removed. */
  chip() {
    if (!this.ctx) return;
    this.noiseBurst(3100, 3, 0.03, 0.35);
    this.noiseBurst(2500, 3, 0.03, 0.28, 0.035);
  }

  /** Win chime — note count and level scale with the payout. */
  win(amount: number) {
    if (!this.ctx || !this.master || amount <= 0) return;
    const notes = amount >= 150 ? 5 : amount >= 60 ? 4 : amount >= 15 ? 3 : 2;
    const gain = Math.min(0.6, 0.22 + Math.log10(amount + 1) * 0.13);
    const ratios = [1, 1.25, 1.5, 2, 2.5];
    for (let n = 0; n < notes; n++) {
      const f = 523.25 * ratios[n];
      const when = n * 0.085;
      const t = this.ctx.currentTime + when;
      for (const [mult, g] of [
        [1, gain],
        [2.01, gain * 0.28],
      ] as const) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * mult;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(g, t + 0.015);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.connect(env).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.6);
      }
    }
  }
}
