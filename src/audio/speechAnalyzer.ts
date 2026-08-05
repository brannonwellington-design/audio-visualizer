/**
 * SpeechAnalyzer — turns a live microphone stream into a single smooth
 * "speech energy" level (0..1) suitable for driving visuals.
 *
 * The pipeline implements the core principles that make speech visuals
 * feel alive:
 *
 *  1. Band-limited energy: only frequencies in the human-voice range
 *     (~80Hz–3.4kHz) are measured, so room rumble and hiss don't move dots.
 *  2. Noise gate: levels below a floor are treated as true silence,
 *     so the grid is perfectly still between phrases.
 *  3. Adaptive gain (AGC): a slowly-decaying running peak normalizes the
 *     level, so quiet talkers still fill the grid and loud ones don't clip.
 *  4. Asymmetric envelope: fast attack (consonants hit instantly),
 *     slow release (natural decay instead of flicker).
 */

export interface AnalyzerParams {
  /** Envelope rise time constant in ms (lower = snappier onsets) */
  attackMs: number;
  /** Envelope fall time constant in ms (higher = smoother decay) */
  releaseMs: number;
  /** Noise floor, 0..1 — raw energy below this reads as silence */
  gate: number;
  /** Manual sensitivity multiplier applied after auto-gain */
  gain: number;
}

const VOICE_LOW_HZ = 80;
const VOICE_HIGH_HZ = 3400;
/** How long the adaptive peak takes to relax (ms) */
const PEAK_DECAY_MS = 4000;
/** Adaptive peak never drops below this, so noise can't get boosted to full scale */
const PEAK_FLOOR = 0.12;

export class SpeechAnalyzer {
  params: AnalyzerParams = { attackMs: 12, releaseMs: 140, gate: 0.05, gain: 1 };

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private freqData = new Uint8Array(0);
  private envelope = 0;
  private peak = PEAK_FLOOR;
  private lastTime = 0;

  get running(): boolean {
    return this.analyser !== null;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    // We do our own attack/release smoothing; the built-in smoothing would
    // blur transients symmetrically and kill the "snap" of consonants.
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    this.analyser = analyser;
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.envelope = 0;
    this.peak = PEAK_FLOOR;
    this.lastTime = performance.now();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.envelope = 0;
  }

  /** Call once per animation frame. Returns the smoothed speech level, 0..1. */
  getLevel(now: number): number {
    if (!this.analyser || !this.ctx) return 0;
    const dt = Math.min(100, Math.max(0.01, now - this.lastTime));
    this.lastTime = now;

    this.analyser.getByteFrequencyData(this.freqData);

    // RMS energy across the voice band only
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const lo = Math.max(1, Math.floor(VOICE_LOW_HZ / binHz));
    const hi = Math.min(this.freqData.length - 1, Math.ceil(VOICE_HIGH_HZ / binHz));
    let sum = 0;
    for (let i = lo; i <= hi; i++) {
      const v = this.freqData[i] / 255;
      sum += v * v;
    }
    let raw = Math.sqrt(sum / (hi - lo + 1));

    // Noise gate with re-normalization above the floor
    const { gate, gain, attackMs, releaseMs } = this.params;
    raw = raw < gate ? 0 : (raw - gate) / (1 - gate);

    // Adaptive gain: track a slowly-decaying peak
    this.peak = Math.max(PEAK_FLOOR, this.peak * Math.exp(-dt / PEAK_DECAY_MS), raw);
    const normalized = Math.min(1, (raw / this.peak) * gain);

    // Asymmetric envelope follower (fast up, slow down)
    const tau = normalized > this.envelope ? attackMs : releaseMs;
    const coef = 1 - Math.exp(-dt / Math.max(1, tau));
    this.envelope += (normalized - this.envelope) * coef;
    if (this.envelope < 0.001) this.envelope = 0;
    return this.envelope;
  }
}
