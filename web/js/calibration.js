/* ============================================================
   Calibration — builds a personal "whistle print":
     1. silence      -> room noise floor (sets the RMS gate)
     2. steady tone  -> center frequency
     3. sweep up     -> top of range
     4. sweep down   -> bottom of range
   Produces { floor, center, min, max } and can round-trip it as a
   hardware-style config.json.
   ============================================================ */

(function () {
  const Yondu = window.Yondu = window.Yondu || {};

  const STEPS = [
    {
      id: 'silence', title: 'Hold still',
      instruction: 'Measuring the room’s noise floor. Stay quiet for a moment…',
      hint: 'This sets how loud a whistle must be to count.',
      needFrames: 40, voiced: false
    },
    {
      id: 'steady', title: 'Whistle one note',
      instruction: 'Whistle a single comfortable note and hold it steady.',
      hint: 'Any note works — this becomes your center.',
      needFrames: 45, voiced: true
    },
    {
      id: 'up', title: 'Slide up',
      instruction: 'Whistle from your comfortable note up to as high as you can.',
      hint: 'Sweep up slowly, like a rising siren.',
      needFrames: 45, voiced: true
    },
    {
      id: 'down', title: 'Slide down',
      instruction: 'Now whistle from your note down to as low as you can.',
      hint: 'Sweep down slowly. Almost there.',
      needFrames: 45, voiced: true
    }
  ];

  const percentile = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };

  Yondu.Calibration = class Calibration {
    constructor(engine) {
      this.engine = engine;
      this.reset();
    }

    reset() {
      this.stepIndex = 0;
      this.samples = {};       // stepId -> number[]
      this.signature = null;
      this.engine.gateDb = -55; // provisional gate until the floor is measured
    }

    get step() { return STEPS[this.stepIndex]; }
    get progress() {
      const got = (this.samples[this.step.id] || []).length;
      return Math.min(1, got / this.step.needFrames);
    }

    redoStep() { this.samples[this.step.id] = []; }

    /**
     * Feed one analysis frame. Returns:
     *   { state: 'collecting'|'step-done'|'done', progress }
     * After 'done', this.signature is populated (or null + this.error set).
     */
    feed(frame) {
      const step = this.step;
      const bucket = this.samples[step.id] || (this.samples[step.id] = []);

      if (step.voiced) {
        if (frame.voiced) bucket.push(frame.freq);
      } else {
        bucket.push(frame.db);
      }

      if (bucket.length < step.needFrames) return { state: 'collecting', progress: this.progress };

      // Step complete — apply its result.
      if (step.id === 'silence') {
        const floorDb = percentile(bucket, 0.95);
        // Whistles must clear the room by a healthy margin.
        this.engine.gateDb = Math.max(-60, Math.min(-18, floorDb + 12));
      }

      if (this.stepIndex < STEPS.length - 1) {
        this.stepIndex++;
        return { state: 'step-done', progress: 0 };
      }

      this._finish();
      return { state: 'done', progress: 1 };
    }

    _finish() {
      const center = percentile(this.samples.steady, 0.5);
      const hi = percentile(this.samples.up, 0.92);
      const lo = percentile(this.samples.down, 0.08);
      // Guard rails: need a real spread on both sides of center (≥3 semitones).
      const SEMI = Math.pow(2, 3 / 12);
      const max = Math.max(hi, center * SEMI);
      const min = Math.min(lo, center / SEMI);
      this.signature = {
        floor: this.engine.gateDb,
        center: Math.round(center * 10) / 10,
        min: Math.round(min * 10) / 10,
        max: Math.round(max * 10) / 10
      };
    }

    /** Export in the shape of the rover's config.json (plus sim extras). */
    toConfig() {
      const s = this.signature;
      const band = (f) => Math.max(15, Math.round(f * 0.04)); // ±4% ≈ ±0.7 semitone
      return {
        config_name: 'web_whistle_print',
        Global_Sensitivity: 10.0,
        Global_Amplitude: Math.round(s.floor + 60),
        Peaks: {
          Hold:      { frequency: s.center, sensitivity: band(s.center), output_code: 'A' },
          PitchUp:   { frequency: s.max,    sensitivity: band(s.max),    output_code: 'C' },
          PitchDown: { frequency: s.min,    sensitivity: band(s.min),    output_code: 'D' }
        },
        sim: { ...s, calibrated_at: new Date().toISOString() }
      };
    }

    static fromConfig(json) {
      const s = json && json.sim;
      if (!s || !(s.min < s.center && s.center < s.max)) return null;
      return { floor: s.floor ?? -45, center: s.center, min: s.min, max: s.max };
    }
  };

  Yondu.CALIBRATION_STEPS = STEPS;
})();
