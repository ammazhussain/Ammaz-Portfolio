# Ammaz Hussain — Portfolio

<https://github.com/ammazhussain/Ammaz-Portfolio>

A single-page portfolio. On desktop, scrolling moves through a timeline of
projects laid out on concentric arcs. On mobile the arc is replaced by a
scrollable card list.

No build step, no dependencies. Open `index.html` in a browser.

## Structure

```
index.html          markup only
css/styles.css      all styling
js/main.js          scroll engine, arc maths, panels, mobile list
data/projects.js    the project list — edit this to add work
```

## Adding a project

Add an entry to `PROJECTS` in `data/projects.js`. Fields:

| field | what it does |
|---|---|
| `year`  | shown on the arc label |
| `name`  | short line under the year on the arc |
| `title` | project name on the card |
| `dom`   | domain / role line, e.g. `Fintech · Front-end` |
| `stack` | the tag over the image |
| `ang`   | where the label sits on its arc, in degrees from vertical. Negative is left. Adjust if two labels overlap. |
| `w`     | scroll weight. `1` is normal. Set `2` or `3` for a year with several projects so it takes longer to scroll past. |
| `img`   | path to a screenshot. Leave `""` to fall back to a tinted block with the initials. |
| `c`     | the fallback block colour |

Both the desktop arc and the mobile list read from this one array, so
they can never fall out of sync.

## Things to know before editing

- **Scroll is virtual on desktop.** `wheel` is intercepted and
  `preventDefault()`ed; a `target` value is eased toward by `u` every frame.
  Nothing uses native page scroll above 960px.
- **`touch-action: none` is set on `body`** so the arc can own touch input,
  and is explicitly reset to `auto` in the mobile media query. If mobile
  scrolling ever breaks, check that override first.
- **`--mgap`** is the single mobile side margin. Change it in one place.
- Arc geometry lives in the frame loop: `base` and `gap` control ring radii,
  `cx`/`cy` the arc centre. They are tuned against viewport height.

## Deploying

No build step, so any static host works.

**GitHub Pages** — Settings → Pages → Source: *Deploy from a branch*,
branch `main`, folder `/ (root)`. The site will be at:

```
https://ammazhussain.github.io/Ammaz-Portfolio/
```

All asset paths in `index.html` are relative (`css/styles.css`, not
`/css/styles.css`), so it works from that subpath without changes. If you
later move to a custom domain at the root, they still work.

**Netlify / Vercel** — connect the repo, leave the build command empty,
publish directory `.`

## Note: this repo is public

Anything committed here is visible to anyone. Keep out:

- client files, screenshots you don't have permission to publish
- real pricing you'd rather negotiate privately
- any API keys or credentials (`.env` is gitignored — keep it that way)

## To do

- [ ] Replace placeholder copy — tagline, pricing, contact email
- [ ] Add real screenshots and set `img` on each project
- [ ] Add `cv.pdf` to the repo root (the Career panel links to it)
- [ ] Give each project a case study page and set a `url` field
