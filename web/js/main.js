/* ============================================================
   Main — UI state machine.
   landing -> calibration (4 steps) -> review -> flight
   Demo path: synth whistle drives the identical pipeline.
   ============================================================ */

(function () {
  const Y = window.Yondu;
  const $ = (id) => document.getElementById(id);

  const engine = new Y.AudioEngine();
  const arena = new Y.Arena($('space'));
  const sim = new Y.Simulation(arena);
  const ribbon = new Y.Ribbon($('ribbon'));

  let state = 'landing';      // landing | calibrating | review | flight
  let demo = false;
  let synth = null;
  let calib = null;
  let gestures = null;
  let lastT = performance.now() / 1000;

  /* ---------------- overlay helpers ---------------- */

  const cards = ['card-landing', 'card-calib', 'card-review', 'card-error'];
  function showCard(id) {
    cards.forEach(c => { $(c).hidden = c !== id; });
    $('overlay').classList.toggle('hidden', !id);
  }

  function setLamp(lamp, label, cls, text) {
    $(lamp).className = 'lamp' + (cls ? ' ' + cls : '');
    $(label).textContent = text;
  }

  /* ---------------- calibration UI ---------------- */

  const RING_LEN = 326.7;
  function renderCalibStep() {
    const step = calib.step;
    $('calib-step-no').textContent = `CALIBRATION · STEP ${calib.stepIndex + 1}/4`;
    $('calib-title').textContent = step.title;
    $('calib-instruction').textContent = step.instruction;
    $('calib-hint').textContent = step.hint;
    $('btn-calib-redo').hidden = calib.stepIndex === 0;
    // In demo mode the synth mimics whatever the current step asks for.
    if (demo && synth) synth.play(Y.SynthScripts.steps[step.id], { loop: true });
  }

  function startCalibration() {
    calib = new Y.Calibration(engine);
    calib.reset();
    state = 'calibrating';
    renderCalibStep();
    showCard('card-calib');
  }

  function finishCalibration() {
    const sig = calib.signature;
    ribbon.signature = sig;
    gestures = new Y.GestureClassifier(sig);
    $('sig-min').textContent = Math.round(sig.min);
    $('sig-center').textContent = Math.round(sig.center);
    $('sig-max').textContent = Math.round(sig.max);
    setLamp('lamp-sig', 'lamp-sig-label', 'on', 'PRINT OK');
    $('btn-recal').hidden = false;
    $('btn-signature').hidden = false;
    state = 'review';
    showCard('card-review');
    if (demo) synth.stopScript();
  }

  function startFlight() {
    state = 'flight';
    showCard(null);
    sim.setMode('flight');
    if (demo) {
      $('demo-banner').hidden = false;
      synth.play(Y.SynthScripts.flight, { loop: true });
    }
  }

  /* ---------------- audio paths ---------------- */

  async function enableMic() {
    try {
      await engine.initMic();
      if (synth) synth.stopScript();
      demo = false;
      $('demo-banner').hidden = true;
      setLamp('lamp-mic', 'lamp-mic-label', 'on', 'MIC LIVE');
      startCalibration();
    } catch (err) {
      console.warn('mic denied', err);
      $('error-body').textContent =
        'Microphone access was blocked (' + (err.name || 'error') + '). ' +
        'Allow it in your browser’s site settings, or watch the autopilot demo instead.';
      showCard('card-error');
    }
  }

  async function enableDemo() {
    await engine._ensureCtx();
    if (!synth) synth = new Y.SynthWhistle(engine.ctx);
    await engine.initSynth(synth.output);
    demo = true;
    setLamp('lamp-mic', 'lamp-mic-label', 'warm', 'SYNTH');
    startCalibration();
  }

  /* ---------------- signature download ---------------- */

  function downloadSignature() {
    if (!calib || !calib.signature) return;
    const blob = new Blob([JSON.stringify(calib.toConfig(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yondu-whistle-print.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- main loop ---------------- */

  // Analysis runs on the audio clock — one pass per fresh analyser window —
  // so calibration/gestures behave identically at 60 Hz, 180 Hz, or in a
  // throttled hidden tab. Rendering runs at whatever rate the display gives.
  const ANALYSIS_DT = 0.04; // ≈ one 2048-sample window at 48 kHz
  let lastAnalysis = -1;
  const SILENT_FRAME = { freq: 0, clarity: 0, rms: 0, db: -Infinity, voiced: false };
  let frame = SILENT_FRAME;
  let control = null;

  function loop() {
    const t = performance.now() / 1000;
    const dt = Math.min(0.05, t - lastT);
    lastT = t;

    if (synth) synth.tick();

    let fresh = false;
    if (engine.mode !== 'off') {
      const at = engine.ctx.currentTime;
      if (at - lastAnalysis >= ANALYSIS_DT) {
        lastAnalysis = at;
        frame = engine.frame();
        fresh = true;
      }
    } else {
      frame = SILENT_FRAME;
      control = null;
    }

    // HUD readouts
    $('ro-freq').textContent = frame.voiced ? frame.freq.toFixed(0) : '——';
    $('ro-db').textContent = isFinite(frame.db) && frame.db > -90 ? frame.db.toFixed(0) : '——';

    if (fresh) { ribbon.push(frame); ribbon.draw(); }

    if (fresh && state === 'calibrating' && calib) {
      const res = calib.feed(frame);
      $('ring-fg').style.strokeDashoffset = (RING_LEN * (1 - calib.progress)).toFixed(1);
      $('ring-freq').textContent = frame.voiced ? `${frame.freq.toFixed(0)} Hz` : '·';
      if (res.state === 'step-done') renderCalibStep();
      else if (res.state === 'done') finishCalibration();
    }

    if (state === 'flight' && gestures) {
      if (fresh) {
        control = gestures.feed(frame);
        const chip = $('gesture-chip');
        chip.dataset.g = control.gesture;
        const G = {
          silence: ['·', 'SILENCE'],
          hold: ['➤', 'HOLD — THRUST'],
          up: ['⤴', 'PITCH UP — BANK R'],
          down: ['⤵', 'PITCH DOWN — BANK L']
        }[control.gesture];
        $('g-arrow').textContent = G[0];
        $('g-label').textContent = G[1];
      }
    } else {
      control = null;
    }

    const speed = sim.update(dt, t, state === 'flight' ? control : null);
    $('ro-vel').textContent = (speed / 100).toFixed(1);
  }

  /* ---------------- wiring ---------------- */

  $('btn-mic').addEventListener('click', enableMic);
  $('btn-retry-mic').addEventListener('click', enableMic);
  $('btn-demo').addEventListener('click', enableDemo);
  $('btn-demo-2').addEventListener('click', enableDemo);

  $('btn-fly').addEventListener('click', startFlight);
  $('btn-signature').addEventListener('click', downloadSignature);

  $('btn-redo-all').addEventListener('click', startCalibration);
  $('btn-recal').addEventListener('click', () => {
    sim.setMode('idle');
    if (demo && synth) synth.stopScript();
    startCalibration();
  });

  $('btn-calib-redo').addEventListener('click', () => calib && calib.redoStep());
  $('btn-calib-cancel').addEventListener('click', () => {
    if (demo && synth) synth.stopScript();
    engine.stop();
    setLamp('lamp-mic', 'lamp-mic-label', '', 'MIC OFF');
    sim.setMode('idle');
    state = 'landing';
    showCard('card-landing');
  });

  $('btn-exit-demo').addEventListener('click', () => {
    $('demo-banner').hidden = true;
    if (synth) synth.stopScript();
    enableMic();
  });

  // Expose internals for testing / tinkering.
  Y.app = { engine, sim, ribbon, get calib() { return calib; }, get state() { return state; }, get synth() { return synth; }, enableDemo };

  // Render on rAF; if rAF is throttled (hidden/backgrounded tab) a timer
  // keeps the audio pipeline and state machine alive.
  function rafLoop() { loop(); requestAnimationFrame(rafLoop); }
  requestAnimationFrame(rafLoop);
  setInterval(() => { if (performance.now() / 1000 - lastT > 0.06) loop(); }, 33);
})();
