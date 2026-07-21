/* ============================================================
   SynthWhistle — an oscillator that "whistles" through the same
   analyser as the mic, powering the autopilot demo and letting
   the whole pipeline be exercised without a microphone.
   ============================================================ */

(function () {
  const Yondu = window.Yondu = window.Yondu || {};

  Yondu.SynthWhistle = class SynthWhistle {
    constructor(ctx) {
      this.ctx = ctx;
      this.osc = ctx.createOscillator();
      this.osc.type = 'sine';
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      // Slight vibrato so it reads as a whistle, not a test tone.
      this.vibrato = ctx.createOscillator();
      this.vibrato.frequency.value = 5.2;
      this.vibratoGain = ctx.createGain();
      this.vibratoGain.gain.value = 6; // ±6 Hz wobble
      this.vibrato.connect(this.vibratoGain).connect(this.osc.frequency);
      this.osc.connect(this.gain);
      this.osc.start();
      this.vibrato.start();
      this._script = null;
    }

    /** Node to plug into AudioEngine.initSynth(). (Not routed to speakers.) */
    get output() { return this.gain; }

    whistleAt(freq, level = 0.25, glideSec = 0.05) {
      const t = this.ctx.currentTime;
      this.osc.frequency.cancelScheduledValues(t);
      this.osc.frequency.setTargetAtTime(freq, t, glideSec);
      this.gain.gain.setTargetAtTime(level, t, 0.03);
    }

    silence() {
      this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }

    /**
     * Queue a script: array of { f, level, dur } segments (f=0 -> silence).
     * Segments are advanced by tick() against the AudioContext clock — never
     * setTimeout, which browsers throttle hard in hidden tabs.
     * onDone fires after the last segment; loop=true repeats forever.
     */
    play(script, { loop = false, onDone = null } = {}) {
      this._script = script;
      this._loop = loop;
      this._onDone = onDone;
      this._segIndex = -1;
      this._segEnd = this.ctx.currentTime; // advance on next tick
    }

    /** Call every frame (from the main loop). */
    tick() {
      if (!this._script) return;
      const t = this.ctx.currentTime;
      if (t < this._segEnd) return;
      this._segIndex++;
      if (this._segIndex >= this._script.length) {
        if (this._loop) this._segIndex = 0;
        else {
          const cb = this._onDone;
          this._script = null;
          this.silence();
          if (cb) cb();
          return;
        }
      }
      const seg = this._script[this._segIndex];
      if (seg.f > 0) this.whistleAt(seg.f, seg.level ?? 0.25, seg.glide ?? 0.08);
      else this.silence();
      this._segEnd = t + seg.dur;
    }

    stopScript() {
      this._script = null;
      this.silence();
    }

    dispose() {
      this.stopScript();
      try { this.osc.stop(); this.vibrato.stop(); } catch (_) {}
      try { this.gain.disconnect(); } catch (_) {}
      this._script = null;
    }
  };

  /* ---- canned scripts (center 1400 Hz persona) ---- */
  const C = 1400, HI = 2200, LO = 900;

  Yondu.SynthScripts = {
    center: C,
    /**
     * Per-calibration-step loops. The demo doesn't run on a fixed timeline —
     * main.js switches to the matching loop whenever the step advances, so
     * the synth always plays what the current step asks for.
     */
    steps: {
      silence: [{ f: 0, dur: 1.0 }],
      steady: [{ f: C, dur: 1.0, level: 0.28 }],
      up: [
        { f: C, dur: 0.4, level: 0.28 },
        { f: C + 300, dur: 0.4 }, { f: HI - 300, dur: 0.6 }, { f: HI, dur: 1.0, level: 0.3 }
      ],
      down: [
        { f: C, dur: 0.4, level: 0.28 },
        { f: C - 200, dur: 0.4 }, { f: LO + 150, dur: 0.6 }, { f: LO, dur: 1.0, level: 0.3 }
      ]
    },
    /** Free flight: cruise, bank right, cruise, bank left, coast... */
    flight: [
      { f: C, dur: 2.2, level: 0.3 },
      { f: HI - 300, dur: 1.4, level: 0.34 },
      { f: C, dur: 1.6, level: 0.26 },
      { f: LO + 150, dur: 1.5, level: 0.34 },
      { f: C, dur: 1.2, level: 0.3 },
      { f: 0, dur: 1.6 },
      { f: C + 100, dur: 1.8, level: 0.34 },
      { f: HI - 100, dur: 2.2, level: 0.3 },
      { f: 0, dur: 1.0 },
      { f: LO + 50, dur: 2.0, level: 0.34 },
      { f: C, dur: 1.5, level: 0.28 },
      { f: 0, dur: 1.4 }
    ]
  };
})();
