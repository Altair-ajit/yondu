/* ============================================================
   AudioEngine — microphone capture + whistle pitch detection
   Mirrors the rover's acquisition/processing stages in-browser:
   time-domain frames -> normalized autocorrelation (MPM-style)
   -> { freq, clarity, rms, db } at ~60 Hz.
   ============================================================ */

const Yondu = window.Yondu = window.Yondu || {};

Yondu.AudioEngine = class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;       // mic node or synth output
    this.stream = null;       // MediaStream when using the mic
    this.buf = null;
    this.mode = 'off';        // 'off' | 'mic' | 'synth'

    // Whistle band. Human whistles live ~500–3000 Hz; leave headroom.
    this.fMin = 350;
    this.fMax = 4500;
    this.clarityMin = 0.80;   // autocorrelation quality gate
    this.gateDb = -55;        // RMS gate; calibration raises it above the room floor
  }

  async initMic() {
    await this._ensureCtx();
    // Disable browser DSP — it eats sustained pure tones like whistles.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    this._connect(this.ctx.createMediaStreamSource(this.stream));
    this.mode = 'mic';
  }

  /** Route an arbitrary node (the synth whistle) into the same analyser. */
  async initSynth(node) {
    await this._ensureCtx();
    this._stopMic();
    this._connect(node);
    this.mode = 'synth';
  }

  async _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.buf = new Float32Array(this.analyser.fftSize);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  _connect(node) {
    if (this.source) { try { this.source.disconnect(this.analyser); } catch (_) {} }
    this.source = node;
    node.connect(this.analyser);
  }

  _stopMic() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  }

  stop() {
    this._stopMic();
    if (this.source) { try { this.source.disconnect(); } catch (_) {} this.source = null; }
    this.mode = 'off';
  }

  /** Analyze the current window. Returns { freq, clarity, rms, db, voiced }. */
  frame() {
    if (!this.analyser) return { freq: 0, clarity: 0, rms: 0, db: -Infinity, voiced: false };
    this.analyser.getFloatTimeDomainData(this.buf);

    const buf = this.buf, n = buf.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / n);
    const db = 20 * Math.log10(Math.max(rms, 1e-8));

    if (db < this.gateDb) return { freq: 0, clarity: 0, rms, db, voiced: false };

    const { freq, clarity } = this._detectPitch(buf, this.ctx.sampleRate);
    const voiced = freq > 0 && clarity >= this.clarityMin;
    return { freq: voiced ? freq : 0, clarity, rms, db, voiced };
  }

  /**
   * McLeod-style pitch detection: normalized square-difference function over
   * the whistle lag range, first strong local maximum, parabolic refinement.
   * Whistles are near-pure sinusoids, so this is rock stable.
   */
  _detectPitch(buf, sampleRate) {
    const n = buf.length;
    const minLag = Math.max(2, Math.floor(sampleRate / this.fMax));
    const maxLag = Math.min(n - 2, Math.ceil(sampleRate / this.fMin));
    const nsdf = new Float32Array(maxLag + 1);

    for (let lag = minLag; lag <= maxLag; lag++) {
      let ac = 0, m = 0;
      for (let i = 0, j = lag; j < n; i++, j++) {
        ac += buf[i] * buf[j];
        m += buf[i] * buf[i] + buf[j] * buf[j];
      }
      nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
    }

    // Collect local maxima; global max sets the acceptance bar.
    let globalMax = 0;
    for (let lag = minLag; lag <= maxLag; lag++) if (nsdf[lag] > globalMax) globalMax = nsdf[lag];
    if (globalMax < this.clarityMin) return { freq: 0, clarity: globalMax };

    const bar = 0.9 * globalMax;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (nsdf[lag] >= bar && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
        // Parabolic interpolation around the peak for sub-bin precision.
        const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
        const denom = a - 2 * b + c;
        const shift = denom !== 0 ? 0.5 * (a - c) / denom : 0;
        const period = lag + Math.max(-1, Math.min(1, shift));
        return { freq: sampleRate / period, clarity: b };
      }
    }
    return { freq: 0, clarity: globalMax };
  }
};
