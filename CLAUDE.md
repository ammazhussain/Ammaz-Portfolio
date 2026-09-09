# Ammaz Portfolio — agent instructions

A single-page portfolio. No build step, no dependencies, no framework. Open
`index.html` in a browser and it runs.

On desktop the page does not scroll. Scrolling is intercepted and drives a
virtual scroll engine that moves a timeline of projects along concentric arcs.
Below 960px the arc is thrown away and the browser scrolls a plain card list.

---

## File structure

| File | Owns |
|---|---|
| `index.html` | Markup only. Static chrome: header, left column, the desktop card shell, the three panels, the close button. Every dynamic node is created in JS. No inline styles, no inline scripts. |
| `css/styles.css` | All styling. Tokens in `:root`, the `@media (max-width:960px)` mobile block, the reduced-motion block. |
| `js/main.js` | The scroll engine, arc geometry, the frame loop, card painting, the mobile list, and the panels. |
| `data/projects.js` | The project list. A plain `const PROJECTS = [...]`, loaded before `main.js`. |
| `README.md` | Human-facing: how to add a project, what each field does. |

`index.html` loads them as `css/styles.css`, `data/projects.js`, `js/main.js`,
in that order, both scripts `defer`. **`data/projects.js` must load before
`js/main.js`** — `main.js` reads `PROJECTS` at top level with no guard.

The directory layout and the paths in `index.html` must agree. If you flatten
the files to the root or move them again, change both — a mismatch renders an
unstyled, scriptless page with no console error to point at the cause.

---

## The virtual scroll engine (`js/main.js`)

Native page scroll is **not used on desktop**. `html, body { overflow: hidden }`
and the whole document is one viewport tall. Movement comes from one number.

```
wheel / touch / arrow keys  ->  target  ->  (eased each frame)  ->  u  ->  toIndex(u)  ->  everything
```

- **`target`** — where the timeline is heading. Set directly by input.
- **`u`** — where it actually is. Chases `target` every frame.
- **`toIndex(u)`** — maps scroll units to a *continuous* project index (2.37 is
  a real position, 37% of the way from project 2 to project 3). Every visual is
  a function of this fractional index, which is why the whole thing reads as
  smooth rather than stepped.

### Input capture

```js
addEventListener('wheel', e => {
  if (isMobile() || locked()) return;
  e.preventDefault();
  nudge(e.deltaY * 0.0021);
}, { passive: false });
```

`{ passive: false }` is mandatory — without it the browser ignores
`preventDefault()` and the page scrolls underneath you. `locked()` reads
`document.body.dataset.locked`, set while a panel is open, so panels get native
scrolling back.

**Every input handler is gated on `isMobile()`** (`innerWidth <= 960`), because
below that width the arc is hidden and the browser owns scrolling: wheel, the
three touch handlers, and the arrow/Page/Space branch of `keydown`. A handler
that captures input without that guard makes the mobile page unscrollable for
that input device. `Escape` is deliberately checked *before* the guard, so
closing a panel works at every width.

Touch uses `touchstart` / `touchmove` / `touchend` at `0.0055` per pixel.

After 150ms of no input, an idle timer snaps `target` to `nearestAnchor(target)`
so you always come to rest on a project rather than between two.

### Frame-rate independent damping

```js
dt = Math.min(dt, 0.05);                    // clamp after a tab stall
const k = reduce ? 1 : 1 - Math.exp(-7.5 * dt);
u += (target - u) * k;
if (Math.abs(target - u) < 0.0003) u = target;
```

This is the important line. A naive `u += (target - u) * 0.1` moves twice as
fast on a 120Hz display as on a 60Hz one, and lurches after a dropped frame.
The exponential form makes `k` a function of *elapsed time*, so the feel is
identical at any refresh rate and a long frame catches up in one step instead
of stuttering. `7.5` is the stiffness — higher is snappier.

