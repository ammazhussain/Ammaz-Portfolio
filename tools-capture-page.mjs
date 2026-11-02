// Capture a site as the tall strip the portfolio cards walk on hover.
//
// Scroll-animated sites fight back. Three approaches, in the order they were tried:
//   1. One captureBeyondViewport shot — pinned sections render at scroll progress 0, which
//      is usually empty, so the page comes out with blank gaps where its best work is.
//   2. Stitch viewport frames down the page — no gaps, but anything that moves with scroll
//      (marquee, parallax, pinned panel) sits elsewhere in each frame, so the joins tear
//      through it, and pinned sections show up twice.
//   3. What this does: wake the page up by scrolling through it once (that is what starts
//      lazy images and fires reveal observers), settle it into one coherent state, and take
//      a single shot. Clean, at the cost of pinned sections — see --pin and --top.
//
// Needs: chrome --headless=new --remote-debugging-port=9222
// Usage: node tools-capture-page.mjs <url> assets/<name>-page.webp [--top=<px>] [--pin=<0..1>]
//
// In use for this portfolio:
//   LumiLife  --top=2600   hero, the idea, the collection
//   Optimus   --top=1760   hero, equipment row
//   Maken     not captured this way: its page is one sticky track, so collapsing flattens
//             the whole site to 900px. Its capture predates this script.
import { writeFileSync, unlinkSync } from 'fs';
import { pathToFileURL } from 'url';

const [, , url, out, ...rest] = process.argv;
// --pin=<0..1>: where in a pinned section's scroll track to shoot its panel, as a fraction
// of the track. Omit it and pinned tracks are collapsed away instead — clean, but a section
// whose panel is empty at progress 0 drops out of the capture. There is no right default
// here; it depends on where the section's own animation peaks, so it stays a knob.
// --top=<px>: capture only the first <px> of the page. At the ~29% these strips are shown
// at, the whole page is a blur anyway; the top few screens read as real design.
const topPx = (() => {
  const a = rest.find(x => x.startsWith('--top'));
  const v = a ? parseInt(a.split('=')[1] ?? '', 10) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
})();
const pinAt = (() => {
  const a = rest.find(x => x.startsWith('--pin'));
  if (!a) return null;
  const v = parseFloat(a.split('=')[1] ?? '0.5');
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0.5;
})();
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

// ---- 2. walk the page once, to wake it up ----
// Not for capturing — for side effects. Scrolling is what starts loading="lazy" images and
// fires the IntersectionObserver reveals, and those reveals are one-shot: once tripped they
// stay revealed after we scroll back.
const height0 = await page.evalIn(`Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)`);
log('scroll height', height0);
for (let y = 0; y < height0; y += H) {
  await page.evalIn(`scrollTo({top:${y}, behavior:'instant'}); 1`);
  await sleep(450);
  await until(imagesInView, 15000, `images at ${y}`);
}
await page.evalIn(`scrollTo({top:0, behavior:'instant'}); 1`);
await sleep(1200);

// ---- 3. settle it, so one shot is enough ----
// Stitching scroll frames was the obvious way to capture a tall page, and it is wrong here:
// anything that moves with scroll position (a marquee, a parallax image, a pinned panel) sits
// at a different place in each frame, so the joins cut straight through it. Instead, freeze
// the page into one coherent state and take a single shot.
const settled = await page.evalIn(`(() => {
  const notes = [];

  // Animations to their end state, not paused mid-fade. An infinite animation has no end,
  // so pause it where it stands.
  let fin = 0, held = 0;
  for (const a of document.getAnimations()) {
    try { a.finish(); fin++; } catch { a.pause(); held++; }
  }
  notes.push(fin + ' animations finished, ' + held + ' paused');

  // A pinned section reserves a tall scroll track and sticks a panel inside it, driven by
  // scroll progress. Captured beyond the viewport the panel renders at progress 0 — often
  // empty — leaving the track as a blank gap. Without --pin, collapse the track so the gap
  // goes away. With --pin, leave it standing: step 3b pastes a real frame of the panel in.
  let collapsed = 0;
  if (${pinAt === null}) {
    for (const el of document.body.querySelectorAll('*')) {
      if (getComputedStyle(el).position !== 'sticky') continue;
      const track = el.parentElement;
      if (!track) continue;
      const own = el.getBoundingClientRect().height;
      if (own > 0 && track.getBoundingClientRect().height > own * 1.2) {
        track.style.setProperty('height', Math.ceil(own) + 'px', 'important');
        collapsed++;
      }
    }
  }
  notes.push(collapsed + ' pinned tracks collapsed');

  // A reveal-footer is fixed behind the page and shows through at the bottom. Beyond the
  // viewport it would float wherever the viewport is, so return it to the document flow and
  // let it land at the end where a visitor meets it.
  let freed = 0;
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && el.getBoundingClientRect().height >= 300) {
      el.style.setProperty('position', 'static', 'important');
      freed++;
    }
  }
  notes.push(freed + ' tall fixed blocks returned to flow');

  return notes.join('; ');
})()`);
log(settled);
await sleep(1500);

