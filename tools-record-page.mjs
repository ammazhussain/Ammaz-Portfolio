// Record a site scrolling, as the video the portfolio cards play on hover.
//
// The scroll is driven frame by frame rather than recorded off a screen: every frame is a
// known scroll offset, so the motion is even by construction — no wheel jitter, no variable
// speed, nothing to stabilise afterwards. It also fixes what the static strips could not,
// because the page is genuinely at each scroll position: pinned sections and scroll-driven
// reveals play the way a visitor sees them.
//
// Needs: chrome --headless=new --remote-debugging-port=9222, and ffmpeg
// Usage: node tools-record-page.mjs <url> assets/<name>.mp4 [--seconds=14] [--fps=30] [--top=<px>]
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

const FFMPEG = process.env.FFMPEG ||
  'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe';

const [, , url, out, ...rest] = process.argv;
const arg = (name, dflt) => {
  const a = rest.find(x => x.startsWith(`--${name}`));
  const v = a ? parseFloat(a.split('=')[1] ?? '') : NaN;
  return Number.isFinite(v) ? v : dflt;
};
const W = 1440, H = 900;
const SECONDS = arg('seconds', 14);
const FPS = arg('fps', 30);
const TOP = arg('top', 0);                 // optional: stop the scroll at this offset
const OUT_W = arg('width', 880);           // encoded width; cards are ~414 CSS px, so this is 2x
const HOLD = Math.round(FPS * 0.6);        // still frames at each end, so it doesn't start mid-stride

const log = (...a) => console.error('·', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(target) {
  const t = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(target)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0;
  const waiters = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); }
  };
  const send = (method, params = {}, ms = 15000) => Promise.race([
    new Promise(r => { waiters.set(++id, r); ws.send(JSON.stringify({ id, method, params })); }),
    sleep(ms).then(() => undefined),
  ]);
  const evalIn = async expr =>
    (await send('Runtime.evaluate', { expression: expr, returnByValue: true }))?.result?.value;
  const close = () => { try { ws.close(); } catch {} fetch(`http://127.0.0.1:9222/json/close/${t.id}`).catch(() => {}); };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  return { send, evalIn, close };
}

const page = await open(url);
const until = async (expr, ms, what) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; ) {
    if (await page.evalIn(expr) === true) return true;
    await sleep(400);
  }
  log('gave up waiting for', what);
  return false;
};
const imagesInView = `[...document.images]
  .filter(i => { const b = i.getBoundingClientRect();
                 return b.width > 1 && b.height > 1 && b.bottom > -200 && b.top < innerHeight + 200; })
  .every(i => i.naturalWidth > 0)`;

await until(`document.readyState === 'complete' && location.href !== 'about:blank'`, 45000, 'load');
await until(`document.fonts.status === 'loaded'`, 20000, 'fonts');
log('loaded');

// Warm pass: scrolling is what starts loading="lazy" images, and an image that pops in
// mid-record is exactly the kind of jolt this is meant to avoid.
const height = await page.evalIn(`Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)`);
for (let y = 0; y < height; y += H) {
  await page.evalIn(`scrollTo({top:${y}, behavior:'instant'}); 1`);
  await sleep(350);
  await until(imagesInView, 12000, `images at ${y}`);
}
await page.evalIn(`scrollTo({top:0, behavior:'instant'}); 1`);
await sleep(1500);

// Infinite animations (a marquee, a spinning seal) advance on wall-clock time, and frames
// are captured far slower than real time — left running they would stutter at random. Hold
// them still; against a moving scroll a frozen marquee reads as intentional.
const paused = await page.evalIn(`(() => {
  let n = 0;
  for (const a of document.getAnimations()) {
    const d = a.effect?.getTiming?.().iterations;
    if (d === Infinity) { a.pause(); n++; }
  }
  return n;
})()`);
log('paused', paused, 'looping animations');

const travel = Math.max(0, (TOP || height) - H);
const frames = Math.round(SECONDS * FPS);
const dir = out + '.frames';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
log(`recording ${frames} frames over ${travel}px (${(travel / frames).toFixed(1)}px per frame)`);

let written = 0;
const shoot = async () => {
  const f = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 86, captureBeyondViewport: false });
  if (!f?.data) throw new Error('capture returned nothing');
  writeFileSync(`${dir}/${String(written++).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64'));
};

// Ease in and out, so the walk starts and stops rather than snapping into motion.
const smooth = t => t * t * (3 - 2 * t);

for (let i = 0; i < HOLD; i++) await shoot();
for (let i = 0; i < frames; i++) {
  const y = Math.round(travel * smooth(i / (frames - 1)));
  await page.evalIn(`scrollTo({top:${y}, behavior:'instant'}); 1`);
  await sleep(90);                        // let scroll handlers run and the frame paint
  await shoot();
  if (i % 60 === 0) log(`  ${i}/${frames} at ${y}px`);
}
for (let i = 0; i < HOLD; i++) await shoot();
page.close();
log('captured', written, 'frames');

execFileSync(FFMPEG, [
  '-y', '-framerate', String(FPS), '-i', `${dir}/%05d.jpg`,
  '-vf', `scale=${OUT_W}:-2:flags=lanczos`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-an', out,
], { stdio: ['ignore', 'ignore', 'inherit'] });
rmSync(dir, { recursive: true, force: true });
console.log(`${out}  ${written} frames  ${(written / FPS).toFixed(1)}s`);
process.exit(0);
