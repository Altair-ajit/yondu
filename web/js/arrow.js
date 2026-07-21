/* ============================================================
   Arrow + arena rendering — a yaka arrow with an additive
   crimson plasma trail over a drifting starfield.
   ============================================================ */

(function () {
  const Yondu = window.Yondu = window.Yondu || {};

  const TRAIL_MAX = 140;

  Yondu.Arena = class Arena {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.stars = [];
      this.trail = [];
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._seedStars();
    }

    _seedStars() {
      const count = Math.floor((this.w * this.h) / 5200);
      this.stars = Array.from({ length: count }, () => ({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        z: 0.3 + Math.random() * 0.7,            // depth -> parallax + size
        tw: Math.random() * Math.PI * 2          // twinkle phase
      }));
    }

    pushTrail(x, y, power) {
      this.trail.push({ x, y, power, age: 0 });
      if (this.trail.length > TRAIL_MAX) this.trail.shift();
    }

    /** vel is used to parallax-drift the starfield opposite to motion. */
    draw(arrow, vel, t, dt) {
      const { ctx, w, h } = this;
      ctx.clearRect(0, 0, w, h);

      // --- stars ---
      for (const s of this.stars) {
        s.x -= vel.x * s.z * 0.22 * dt;
        s.y -= vel.y * s.z * 0.22 * dt;
        if (s.x < 0) s.x += w; else if (s.x > w) s.x -= w;
        if (s.y < 0) s.y += h; else if (s.y > h) s.y -= h;
        const flicker = 0.55 + 0.45 * Math.sin(t * 1.7 + s.tw);
        ctx.globalAlpha = 0.28 + 0.5 * s.z * flicker;
        ctx.fillStyle = s.z > 0.82 ? '#cfd8ec' : '#8d9ab5';
        const r = s.z * 1.3;
        ctx.fillRect(s.x, s.y, r, r);
      }
      ctx.globalAlpha = 1;

      // --- trail (additive plasma) ---
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        a.age += dt; // age both endpoints once per frame via the leading one
        const life = 1 - i / this.trail.length;          // older = dimmer
        const k = (i / this.trail.length);               // newer = brighter
        const alpha = 0.05 + 0.5 * k * k * (0.4 + 0.6 * b.power);
        ctx.strokeStyle = `rgba(255, ${Math.floor(60 + 90 * k)}, 50, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + 5 * k * (0.5 + 0.5 * b.power);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      this._drawArrow(arrow.x, arrow.y, arrow.heading, arrow.glow, t);
    }

    _drawArrow(x, y, heading, glow, t) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);

      const pulse = 0.75 + 0.25 * Math.sin(t * 6);
      ctx.shadowColor = `rgba(255, 74, 61, ${(0.55 + 0.45 * glow) * pulse})`;
      ctx.shadowBlur = 14 + 26 * glow;

      // shaft
      ctx.strokeStyle = '#e8d9c8';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(16, 0);
      ctx.stroke();

      // head
      ctx.fillStyle = '#ff4a3d';
      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.lineTo(14, -4.6);
      ctx.lineTo(17, 0);
      ctx.lineTo(14, 4.6);
      ctx.closePath();
      ctx.fill();

      // fletching (the fin)
      ctx.fillStyle = '#b3241c';
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(-30, -6);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-30, 6);
      ctx.closePath();
      ctx.fill();

      // hot core when powered
      if (glow > 0.05) {
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 180, 130, ${0.5 * glow})`;
        ctx.beginPath();
        ctx.arc(-24, 0, 2.6 + 2.4 * glow * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.restore();
    }
  };
})();