**Keep the `dt` clamp.** Without it, returning to a backgrounded tab produces
one enormous `dt`, `k` saturates at 1, and the arc teleports.

The `0.0003` epsilon parks `u` exactly on `target` so the loop stops doing
sub-pixel work forever.

---

## Arc geometry

Every ring is a full circle, absolutely positioned, most of it below the fold.
Per frame, for ring `i` at continuous index `idx`:

```js
const cx = W * 0.56, cy = H * 1.30;     // centre — 30% of a viewport below the bottom edge
const base = H * 0.62, gap = H * 0.30;
const drift = Math.sin(t * 0.16) * 7;   // always-on breathing, +/-7px

const d = i - idx;
const r = base + d * gap + drift;
```

- **The centre sits below the viewport** (`cy = H * 1.30`), so only the top of
  each circle is visible — that visible cap is the "arc".
- **Radius is relative to the current index**, not absolute. Scroll forward and
  every `d` decreases, so every ring shrinks toward the centre and the next one
  arrives from outside. The system breathes rather than translating.
- The active project is the ring where `d` is near 0, i.e. radius near `base`.
- `r < 40` — the ring is hidden rather than drawn as a dot.

**Everything is tuned against viewport height**, never against pixels. `0.62`
and `0.30` are fractions of `H` on purpose: the arc keeps its proportions from
a laptop to a large monitor. A hardcoded pixel radius here will look right on
exactly one screen.

Labels ride their own ring at the angle from the project's `ang` field
(degrees from vertical, negative = left):

```js
const a  = PROJECTS[i].ang * Math.PI / 180;
const lx = cx + Math.sin(a) * r;
const ly = cy - Math.cos(a) * r;
```

Labels then pass through a **gate**: they fade out across a 90px band before
they would collide with the left text column (`W * 0.42`), the right card
(`W - min(W * 0.33, 440) - 110`), or the header (`ly < 96`). They dissolve,
they never pop. Opacity uses smoothstep (`x*x*(3-2*x)`) rather than a linear
ramp — that is what makes the fades read as motion instead of a dimmer switch.

---

## Weighted scroll

Projects are **not** evenly spaced on the scroll axis. Each carries a `w`
(weight) field and the axis is built from a running sum:

```js
const anchors = [0];
for (let i = 1; i < N; i++) anchors[i] = anchors[i-1] + PROJECTS[i-1].w;
const U_MAX = anchors[N-1];
```

`w: 1` is normal. `w: 2` means that project takes twice as much scrolling to
pass through — use it for a year with more to say. `toIndex()` interpolates
inside whichever anchor span `u` currently falls in, so the mapping stays
continuous across mixed weights.

Consequences to respect:

- `U_MAX` is derived, never hardcoded. Adding a project or changing a `w`
  changes the length of the scroll axis automatically.
- Arrow keys and the idle snap both work in anchor space, so they land on
  projects regardless of weighting.

---

## `data/projects.js` is the single source of truth

Both renderers read the same array:

- **Desktop** — `paint(i)` fills the fixed card (`#pTitle`, `#pDom`, `#stack`,
  `#cNum`, and either the image or a coloured initials placeholder).
- **Mobile** — the `.mlist` cards are generated in the same file from the same
  loop.

**Never let the two diverge.** Adding a field means teaching both renderers
about it, or neither. Do not add a project to the mobile list by hand, do not
special-case one project in one renderer, and do not introduce a second data
file. If a project should appear in one view only, that is a field on the
project, not a fork of the code.

Fields: `year`, `name` (arc label), `title`, `dom`, `stack`, `ang`, `w`,
`img` (empty string gives the initials placeholder on colour `c`), `c`, and an
optional `url` (mobile CTA only; falls back to `#`).

---

## Mobile

Below 960px the arc, hint and counter are hidden
(`.sky, .hint, .count, .card { display:none }`) and `.mlist` switches from
`display:none` to `display:grid`.

### Known trap: `touch-action`

