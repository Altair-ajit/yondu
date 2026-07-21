/* ============================================================
   GestureClassifier — turns pitch frames + a whistle print into
   control gestures, exactly the report's "continuous control
   mode": hold = thrust, pitch up/down = bank, silence = coast.
   ============================================================ */

(function () {
  const Yondu = window.Yondu = window.Yondu || {};

  const DEAD_ZONE = 0.22;   // |p| below this = HOLD
  const HYSTERESIS = 0.06;  // sticky boundary so the gesture doesn't flicker
  const SMOOTH_N = 5;       // median window (frames)

  Yondu.GestureClassifier = class GestureClassifier {
    constructor(signature) {
      this.sig = signature;   // { floor, center, min, max }
      this.recent = [];       // recent p values
      this.gesture = 'silence';
      this.p = 0;             // smoothed position in [-1, 1]
      this.power = 0;         // 0..1 loudness above the gate
      this.silentFrames = 99;
    }

    /**
     * p maps log-frequency into the calibrated range:
     *   center -> 0, max -> +1, min -> -1 (clamped).
     */
    _position(freq) {
      const { center, min, max } = this.sig;
      if (freq >= center) {
        const span = Math.log(max / center) || 1e-6;
        return Math.min(1, Math.log(freq / center) / span);
      }
      const span = Math.log(center / min) || 1e-6;
      return Math.max(-1, -Math.log(center / freq) / span);
    }

    feed(frame) {
      if (frame.voiced) {
        this.silentFrames = 0;
        const p = this._position(frame.freq);
        this.recent.push(p);
        if (this.recent.length > SMOOTH_N) this.recent.shift();
        const sorted = [...this.recent].sort((a, b) => a - b);
        this.p = sorted[Math.floor(sorted.length / 2)];

        // Loudness above the gate -> thrust power (roughly 0..1 over 30 dB).
        this.power = Math.max(0.15, Math.min(1, (frame.db - this.sig.floor) / 30));

        // Hysteretic three-way classification.
        const enter = DEAD_ZONE + HYSTERESIS, exit = DEAD_ZONE - HYSTERESIS;
        if (this.gesture === 'up') this.gesture = this.p > exit ? 'up' : 'hold';
        else if (this.gesture === 'down') this.gesture = this.p < -exit ? 'down' : 'hold';
        else this.gesture = this.p > enter ? 'up' : this.p < -enter ? 'down' : 'hold';
      } else {
        // A few unvoiced frames are just breath gaps; then it's real silence.
        if (++this.silentFrames > 8) {
          this.gesture = 'silence';
          this.recent.length = 0;
          this.power = 0;
        }
      }
      return { gesture: this.gesture, p: this.p, power: this.power };
    }
  };
})();