// ---- 3b. one good frame of each pinned panel ----
// A pinned section reserves a tall scroll track and sticks a panel inside it, then drives
// that panel from scroll progress. Captured beyond the viewport it renders at progress 0 —
// usually empty — which is the blank gap. So shoot each panel where it is actually showing
// something, mid-track, and paste that frame back over the gap afterwards. The seams land
// inside the track's own dead space, where nothing moves, so nothing tears.
const tracks = pinAt === null ? '[]' : await page.evalIn(`JSON.stringify([...document.body.querySelectorAll('*')]
  .filter(el => getComputedStyle(el).position === 'sticky' && el.parentElement)
  .map(el => {
    const track = el.parentElement, r = track.getBoundingClientRect();
    return { top: Math.round(r.top + scrollY), height: Math.round(r.height),
             name: track.tagName.toLowerCase() + (track.className ? '.' + String(track.className).split(' ')[0] : '') };
  })
  .filter(t => t.height > ${H} * 1.2))`);

const patches = [];
for (const t of JSON.parse(tracks || '[]')) {
  // Mid-track: far enough in that the panel has something to show, not so far that it is
  // already animating out.
  const y = Math.round(t.top + (t.height - H) * pinAt);
  await page.evalIn(`scrollTo({top:${'${y}'}, behavior:'instant'}); 1`);
  await sleep(900);
  await until(imagesInView, 15000, `images at ${'${y}'}`);
  const f = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (f?.data) { patches.push({ y, data: f.data }); log('pinned panel', t.name, 'shot at', y); }
}
await page.evalIn(`scrollTo({top:0, behavior:'instant'}); 1`);
await sleep(800);

// ---- 4. one shot of the whole thing, pinned panels pasted back in ----
// Measure after the collapse has reflowed, not before: scrolling to the new bottom forces
// layout and gives the real document height, which is what keeps the footer in frame.
// Skipped when clipping to the top: that round trip leaves scroll-driven heroes in their
// scrolled-past state (Optimus's headline vanished), and a clipped capture never needs the
// true full height anyway.
if (!topPx) {
  await page.evalIn(`scrollTo({top: document.body.scrollHeight, behavior:'instant'}); 1`);
  await sleep(1200);
  await until(imagesInView, 15000, 'images at the new bottom');
  await page.evalIn(`scrollTo({top:0, behavior:'instant'}); 1`);
  await sleep(1500);
}
const full = await page.evalIn(`Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.getBoundingClientRect().height)`);
const height = Math.round(topPx ? Math.min(full, topPx) : full);
log('height after settling', full, topPx ? `(clipped to ${height})` : '');
const base = await page.send('Page.captureScreenshot', {
  format: patches.length ? 'png' : 'webp', quality: 82, captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: W, height, scale: 1 },
}, 90000);
if (!base?.data) { log('capture returned nothing'); process.exit(1); }

if (!patches.length) {
  writeFileSync(out, Buffer.from(base.data, 'base64'));
  page.close();
  console.log(`${out}  ${W}x${height}`);
  process.exit(0);
}

page.close();
// ponytail: compositing is done by handing the layers back to Chrome as one HTML page and
//           shooting it, so there is no image library here. Reach for sharp only if this
//           ever needs real blending.
const layers = [`<img src="data:image/png;base64,${base.data}" style="position:absolute;top:0;left:0;width:${W}px">`]
  .concat(patches.map(p => `<img src="data:image/png;base64,${p.data}" style="position:absolute;top:${p.y}px;left:0;width:${W}px">`))
  .join('');
const stackFile = out + '.stack.html';
writeFileSync(stackFile, `<!DOCTYPE html><html><body style="margin:0;background:#fff;width:${W}px;height:${height}px;position:relative">${layers}</body></html>`);

const stack = await open(pathToFileURL(stackFile).href);
await sleep(3000);
const shot = await stack.send('Page.captureScreenshot', {
  format: 'webp', quality: 82, captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: W, height, scale: 1 },
}, 90000);
if (!shot?.data) { log('compositing returned nothing'); process.exit(1); }
writeFileSync(out, Buffer.from(shot.data, 'base64'));
stack.close();
unlinkSync(stackFile);
console.log(`${out}  ${W}x${height}  ${patches.length} pinned panel(s) pasted in`);
process.exit(0);
