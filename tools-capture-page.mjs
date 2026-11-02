// Full-page capture by scroll-stitching.
// A single captureBeyondViewport shot renders scroll-pinned sections mid-nothing (blank
// gaps). Walking the page viewport by viewport and stacking the frames reproduces what a
// visitor actually sees.
// ponytail: frames are stacked by handing them back to Chrome as one tall HTML page, so
// there is no image library here. Reach for sharp only if stitching needs real compositing.
//
// Needs: chrome --headless=new --remote-debugging-port=9222
// Usage: node tools-capture-page.mjs <url> assets/<name>-page.webp
import { writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

const [, , url, out] = process.argv;
const W = 1440, H = 900;
const log = (...a) => console.error('·', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Every wait is capped: a page with a never-settling request must not hang the capture.
const cap = (p, ms, what) => Promise.race([p, sleep(ms).then(() => log('timed out:', what))]);

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
  // Every call is time-bounded: /json/new starts navigating before we attach, so an
  // evaluate can land on the outgoing document and lose its execution context — and its
  // reply — when the navigation commits. A dropped reply must not wedge the capture.
  const send = (method, params = {}, ms = 10000) =>
    Promise.race([
      new Promise(r => { waiters.set(++id, r); ws.send(JSON.stringify({ id, method, params })); }),
      sleep(ms).then(() => undefined),
    ]);
  const evalIn = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r?.result?.value;
  };
  const close = () => { try { ws.close(); } catch {} fetch(`http://127.0.0.1:9222/json/close/${t.id}`).catch(() => {}); };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  return { send, evalIn, close };
}

// ---- 1. load the page for real ----
log('opening', url);
const page = await open(url);

// Poll rather than await a single promise: polling survives the navigation commit, and
// the answer is authoritative — the real document says when it is done.
const until = async (expr, ms, what) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; ) {
    if (await page.evalIn(expr) === true) return true;
    await sleep(400);
  }
  log('gave up waiting for', what);
  return false;
};
await until(`document.readyState === 'complete' && location.href !== 'about:blank'`, 45000, 'load');
log('loaded:', await page.evalIn('location.href'));
await until(`document.fonts.status === 'loaded'`, 20000, 'fonts');
log('fonts ready');
// No global image wait here: loading="lazy" images below the fold never start until the
// page is scrolled, so waiting for them up front just burns the timeout. Each frame waits
// for its own images instead, once the scroll has triggered them.
// Zero-area images (a collapsed container, a hidden drawer) never load and never will —
// waiting on them stalls every frame. Judge only images that actually occupy the frame,
// and judge them by naturalWidth: a still-streaming image reports complete === false long
// after it has pixels to show.
const imagesInView = `[...document.images]
  .filter(i => { const b = i.getBoundingClientRect();
                 return b.width > 1 && b.height > 1 && b.bottom > -200 && b.top < innerHeight + 200; })
  .every(i => i.naturalWidth > 0)`;
await sleep(2500);

// ---- 2. walk it, one viewport at a time ----
const height = await page.evalIn(`Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)`);
log('scroll height', height);
// Offsets to shoot. The last one is clamped so the final frame ends exactly at the page
// bottom instead of overshooting into repeated content.
const offsets = [];
for (let y = 0; y < height; y += H) offsets.push(Math.min(y, Math.max(0, height - H)));
const stops = [...new Set(offsets)];

const frames = [];
for (const [n, y] of stops.entries()) {
  await page.evalIn(`scrollTo({top:${y}, behavior:'instant'}); 1`);
  await sleep(600);                       // let scroll-driven sections settle at this offset
  await until(imagesInView, 15000, `images at ${y}`);
  await sleep(300);                       // decode after load
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  frames.push({ y, data });
  log('frame', n + 1, 'at', y);
  // position:fixed chrome (nav, cart bar) rides along on every frame and would stripe the
  // stitched image. Keep it on the first frame only. Two things are deliberately spared:
  // position:sticky, which is how pinned scroll sections are built, and tall fixed blocks
  // like a reveal-footer that the page scrolls over — those belong in the capture.
  // ponytail: height is the whole test. If a site ever grows a tall fixed sidebar it will
  //           stripe; switch to "rect stays put across two scrolls" if that shows up.
  if (n === 0) {
    const hidden = await page.evalIn(`(() => {
      const out = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (getComputedStyle(el).position !== 'fixed') continue;
        if (el.getBoundingClientRect().height >= 300) continue;
        el.style.setProperty('visibility', 'hidden', 'important');
        out.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
      }
      return out.join(', ');
    })()`);
    log('hid for later frames:', hidden || '(nothing)');
  }
}
page.close();

// ---- 3. stack the frames and shoot them once ----
const total = Math.max(height, H);
const imgs = frames
  .map(f => `<img src="data:image/png;base64,${f.data}" style="position:absolute;top:${f.y}px;left:0;width:${W}px">`)
  .join('');
const stackFile = out + '.stack.html';
writeFileSync(stackFile, `<!DOCTYPE html><html><body style="margin:0;background:#fff;width:${W}px;height:${total}px;position:relative">${imgs}</body></html>`);

const stack = await open(pathToFileURL(stackFile).href);
await sleep(2500);
const shot = await stack.send('Page.captureScreenshot', {
  format: 'webp', quality: 80, captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: W, height: total, scale: 1 },
});
writeFileSync(out, Buffer.from(shot.data, 'base64'));
stack.close();
console.log(`${out}  ${frames.length} frames  ${W}x${total}`);
process.exit(0);
