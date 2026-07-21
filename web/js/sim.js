/* ============================================================
   Simulation — arrow flight physics driven by gestures, plus the
   HUD instruments (readouts, gesture chip, pitch ribbon).
   Control law = the report's continuous-control concept:
     hold   -> thrust along heading (louder = faster)
     up     -> thrust + bank right (clockwise)
     down   -> thrust + bank left
     silence-> coast with drag; idle hover wander
   ============================================================ */

(function () {
  const Yondu = window.Yondu = window.Yondu || {};

  const MAX_TURN = 2.6;       // rad/s at |p| = 1
  const THRUST = 400;         // px/s^2 at full power
  const DRAG_POWERED = 1.1;   // exponential drag rate (1/s) while whistling
  const DRAG_COAST = 2.4;     // much stronger when silent — settles quickly
  const BOUNCE = 0.72;        // velocity kept when bouncing off an edge
  const WALL = 34;            // soft wall inset (≈ arrow half-length)
  const MAX_SPEED = 420;

  Yondu.Simulation = class Simulation {
    constructor(arena) {
      this.arena = arena;
      this.arrow = { x: arena.w / 2, y: arena.h / 2, heading: -Math.PI / 4, glow: 0 };
      this.vel = { x: 0, y: 0 };
      this.mode = 'idle';   // 'idle' (attract wander) | 'flight'
      this._wanderT = 0;
    }

    setMode(m) { this.mode = m; }

    /** control = { gesture, p, power } (ignored in idle mode). */
    update(dt, t, control) {
      const a = this.arrow, v = this.vel;

      const W = this.arena.w, H = this.arena.h;

      if (this.mode === 'idle') {
        // Attract mode: the arrow drifts in lazy hunting curves.
        this._wanderT += dt;
        const turn = Math.sin(this._wanderT * 0.45) * 0.9 + Math.sin(this._wanderT * 0.13) * 0.5;
        a.heading += turn * dt;
        // Steer back toward the middle when the wander nears an edge.
        const margin = 90;
        if (a.x < margin || a.x > W - margin || a.y < margin || a.y > H - margin) {
          const target = Math.atan2(H / 2 - a.y, W / 2 - a.x);
          let d = target - a.heading;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          a.heading += d * Math.min(1, dt * 2);
        }
        const sp = 60 + 25 * Math.sin(this._wanderT * 0.3);
        v.x = Math.cos(a.heading) * sp;
        v.y = Math.sin(a.heading) * sp;
        a.glow = 0.35 + 0.15 * Math.sin(this._wanderT * 1.2);
      } else if (control) {
        const { gesture, p, power } = control;
        let dragRate = DRAG_COAST;
        if (gesture !== 'silence') {
          // Bank rate scales with how far the pitch sits from center.
          if (gesture === 'up') a.heading += MAX_TURN * Math.max(0, p) * dt;
          if (gesture === 'down') a.heading -= MAX_TURN * Math.max(0, -p) * dt;
          v.x += Math.cos(a.heading) * THRUST * power * dt;
          v.y += Math.sin(a.heading) * THRUST * power * dt;
          a.glow += (Math.min(1, 0.35 + power) - a.glow) * Math.min(1, dt * 8);
          dragRate = DRAG_POWERED;
        } else {
          a.glow += (0.08 - a.glow) * Math.min(1, dt * 3);
          // Hover bob when nearly stopped.
          if (Math.hypot(v.x, v.y) < 15) a.y += Math.sin(t * 2.2) * 6 * dt;
        }
        // Drag always applies — stronger when coasting, so the arrow
        // answers the whistle instead of skating away with momentum.
        const keep = Math.exp(-dragRate * dt);
        v.x *= keep;
        v.y *= keep;
      }

      // clamp speed, integrate, bounce off edges (no wrap teleport)
      const sp = Math.hypot(v.x, v.y);
      if (sp > MAX_SPEED) { v.x *= MAX_SPEED / sp; v.y *= MAX_SPEED / sp; }
      a.x += v.x * dt;
      a.y += v.y * dt;
      if (a.x < WALL) { a.x = WALL; if (v.x < 0) v.x = -v.x * BOUNCE; }
      else if (a.x > W - WALL) { a.x = W - WALL; if (v.x > 0) v.x = -v.x * BOUNCE; }
      if (a.y < WALL) { a.y = WALL; if (v.y < 0) v.y = -v.y * BOUNCE; }
      else if (a.y > H - WALL) { a.y = H - WALL; if (v.y > 0) v.y = -v.y * BOUNCE; }

      // When coasting fast, align heading with velocity for a thrown look.
      if ((this.mode !== 'idle') && (!control || control.gesture === 'silence') && sp > 40) {
        const target = Math.atan2(v.y, v.x);
        let d = target - a.heading;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        a.heading += d * Math.min(1, dt * 2.5);
      }

      this.arena.pushTrail(a.x, a.y, a.glow);
      this.arena.draw(a, v, t, dt);
      return sp;
    }
  };

  /* ---------------- Pitch ribbon ---------------- */

  Yondu.Ribbon = class Ribbon {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.history = [];      // { freq, voiced, power }
      this.signature = null;
      this.fLo = 350; this.fHi = 4500;
      this._sync();
      window.addEventListener('resize', () => this._sync());
    }

    _sync() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = this.canvas.getBoundingClientRect();
      this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.max = Math.floor(this.w / 3);
    }

    _y(freq) {
      const lo = Math.log(this.fLo), hi = Math.log(this.fHi);
      const k = (Math.log(Math.max(freq, this.fLo)) - lo) / (hi - lo);
      return this.h - 8 - k * (this.h - 20);
    }

    push(frame) {
      this.history.push({ freq: frame.freq, voiced: frame.voiced, power: frame.voiced ? 1 : 0 });
      if (this.history.length > this.max) this.history.shift();
    }

    draw() {
      const { ctx, w, h } = this;
      ctx.clearRect(0, 0, w, h);

      // Calibrated lane: min/max band + center line.
      if (this.signature) {
        const yMax = this._y(this.signature.max), yMin = this._y(this.signature.min);
        ctx.fillStyle = 'rgba(255, 74, 61, 0.07)';
        ctx.fillRect(0, yMax, w, yMin - yMax);
        ctx.strokeStyle = 'rgba(255, 180, 84, 0.55)';
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        const yC = this._y(this.signature.center);
        ctx.moveTo(0, yC); ctx.lineTo(w, yC);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 74, 61, 0.3)';
        ctx.strokeRect(-2, yMax, w + 4, yMin - yMax);
      }

      // Trace, newest at the right edge.
      const n = this.history.length;
      for (let i = 0; i < n; i++) {
        const f = this.history[i];
        if (!f.voiced) continue;
        const x = w - (n - i) * 3;
        if (x < 0) continue;
        const y = this._y(f.freq);
        const k = i / n;
        ctx.fillStyle = `rgba(255, ${Math.floor(90 + 90 * k)}, 61, ${0.25 + 0.65 * k})`;
        ctx.fillRect(x, y - 1.5, 2.2, 3);
      }
    }
  };
})();