```css
html, body { height:100%; overflow:hidden; }      /* desktop: one viewport, no page scroll */
body       { touch-action:none; }                 /* desktop: the arc owns touch */

@media (max-width:960px){
  html, body { height:auto; min-height:100%;
               overflow:auto; touch-action:auto; overscroll-behavior:auto; }
}
```

Three desktop-only decisions live at the top of the stylesheet, and **all three
must be undone in the mobile query**:

- `touch-action: none` is what lets the desktop touch handlers drive the arc
  without the browser also scrolling. If the reset is removed, reordered out of
  the query, or overridden by a later rule, the mobile page cannot be scrolled
  by touch at all — it looks like a frozen screenshot, with no console error
  and nothing wrong in the JS.
- `overflow: hidden` likewise: without `overflow:auto` there is no mobile
  scrolling by any means.
- `height: 100%` is the subtle one. Reset `overflow` but leave the height and
  the page *does* scroll, so it looks fixed — but `<body>` becomes a nested
  scroll box inside a viewport-height `<html>` instead of the document
  scrolling. `window.scrollY` then stays 0 forever, `window.scrollTo()` and
  `scrollIntoView()` silently do nothing, and iOS loses URL-bar auto-hide.
  `height:auto; min-height:100%` is the fix.

This block is the single most likely way to break this site. After any change
to it, check at a narrow viewport that `document.documentElement.scrollHeight`
is greater than `window.innerHeight` and that `window.scrollTo(0,500)` actually
moves `window.scrollY`.

### `--mgap`

```css
@media (max-width:960px){ :root{ --mgap:26px } }
@media (max-width:420px){ :root{ --mgap:20px } }
```

`--mgap` is **the** mobile side margin — header, hero, list and panels all use
it, which is why their left and right edges line up. Do not hardcode side
padding on a mobile block; use `var(--mgap)`. If one element seems to need a
different inset, that is a sign the value should change, not that the element
should opt out.

---

## Accessibility — already working, keep it that way

- **`prefers-reduced-motion`** — two places. CSS kills animations and
  transitions; JS sets `k = 1` so the arc jumps straight to `target` with no
  easing. Both are needed. Anything new that animates must be reachable by the
  CSS block or disabled by the `reduce` flag.
- **Keyboard** — `ArrowDown` / `ArrowRight` / `PageDown` / Space advance one
  project, `ArrowUp` / `ArrowLeft` / `PageUp` go back, all `preventDefault()`ed
  and snapped to anchors. `Escape` closes any open panel and is checked
  *before* the `locked()` guard, so it works while a panel is open.
- **Focus** — `:focus-visible { outline: 1.5px solid var(--bronze); outline-offset: 4px }`
  is global. Never remove an outline without replacing it with a visible
  equivalent. `openPanel()` focuses the panel itself (`tabindex="-1"`), not the
  close button, so focus is never sent to an element mid-fade.
- Panels carry `aria-hidden`, toggled in both `openPanel()` and `closeAll()`.
  Keep it in sync with the `.open` class.

---

## Conventions

- **No dependencies, no build step.** Fonts come from Google Fonts; everything
  else is local. Keep it that way — the site is meant to be opened from a file
  or served as static files with nothing in between.
- **Colours are tokens.** They live in `:root`. Do not write a hex value in a
  rule; the only exceptions already in the file are the atmosphere blobs and
  the ring highlight colour.
- **The frame loop writes, it does not build.** `frame()` runs 60+ times a
  second. It sets styles and nothing else — no DOM creation, no layout reads,
  no allocation in the hot path.
- **Smoothstep, not linear.** Every fade and dip in `main.js` uses
  `x*x*(3-2*x)`. Match it for anything new.
- `card` is referenced inside `frame()` but declared further down the file with
  `const`. That is safe only because the first `requestAnimationFrame` callback
  runs after the script finishes. Do not call `frame()` synchronously.
