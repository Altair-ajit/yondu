import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---- CONFIG (fill these in) ----
const ID = 'yondu';
const URL = process.env.PREVIEW_URL || 'http://localhost:8123/web/';
const THEME = 'dark';                 // 'light' | 'dark'
const FLIGHT_SECONDS = 3.4;           // flight tail after calibration
const LEAD_SECONDS = 0.6;             // landing-card beat kept before the click
const marks = { page: 0, click: 0 };  // wall-clock marks for the trim
const steps = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  // Start the autopilot demo (synth whistle) — a real click so the
  // AudioContext gets its user-gesture activation. The final clip starts
  // just before this click so the calibration story is included.
  marks.click = Date.now();
  await page.getByRole('button', { name: /autopilot demo/i }).click();
  // Calibration (~8 s): noise floor -> steady -> sweep up -> sweep down.
  await page.waitForFunction(() => window.Yondu?.app?.state === 'review', null, { timeout: 45000 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /fly the arrow/i }).click();
  await page.waitForFunction(() => window.Yondu?.app?.state === 'flight', null, { timeout: 5000 });
  await page.waitForTimeout(FLIGHT_SECONDS * 1000);
};
// --------------------------------

const OUT = 'previews', TMP = join(OUT, '.tmp');
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: THEME,
  deviceScaleFactor: 2,
  recordVideo: { dir: TMP, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
marks.page = Date.now();              // video timeline starts ~here
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(500);
// Without ffmpeg the clip keeps its lead-in, so the poster is the first frame (landing).
if (!hasFfmpeg) await page.screenshot({ path: join(OUT, `${ID}-poster.jpg`), type: 'jpeg', quality: 80 });
await steps(page);
const vid = await page.video().path();
await context.close();                // flush webm
await browser.close();

const webm = join(OUT, `${ID}.webm`);
const poster = join(OUT, `${ID}-poster.jpg`);

if (hasFfmpeg) {
  // Cut the page-load dead time: start the clip a beat before the demo
  // click, keeping calibration + flight. Poster = final clip's first frame.
  const cutStart = Math.max(0, (marks.click - marks.page) / 1000 - LEAD_SECONDS);
  execFileSync('ffmpeg', ['-y', '-ss', cutStart.toFixed(2), '-i', vid, '-an',
    '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', webm], { stdio: 'inherit' });
  console.log(`✓ ${webm}`);
  const mp4 = join(OUT, `${ID}.mp4`);
  execFileSync('ffmpeg', ['-y', '-i', webm, '-an', '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', mp4],
    { stdio: 'inherit' });
  console.log(`✓ ${mp4} (${(statSync(mp4).size / 1e6).toFixed(2)} MB)`);
  execFileSync('ffmpeg', ['-y', '-i', webm, '-vframes', '1', '-q:v', '4', poster], { stdio: 'inherit' });
  console.log(`✓ ${poster}`);
} else {
  renameSync(vid, webm);
  console.log(`✓ ${webm} (untrimmed — includes calibration lead-in)`);
  console.log('⚠ ffmpeg not found — produced webm + poster only (no mp4).');
}
rmSync(TMP, { recursive: true, force: true });
